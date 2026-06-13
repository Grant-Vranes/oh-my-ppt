import type { PPTDatabase } from './db/database'
import path from 'path'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { BaseLanguageModel } from '@langchain/core/language_models/base'
import { createMiddleware } from 'langchain'
import {
  CompositeBackend,
  FilesystemBackend,
  GENERAL_PURPOSE_SUBAGENT,
  createDeepAgent,
  createSkillsMiddleware,
  type EditResult,
  type WriteResult
} from 'deepagents'
import log from 'electron-log/main.js'
import {
  DEFAULT_MODEL_TEMPERATURE,
  getCurrentModelTemperatureControl,
  isCurrentModelTemperatureEnabled,
  resolveCurrentModelTemperatureOptions
} from './model-runtime'
import { createSessionBoundDeckTools, type SessionDeckGenerationContext } from './tools'
import { buildDeckAgentSystemPrompt, buildEditAgentSystemPrompt } from './prompt'
import {
  PRODUCT_SKILLS_ROUTE,
  REQUIRED_PRODUCT_SKILL_NAMES,
  type RequiredProductSkillName,
  getInstalledSkillsPath,
  getSystemSkillsSourcePath,
  waitForSkillsReady
} from './skills'

export {
  SHARED_PAGE_STYLES_START,
  SHARED_PAGE_STYLES_END,
  pageContentStartMarker,
  pageContentEndMarker
} from './tools'
export type { SessionDeckGenerationContext } from './tools'
export {
  buildPlanningSystemPrompt,
  buildDeckGenerationPrompt,
  buildSinglePageGenerationPrompt
} from './prompt'

// ── Type definitions for DeepAgent ──

export interface DeepAgentStreamResult {
  stream: (...args: any[]) => Promise<AsyncIterable<unknown>>
}

interface AgentSessionEntry {
  agent: DeepAgentStreamResult | null
  /** Per-page agents for concurrent generation (keyed by pageId). */
  pageAgents: Map<string, DeepAgentStreamResult>
  abortController: AbortController
  projectDir: string
  provider: string
  model: string
  baseUrl?: string
  temperature?: number
}

class GuardedFilesystemBackend extends FilesystemBackend {
  constructor(
    options: { rootDir?: string; virtualMode?: boolean; maxFileSizeMb?: number } & {
      disableEditFile?: boolean
      disableWriteFile?: boolean
      editBlockedReason?: string
      writeBlockedReason?: string
    }
  ) {
    super(options)
    this.disableEditFile = Boolean(options.disableEditFile)
    this.disableWriteFile = Boolean(options.disableWriteFile)
    this.editBlockedReason =
      options.editBlockedReason ||
      '当前任务禁止调用 edit_file。请使用 update_single_page_file(pageId, content) 或 update_page_file(pageId, content)。'
    this.writeBlockedReason =
      options.writeBlockedReason || '当前任务禁止调用 write_file。请使用受控的页面写入工具。'
  }

  private readonly disableEditFile: boolean
  private readonly disableWriteFile: boolean
  private readonly editBlockedReason: string
  private readonly writeBlockedReason: string

  async write(filePath: string, content: string): Promise<WriteResult> {
    if (this.disableWriteFile) {
      return { error: this.writeBlockedReason }
    }
    return super.write(filePath, content)
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean
  ): Promise<EditResult> {
    if (this.disableEditFile) {
      return { error: this.editBlockedReason }
    }
    return super.edit(filePath, oldString, newString, replaceAll)
  }
}

class ReadOnlyFilesystemBackend extends FilesystemBackend {
  async write(filePath: string, _content: string): Promise<WriteResult> {
    return { error: `Product skills are read-only: ${filePath}` }
  }

  async edit(
    filePath: string,
    _oldString: string,
    _newString: string,
    _replaceAll?: boolean
  ): Promise<EditResult> {
    return { error: `Product skills are read-only: ${filePath}` }
  }
}

class FilteredReadOnlySkillsBackend extends ReadOnlyFilesystemBackend {
  constructor(
    options: { rootDir?: string; virtualMode?: boolean; maxFileSizeMb?: number } & {
      allowedSkillNames: readonly string[]
    }
  ) {
    super(options)
    this.allowedSkillNames = new Set(options.allowedSkillNames)
  }

  private readonly allowedSkillNames: Set<string>

  async ls(dirPath: string) {
    const result = await super.ls(dirPath)
    if (result.error || !result.files) return result
    return {
      ...result,
      files: result.files.filter((file) => {
        const normalized = file.path.replace(/\\/g, '/').replace(/\/$/, '')
        const name = normalized.split('/').filter(Boolean).pop() || ''
        return !file.is_dir || this.allowedSkillNames.has(name)
      })
    }
  }
}

function shouldBlockNativeEditFile(context: SessionDeckGenerationContext): boolean {
  if (context.editScope === 'presentation-container') return true
  return !Boolean(context.selectedSelector?.trim())
}

function shouldBlockNativeWriteFile(context: SessionDeckGenerationContext): boolean {
  // Every edit scope has a narrower write path with scope and validation enforcement:
  // selector -> edit_file, page -> update_single_page_file,
  // deck -> update_page_file, container -> set_index_transition.
  return context.mode === 'edit'
}

const SKILLS_READY_TIMEOUT_MS = 3000

function waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs)
    })
  ])
}

function createSkillsReadyMiddleware(
  backend: CompositeBackend,
  skillSource: string,
  scope: string,
  requiredSkillNames: readonly RequiredProductSkillName[] = REQUIRED_PRODUCT_SKILL_NAMES
) {
  let hasLoggedReadySkills = false
  return createMiddleware({
    name: 'OhMyPptSkillsReadyMiddleware',
    async beforeAgent() {
      const initResult = await waitWithTimeout(waitForSkillsReady(), SKILLS_READY_TIMEOUT_MS)
      if (initResult === null) {
        throw new Error(
          '产品 skill 初始化未完成，无法创建生成/编辑 Agent。请重启应用或检查 resources/skills。'
        )
      }

      const readySkillNames: string[] = []
      for (const skillName of requiredSkillNames) {
        const skillPath = `${skillSource}${skillName}/SKILL.md`
        const readResult = await backend.read(skillPath, 0, 20)
        if (readResult.error) {
          throw new Error(`必需产品 skill 不可用：${skillPath}。${readResult.error}`)
        }
        readySkillNames.push(skillName)
      }

      if (!hasLoggedReadySkills) {
        hasLoggedReadySkills = true
        log.info('[skills] required product skills ready', {
          scope,
          source: skillSource,
          skills: readySkillNames
        })
      }
      return undefined
    }
  })
}

function createProductSkillsMiddlewareSet(
  backend: CompositeBackend,
  skillSource: string,
  scope: string,
  requiredSkillNames: readonly RequiredProductSkillName[] = REQUIRED_PRODUCT_SKILL_NAMES
): any[] {
  return [
    createSkillsReadyMiddleware(backend, skillSource, scope, requiredSkillNames),
    createSkillsMiddleware({
      backend,
      sources: [skillSource]
    })
  ]
}

export function attachProductSkillsBackend(
  projectBackend: FilesystemBackend,
  scope = 'main',
  requiredSkillNames: readonly RequiredProductSkillName[] = REQUIRED_PRODUCT_SKILL_NAMES
): {
  backend: FilesystemBackend | CompositeBackend
  middleware: any[]
  skillSource: string
  enabled: boolean
} {
  const installedSkillsPath = getInstalledSkillsPath()
  if (!installedSkillsPath) {
    throw new Error('产品 skill 运行时路径未初始化，无法创建生成/编辑 Agent。')
  }

  const usesAllProductSkills = requiredSkillNames.length === REQUIRED_PRODUCT_SKILL_NAMES.length
  const skillRoute = usesAllProductSkills
    ? PRODUCT_SKILLS_ROUTE
    : `${PRODUCT_SKILLS_ROUTE}${scope}/`
  const backend = new CompositeBackend(projectBackend, {
    [skillRoute]: usesAllProductSkills
      ? new ReadOnlyFilesystemBackend({
          rootDir: installedSkillsPath,
          virtualMode: true
        })
      : new FilteredReadOnlySkillsBackend({
          rootDir: path.join(
            installedSkillsPath,
            getSystemSkillsSourcePath().replace(/^\/|\/$/g, '')
          ),
          virtualMode: true,
          allowedSkillNames: requiredSkillNames
        })
  })
  const skillSource = usesAllProductSkills
    ? `${PRODUCT_SKILLS_ROUTE}${getSystemSkillsSourcePath().replace(/^\//, '')}`
    : skillRoute

  return {
    backend,
    middleware: createProductSkillsMiddlewareSet(backend, skillSource, scope, requiredSkillNames),
    skillSource,
    enabled: true
  }
}

function createProductGeneralPurposeSubagent(args: {
  model: BaseLanguageModel
  tools: unknown[]
  backend: FilesystemBackend | CompositeBackend
  skillSource: string
}): any[] {
  if (!(args.backend instanceof CompositeBackend)) return []
  return [
    {
      ...GENERAL_PURPOSE_SUBAGENT,
      model: args.model as any,
      tools: args.tools as any,
      middleware: createProductSkillsMiddlewareSet(
        args.backend,
        args.skillSource,
        'general-purpose'
      )
    }
  ]
}

// ── Agent factory ──

export function createSessionEditAgent(args: {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  styleId?: string | null
  context: SessionDeckGenerationContext
}): DeepAgentStreamResult {
  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    args.temperature,
    args.maxTokens
  )
  const context: SessionDeckGenerationContext = {
    ...args.context,
    provider: args.provider,
    model: args.model
  }
  const disableNativeEditFile = shouldBlockNativeEditFile(context)
  const disableNativeWriteFile = shouldBlockNativeWriteFile(context)
  const backend = new GuardedFilesystemBackend({
    rootDir: context.projectDir,
    virtualMode: true,
    disableEditFile: disableNativeEditFile,
    disableWriteFile: disableNativeWriteFile,
    editBlockedReason: disableNativeEditFile
      ? '当前编辑任务禁止使用 edit_file。请改用 update_single_page_file(pageId, content) 或 update_page_file(pageId, content)。'
      : undefined,
    writeBlockedReason:
      '当前编辑任务禁止使用 write_file。请使用 update_single_page_file(pageId, content)、update_page_file(pageId, content) 或允许的 edit_file。'
  })
  const agentBackend = attachProductSkillsBackend(backend)
  const tools = createSessionBoundDeckTools(context)
  const systemPrompt = buildEditAgentSystemPrompt(args.styleId, context)
  const hasSelector = Boolean(context.selectedSelector?.trim())
  const isDeckEdit = context.mode === 'edit' && context.editScope === 'deck'
  const isContainerEdit = context.mode === 'edit' && context.editScope === 'presentation-container'
  const promptMode = isContainerEdit
    ? 'container'
    : hasSelector
      ? 'selector'
      : isDeckEdit
        ? 'deck'
        : 'single-page'

  log.info('[deepagent] create session edit agent', {
    sessionId: context.sessionId,
    provider: args.provider,
    model: args.model,
    styleId: args.styleId || '',
    projectDir: context.projectDir,
    indexPath: context.indexPath,
    selectedPageId: context.selectedPageId,
    disableNativeEditFile,
    disableNativeWriteFile,
    promptMode,
    skillsEnabled: agentBackend.enabled
  })

  return createDeepAgent({
    model: model as any,
    backend: agentBackend.backend,
    systemPrompt,
    tools: tools as any,
    middleware: agentBackend.middleware as any,
    subagents: createProductGeneralPurposeSubagent({
      model,
      tools,
      backend: agentBackend.backend,
      skillSource: agentBackend.skillSource
    })
  })
}

export function createSessionDeckAgent(args: {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  styleId?: string | null
  context: SessionDeckGenerationContext
  systemPromptAddendum?: string
}): DeepAgentStreamResult {
  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    args.temperature,
    args.maxTokens
  )
  const context: SessionDeckGenerationContext = {
    ...args.context,
    provider: args.provider,
    model: args.model
  }
  const backend = new GuardedFilesystemBackend({
    rootDir: context.projectDir,
    virtualMode: true,
    disableEditFile: true,
    editBlockedReason: context.templatePageReadRequired
      ? '当前模板生成任务禁止使用 edit_file。请使用 update_template_page_file(pageId, content)。'
      : '当前生成/全局编辑任务禁止使用 edit_file。请使用 update_single_page_file(pageId, content) 或 update_page_file(pageId, content)。'
  })
  const agentBackend = attachProductSkillsBackend(backend)
  const getToolName = (tool: unknown): string => {
    const maybe = tool as { name?: unknown; lc_kwargs?: { name?: unknown } }
    if (typeof maybe.name === 'string') return maybe.name
    if (typeof maybe.lc_kwargs?.name === 'string') return maybe.lc_kwargs.name
    return ''
  }
  const tools = createSessionBoundDeckTools(context)
  const systemPrompt = [
    buildDeckAgentSystemPrompt(args.styleId, context),
    args.systemPromptAddendum?.trim() || ''
  ]
    .filter(Boolean)
    .join('\n\n')

  log.info('[deepagent] create session deck agent', {
    sessionId: context.sessionId,
    provider: args.provider,
    model: args.model,
    styleId: args.styleId || '',
    projectDir: context.projectDir,
    indexPath: context.indexPath,
    selectedPageId: context.selectedPageId,
    skillsEnabled: agentBackend.enabled,
    selectedPagePath:
      context.selectedPageId && context.pageFileMap[context.selectedPageId]
        ? context.pageFileMap[context.selectedPageId]
        : '',
    totalPages: context.outlineTitles.length,
    toolNames: tools.map((tool) => getToolName(tool)).filter((name) => name.length > 0)
  })

  return createDeepAgent({
    model: model as any,
    backend: agentBackend.backend,
    systemPrompt,
    tools: tools as any,
    middleware: agentBackend.middleware as any,
    subagents: createProductGeneralPurposeSubagent({
      model,
      tools,
      backend: agentBackend.backend,
      skillSource: agentBackend.skillSource
    })
  })
}

// ── Model resolution ──

export { DEFAULT_MODEL_TEMPERATURE, isCurrentModelTemperatureEnabled }

const resolveOpenAICompatibilityModelKwargs = (
  baseUrl?: string
): { modelKwargs: Record<string, unknown>; compatibilityFlags: string[] } => {
  if (!baseUrl) {
    return { modelKwargs: {}, compatibilityFlags: [] }
  }

  return {
    modelKwargs: { thinking: { type: 'disabled' } },
    compatibilityFlags: ['thinking.type=disabled']
  }
}

export function resolveModel(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
  temperature?: number,
  maxTokens?: number
): BaseLanguageModel {
  const resolvedModel = model.trim()
  if (!resolvedModel) {
    throw new Error('model 不能为空，请先在系统设置中配置模型。')
  }
  const temperatureOptions = resolveCurrentModelTemperatureOptions(temperature)
  const resolvedTemperature = temperatureOptions.temperature
  const temperatureControl = getCurrentModelTemperatureControl()
  const resolvedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  const resolvedMaxTokens = maxTokens && maxTokens > 0 ? maxTokens : 4096
  const { modelKwargs, compatibilityFlags } = resolveOpenAICompatibilityModelKwargs(resolvedBaseUrl)

  log.info('[llm] resolveModel', {
    provider,
    model: resolvedModel,
    baseUrl: resolvedBaseUrl,
    temperature: resolvedTemperature ?? null,
    temperatureEnabled: isCurrentModelTemperatureEnabled(),
    temperatureControlBound: temperatureControl !== undefined,
    modelConfigId: temperatureControl?.modelConfigId ?? null,
    maxTokens: resolvedMaxTokens,
    openAICompatibility: compatibilityFlags
  })

  switch (provider) {
    case 'openai':
      return new ChatOpenAI({
        model: resolvedModel,
        apiKey,
        ...temperatureOptions,
        maxTokens: resolvedMaxTokens,
        configuration: resolvedBaseUrl ? { baseURL: resolvedBaseUrl } : undefined,
        modelKwargs
      })
    case 'anthropic':
      return new ChatAnthropic({
        model: resolvedModel,
        apiKey,
        ...temperatureOptions,
        maxTokens: resolvedMaxTokens,
        anthropicApiUrl: resolvedBaseUrl || undefined
      })
    case 'google':
      return new ChatGoogleGenerativeAI({
        model: resolvedModel,
        apiKey,
        ...temperatureOptions,
        maxOutputTokens: resolvedMaxTokens,
        baseUrl: resolvedBaseUrl || undefined
      })
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// ── Session management ──

export interface AgentSessionConfig {
  sessionId: string
  provider: string
  model: string
  baseUrl?: string
  temperature?: number
  projectDir: string
}

export class AgentManager {
  private agents = new Map<string, AgentSessionEntry>()

  constructor(private db: PPTDatabase) {}

  async createSession(
    config: AgentSessionConfig & {
      topic?: string
      styleId?: string
      pageCount?: number
      referenceDocumentPath?: string | null
    }
  ): Promise<string> {
    const model = config.model.trim()
    if (!model) {
      throw new Error('创建会话失败：model 不能为空。')
    }
    log.info('[agent] createSession', {
      sessionId: config.sessionId,
      provider: config.provider,
      model,
      topic: config.topic || '',
      styleId: config.styleId || '',
      pageCount: config.pageCount || null,
      projectDir: config.projectDir
    })

    const sessionId = await this.db.createSession({
      id: config.sessionId,
      title: `PPT: ${config.topic || 'Untitled'}`,
      topic: config.topic,
      styleId: config.styleId,
      pageCount: config.pageCount,
      referenceDocumentPath: config.referenceDocumentPath,
      provider: config.provider,
      model
    })

    this.agents.set(sessionId, {
      agent: null,
      pageAgents: new Map(),
      abortController: new AbortController(),
      projectDir: config.projectDir,
      provider: config.provider,
      model,
      baseUrl: config.baseUrl,
      temperature: config.temperature
    })

    return sessionId
  }

  getAgent(sessionId: string) {
    return this.agents.get(sessionId)
  }

  setAgent(sessionId: string, agent: DeepAgentStreamResult) {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.agent = agent
  }

  clearAgent(sessionId: string) {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.agent = null
  }

  /** Store a per-page agent for concurrent generation. Does not overwrite the main agent. */
  setPageAgent(sessionId: string, pageId: string, agent: DeepAgentStreamResult) {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.pageAgents.set(pageId, agent)
  }

  removePageAgent(sessionId: string, pageId: string) {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.pageAgents.delete(pageId)
  }

  ensureSession(config: {
    sessionId: string
    provider: string
    model: string
    baseUrl?: string
    temperature?: number
    projectDir: string
  }) {
    const existing = this.agents.get(config.sessionId)
    if (existing) {
      existing.provider = config.provider
      existing.model = config.model
      existing.baseUrl = config.baseUrl
      existing.temperature = config.temperature
      existing.projectDir = config.projectDir
      log.info('[agent] ensureSession hit existing', {
        sessionId: config.sessionId,
        provider: existing.provider,
        model: existing.model,
        baseUrl: existing.baseUrl || '',
        temperature: existing.temperature ?? null,
        projectDir: existing.projectDir
      })
      return existing
    }

    const model = config.model.trim()
    if (!model) {
      throw new Error('恢复会话失败：model 不能为空。')
    }
    const entry = {
      agent: null,
      pageAgents: new Map<string, DeepAgentStreamResult>(),
      abortController: new AbortController(),
      projectDir: config.projectDir,
      provider: config.provider,
      model,
      baseUrl: config.baseUrl,
      temperature: config.temperature
    }

    log.info('[agent] ensureSession create entry', {
      sessionId: config.sessionId,
      provider: entry.provider,
      model,
      baseUrl: entry.baseUrl || '',
      temperature: entry.temperature ?? null,
      projectDir: entry.projectDir
    })

    this.agents.set(config.sessionId, entry)
    return entry
  }

  beginRun(sessionId: string) {
    const entry = this.agents.get(sessionId)
    if (!entry) {
      log.warn('[agent] beginRun missing session', { sessionId })
      return null
    }
    entry.abortController = new AbortController()
    log.info('[agent] beginRun', {
      sessionId,
      provider: entry.provider,
      model: entry.model,
      projectDir: entry.projectDir
    })
    return entry
  }

  cancelSession(sessionId: string): boolean {
    const entry = this.agents.get(sessionId)
    if (entry) {
      entry.abortController.abort()
      entry.agent = null
      entry.pageAgents.clear()
      log.info('[agent] cancelSession', { sessionId })
      return true
    }
    log.warn('[agent] cancelSession missing session', { sessionId })
    return false
  }

  removeSession(sessionId: string): void {
    const entry = this.agents.get(sessionId)
    if (entry) {
      entry.abortController.abort()
      entry.agent = null
      entry.pageAgents.clear()
    }
    this.agents.delete(sessionId)
    log.info('[agent] removeSession', { sessionId })
  }
}
