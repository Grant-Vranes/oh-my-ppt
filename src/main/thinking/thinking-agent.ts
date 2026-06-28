import { LRUCache } from 'lru-cache'
import log from 'electron-log/main.js'
import { createMiddleware } from 'langchain'
import { resolveModel } from '../agent'
import { FilesystemBackend, createDeepAgent } from 'deepagents'
import { extractModelText } from '../ipc/utils'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import { logAgentToolEvents } from '../utils/agent-tool-logger'
import { buildThinkingContext, type ThinkingContextArgs } from './context-builder'
import { findUnsupportedPrecisionClaims, type CredibilityIssue } from './content-credibility'
import { routeThinkingIntent, type ThinkingIntentRoute } from './intent-router'
import { normalizeThinkingAssistantReply } from './reply-normalizer'
import { createThinkingToolInputRecoveryMiddleware } from './tool-error-recovery'
import {
  checkStageTransition,
  isValidTransition,
  isRestartRequest,
  resolveRequestedStage
} from './stage-manager'
import { buildInitialContextMd, buildInitialThinkingMd, writeContextMd, writeThinkingMd } from './workspace'
import {
  createThinkingWorkflowTools,
  type StagedThinkingFinalizeResult,
  type ThinkingWorkflowState
} from './thinking-tools'
import type { ThinkingStage, ThinkingChatResult } from '@shared/thinking'

interface ThinkingRuntime {
  agent: ReturnType<typeof createDeepAgent>
  workflowState: ThinkingWorkflowState
  finalizeStagedThinkingDocument: (options?: {
    discardIncomplete?: boolean
  }) => Promise<StagedThinkingFinalizeResult>
}

const THINKING_WORKFLOW_TOOL_NAMES = new Set([
  'update_context_document',
  'update_thinking_document'
])

const SOURCE_READ_TOOL_NAMES = ['read_file', 'grep'] as const

function createThinkingToolAllowlistMiddleware(allowedToolNames: Set<string>) {
  return createMiddleware({
    name: 'thinkingToolAllowlist',
    wrapModelCall: async (request, handler) => {
      const tools = request.tools?.filter((tool) => allowedToolNames.has(String(tool.name || '')))
      return handler({ ...request, tools })
    }
  })
}

function getThinkingAllowedToolNames(hasSources: boolean): Set<string> {
  return new Set([
    ...THINKING_WORKFLOW_TOOL_NAMES,
    ...(hasSources ? SOURCE_READ_TOOL_NAMES : [])
  ])
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isAssistantMessage(record: Record<string, unknown>): boolean {
  const role = String(record.role || '').toLowerCase()
  const type = String(record.type || '').toLowerCase()
  const constructorName = String(
    getObject(record.lc_kwargs)?.type ?? getObject(record.kwargs)?.type ?? ''
  ).toLowerCase()
  const isAssistant =
    role === 'assistant' || type === 'ai' || type === 'assistant' || constructorName === 'ai'
  const isToolOrHuman =
    role === 'tool' ||
    role === 'user' ||
    role === 'system' ||
    type === 'tool' ||
    type === 'human' ||
    type === 'system'
  return isAssistant && !isToolOrHuman
}

function hasToolCalls(record: Record<string, unknown>): boolean {
  const additional = getObject(record.additional_kwargs)
  const toolCalls = record.tool_calls ?? additional?.tool_calls
  return Array.isArray(toolCalls) && toolCalls.length > 0
}

function buildFallbackReply(args: {
  contextUpdated: boolean
  thinkingUpdated: boolean
  stage: ThinkingStage
}): string {
  if (args.thinkingUpdated) {
    return '我已经更新了内容方案。你可以继续补充要求，或确认后进入生成。'
  }
  if (args.contextUpdated) {
    return '我已经记录了这些需求。你可以继续补充信息，或让我开始整理页面大纲。'
  }
  if (args.stage === 'collect') {
    return '我已收到。请继续补充目标受众、使用场景或素材，我会帮你整理成清晰的大纲。'
  }
  return '我已收到，会继续基于当前方案推进。'
}

function extractAssistantTextsFromState(data: unknown): string[] {
  const texts: string[] = []
  const seen = new Set<object>()

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (seen.has(value as object)) return
    seen.add(value as object)

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    const record = value as Record<string, unknown>
    if (isAssistantMessage(record) && !hasToolCalls(record)) {
      const text = normalizeThinkingAssistantReply(extractModelText(record))
      if (text) texts.push(text)
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }

  visit(data)
  return texts
}

const runtimeCache = new LRUCache<string, ThinkingRuntime>({
  max: 20,
  ttl: 60 * 60 * 1000
})

const SECTION_ORDER = [
  'Stage',
  'Topic',
  'Audience',
  'Setting',
  'Tone',
  'Key Decisions',
  'User Intent',
  'Confirmed Decisions',
  'Open Questions',
  'Source Notes',
  'Latest Direction',
  'Style',
  'Font',
  'Page Count'
]

function upsertSection(markdown: string, heading: string, content: string): string {
  const normalizedContent = content.trim()
  if (!normalizedContent) return markdown
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRegex = new RegExp(`^##\\s*${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`, 'm')
  const nextSection = `## ${heading}\n${normalizedContent}\n\n`
  if (sectionRegex.test(markdown)) {
    return markdown.replace(sectionRegex, nextSection.trimEnd() + '\n\n')
  }

  for (let index = SECTION_ORDER.indexOf(heading) - 1; index >= 0; index -= 1) {
    const previous = SECTION_ORDER[index]
    const previousRegex = new RegExp(`^##\\s*${previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`, 'm')
    const match = markdown.match(previousRegex)
    if (match?.[0]) {
      const insertAt = (match.index || 0) + match[0].length
      return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
    }
  }

  const titleMatch = markdown.match(/^# .+$/m)
  if (titleMatch) {
    const insertAt = (titleMatch.index || 0) + titleMatch[0].length
    return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
  }
  return `# Thinking Brief\n\n${nextSection}${markdown.trim()}`
}

function mergeLatestDirectionIntoContextMd(args: {
  contextMd: string
  currentStage: ThinkingStage
  userMessage: string
}): string {
  let next = args.contextMd.trim() || `# Rolling Context\n\n## Stage: ${args.currentStage}\n`
  if (!/^##\s*Stage:/m.test(next)) {
    next = upsertSection(next, 'Stage', args.currentStage)
  }

  const latestDirection = args.userMessage.trim()
    ? `Latest user input:\n${args.userMessage.trim()}`
    : ''
  if (latestDirection) {
    next = upsertSection(next, 'Latest Direction', latestDirection)
  }

  return next.trimEnd() + '\n'
}

async function collectAgentReply(
  stream: AsyncIterable<unknown>,
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
): Promise<{
  replyText: string
  latestAssistantStateText: string
}> {
  let replyText = ''
  let latestAssistantStateText = ''
  const seenToolEvents = new Set<string>()

  for await (const chunk of stream as AsyncIterable<unknown>) {
    if (!Array.isArray(chunk) || chunk.length < 3) continue
    const mode = chunk[1] as string
    const data = chunk[2]
    if (mode === 'updates') {
      extractAndEmitToolEvents(data, seenToolEvents, onThinkingEvent)
      logAgentToolEvents(data, seenToolEvents, { tag: 'thinking:agent', source: 'updates' })
      const assistantTexts = extractAssistantTextsFromState(data)
      const longestText = assistantTexts.sort((a, b) => b.length - a.length)[0] || ''
      if (longestText.length >= latestAssistantStateText.length) {
        latestAssistantStateText = longestText
      }
      continue
    }
    if (mode !== 'messages' || !Array.isArray(data)) continue
    extractAndEmitToolEvents(data, seenToolEvents, onThinkingEvent)
    logAgentToolEvents(data, seenToolEvents, { tag: 'thinking:agent', source: 'messages' })
    for (const message of data as Array<Record<string, unknown>>) {
      if (!message || typeof message !== 'object') continue
      if (!isAssistantMessage(message) || hasToolCalls(message)) continue
      const content = normalizeThinkingAssistantReply(extractModelText(message))
      if (content) {
        replyText += content
      }
    }
  }

  return { replyText, latestAssistantStateText }
}

/** Extract tool call/result events and emit them for the thinking process UI. */
function extractAndEmitToolEvents(
  data: unknown,
  seen: Set<string>,
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
): void {
  if (!onThinkingEvent) return
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    // Check for tool calls
    const additional = record.additional_kwargs as Record<string, unknown> | undefined
    const toolCalls = record.tool_calls ?? additional?.tool_calls
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        const callRecord = call && typeof call === 'object' ? call as Record<string, unknown> : null
        if (!callRecord) continue
        const fnRecord = callRecord.function && typeof callRecord.function === 'object'
          ? callRecord.function as Record<string, unknown> : null
        const name = String(callRecord.name ?? fnRecord?.name ?? '').trim()
        const id = String(callRecord.id ?? '').trim()
        const rawArgs = callRecord.args ?? fnRecord?.arguments ?? ''
        const key = `tc:${id}:${name}`
        if (name && id && !seen.has(key)) {
          seen.add(key)
          const summary = summarizeToolCall(name, rawArgs)
          if (!summary) continue
          onThinkingEvent({ type: 'tool_call', toolName: name, summary })
        }
      }
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }
  visit(data)
}

function summarizeToolCall(toolName: string, rawArgs: unknown): string {
  if (toolName === 'read_file') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const path = getNestedField(args, 'path') as string | undefined
    if (path) return `正在阅读资料：${path.replace(/^\/sources\//, '')}`
    return '正在阅读资料'
  }
  if (toolName === 'grep') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pattern = getNestedField(args, 'pattern') as string | undefined
    if (pattern) return `正在定位相关内容：${String(pattern).slice(0, 24)}`
    return '正在定位相关内容'
  }
  if (toolName === 'update_thinking_document') {
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs
    const pages = getNestedField(args, 'pages') as Array<Record<string, unknown>> | undefined
    const topic = getNestedField(args, 'topic') as string | undefined
    if (pages && Array.isArray(pages) && pages.length > 0) {
      const titles = pages.map((p) => getNestedField(p, 'title') as string || '').filter(Boolean)
      if (titles.length > 0) return `正在整理 ${pages.length} 页方案：${titles.slice(0, 2).join('、')}${titles.length > 2 ? '…' : ''}`
      return `正在整理 ${pages.length} 页方案`
    }
    if (topic) return `正在确认主题：${String(topic).slice(0, 24)}`
    return '正在更新方案'
  }
  if (toolName === 'update_context_document') {
    return '正在整理需求和关键信息'
  }
  return ''
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

function getNestedField(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  return (obj as Record<string, unknown>)[key]
}

function getThinkingRepairTarget(args: {
  currentStage: ThinkingStage
  rawAgentRequestedStage: ThinkingStage | null
  rawRequestedStage: ThinkingStage | null
  routedIntent: ThinkingIntentRoute
  userMessage: string
}): ThinkingStage | null {
  if (args.rawRequestedStage === 'collect') {
    return null
  }
  if (args.currentStage === 'collect' && args.routedIntent.intent === 'plan_outline') {
    return 'outline'
  }
  if (
    args.rawAgentRequestedStage &&
    args.rawAgentRequestedStage !== 'collect' &&
    isValidTransition(args.currentStage, args.rawAgentRequestedStage)
  ) {
    return args.rawAgentRequestedStage
  }
  if (
    args.rawRequestedStage &&
    isValidTransition(args.currentStage, args.rawRequestedStage)
  ) {
    return args.rawRequestedStage
  }
  return null
}

function buildForcedThinkingUpdateMessage(targetStage: ThinkingStage, fullUserMessage: string): string {
  return [
    `Internal repair task. The previous response did not persist /thinking.md in a form that can enter stage "${targetStage}".`,
    'You must now call update_thinking_document to persist a complete page-by-page thinking brief into /thinking.md.',
    'For large outlines, call update_thinking_document in batches with pageStart and 5-10 pages per call; set commit=true on the final batch only.',
    'Every page must include title, role, objective, summary, and substantive keyPoints.',
    `Then call update_context_document with stage set to "${targetStage}".`,
    'Use read_file/grep first if sources are available and needed.',
    'Do not use write_file or edit_file.',
    'Do not ask the user a new question in this repair task.',
    'After the tool calls, return one concise user-facing reply describing what is ready.',
    '',
    fullUserMessage
  ].join('\n')
}

function buildCredibilityRepairMessage(
  issues: CredibilityIssue[],
  fullUserMessage: string
): string {
  const issueList = issues
    .slice(0, 12)
    .map((issue) => `- Line ${issue.line}: ${issue.text} (${issue.reason})`)
    .join('\n')

  return [
    'Internal repair task. The current /thinking.md contains exact metrics or benchmark claims that are not supported by user-provided text or source files.',
    'You must call update_thinking_document. For large outlines, update affected page ranges in batches with pageStart and set commit=true on the final batch only.',
    'Replace unsupported exact numbers with qualitative, source-needed wording. Preserve user-provided structural values such as topic year, duration, and page count.',
    'Do not add new exact metrics, benchmark scores, prices, percentages, rankings, or version-specific claims.',
    'Then call update_context_document to record that unsupported exact metrics were downgraded or marked as needing sources.',
    'Do not use write_file or edit_file.',
    'After the tool calls, return one concise user-facing reply in the user language.',
    '',
    'Unsupported claims detected:',
    issueList,
    '',
    fullUserMessage
  ].join('\n')
}

async function runAgentMessage(args: {
  runtime: ThinkingRuntime
  message: string
  modelTimeoutMs: number
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
}): Promise<{ replyText: string; latestAssistantStateText: string }> {
  const stream = await args.runtime.agent.stream(
    {
      messages: [
        { role: 'user', content: args.message }
      ]
    },
    {
      streamMode: ['updates', 'messages'],
      subgraphs: true,
      signal: AbortSignal.timeout(resolveModelTimeoutMs(args.modelTimeoutMs, 'agent'))
    }
  )
  return collectAgentReply(stream as AsyncIterable<unknown>, args.onThinkingEvent)
}

function getOrCreateRuntime(
  thinkingId: string,
  thinkingDir: string,
  args: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    maxTokens?: number
    systemPrompt: string
    currentStage: ThinkingStage
    hasSources: boolean
  }
): ThinkingRuntime {
  const cached = runtimeCache.get(thinkingId)
  if (cached) return cached

  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    0.3,
    args.maxTokens
  )
  const workflowTools = createThinkingWorkflowTools({
    thinkingDir,
    currentStage: args.currentStage
  })

  const allowedToolNames = getThinkingAllowedToolNames(args.hasSources)

  const agent = createDeepAgent({
    model,
    backend: new FilesystemBackend({
      rootDir: thinkingDir,
      virtualMode: true
    }),
    permissions: [
      { operations: ['read'], paths: ['/**'] },
      { operations: ['write'], paths: ['/**'], mode: 'deny' }
    ],
    systemPrompt: args.systemPrompt,
    tools: workflowTools.tools as any,
    middleware: [
      createThinkingToolInputRecoveryMiddleware() as any,
      createThinkingToolAllowlistMiddleware(allowedToolNames) as any
    ]
  })

  const runtime: ThinkingRuntime = {
    agent,
    workflowState: workflowTools.state,
    finalizeStagedThinkingDocument: workflowTools.finalizeStagedThinkingDocument
  }
  runtimeCache.set(thinkingId, runtime)
  return runtime
}

async function finalizeStagedThinkingIfNeeded(args: {
  runtime: ThinkingRuntime
  thinkingId: string
  reason: string
}): Promise<void> {
  if (!args.runtime.workflowState.thinkingStaged) return
  const result = await args.runtime.finalizeStagedThinkingDocument()
  if (result.status === 'committed') {
    log.info('[thinking:agent] staged thinking auto-committed', {
      thinkingId: args.thinkingId,
      reason: args.reason,
      pageCount: result.pageCount,
      length: result.length
    })
  } else if (result.status === 'discarded') {
    log.warn('[thinking:agent] staged thinking discarded', {
      thinkingId: args.thinkingId,
      reason: args.reason,
      discardReason: result.reason,
      pageCount: result.pageCount,
      expectedPageCount: result.expectedPageCount
    })
  }
}

export interface RunThinkingChatArgs extends ThinkingContextArgs {
  thinkingId: string
  thinkingDir: string
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens?: number
  modelTimeoutMs: number
  onThinkingEvent?: (event: { type: 'tool_call' | 'tool_result'; toolName: string; summary: string }) => void
}

export async function runThinkingChat(args: RunThinkingChatArgs): Promise<ThinkingChatResult> {
  const {
    thinkingId,
    thinkingDir,
    stage: currentStage,
    thinkingMd,
    contextMd,
    sourcesDir,
    userMessage,
    recentMessages,
    provider,
    apiKey,
    model,
    baseUrl,
    maxTokens,
    modelTimeoutMs,
    onThinkingEvent
  } = args

  const restartRequested = isRestartRequest(userMessage)
  const inputStage: ThinkingStage = restartRequested ? 'collect' : currentStage
  const inputThinkingMd = restartRequested ? buildInitialThinkingMd() : thinkingMd
  const inputContextMd = restartRequested ? buildInitialContextMd('collect') : contextMd

  if (restartRequested) {
    await writeThinkingMd(thinkingDir, inputThinkingMd)
    await writeContextMd(thinkingDir, inputContextMd)
    runtimeCache.delete(thinkingId)
  }

  const initialContext = await buildThinkingContext({
    stage: inputStage,
    thinkingMd: inputThinkingMd,
    contextMd: inputContextMd,
    sourcesDir,
    userMessage,
    recentMessages
  })

  const { systemPrompt, userMessage: fullUserMessage } = initialContext
  const hasSources = initialContext.sourceContent.trim().length > 0

  // Invalidate cached runtime so system prompt is fresh
  runtimeCache.delete(thinkingId)

  const runtime = getOrCreateRuntime(thinkingId, thinkingDir, {
    provider,
    apiKey,
    model,
    baseUrl,
    maxTokens,
    systemPrompt,
    currentStage: inputStage,
    hasSources
  })

  const routedIntent = routeThinkingIntent({
    userMessage,
    currentStage: inputStage
  })

  log.info('[thinking:agent] running chat', {
    thinkingId,
    stage: currentStage,
    inputStage,
    intent: routedIntent.intent,
    intentStage: routedIntent.requestedStage,
    messageLength: fullUserMessage.length
  })

  let replyText = ''
  let latestAssistantStateText = ''

  try {
    const result = await runAgentMessage({
      runtime,
      message: fullUserMessage,
      modelTimeoutMs,
      onThinkingEvent
    })
    replyText = result.replyText
    latestAssistantStateText = result.latestAssistantStateText
    await finalizeStagedThinkingIfNeeded({
      runtime,
      thinkingId,
      reason: 'main-run-complete'
    })
  } catch (err) {
    log.error('[thinking:agent] stream error', {
      thinkingId,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }

  // Prefer latestAssistantStateText (complete final response from updates stream,
  // excludes pre-tool-call narration). Fall back to concatenated messages stream.
  if (latestAssistantStateText) {
    log.info('[thinking:agent] using assistant state text as reply', {
      thinkingId,
      stateLength: latestAssistantStateText.length,
      streamLength: replyText.length
    })
    replyText = latestAssistantStateText
  }

  replyText = normalizeThinkingAssistantReply(replyText)

  if (!replyText) {
    replyText = buildFallbackReply({
      contextUpdated: runtime.workflowState.contextUpdated,
      thinkingUpdated: runtime.workflowState.thinkingUpdated,
      stage: inputStage
    })
  }

  // Workflow tools may have persisted files — read them back before validation.
  const fs = await import('fs')
  const path = await import('path')
  const thinkingMdPath = path.join(thinkingDir, 'thinking.md')
  const contextMdPath = path.join(thinkingDir, 'context.md')
  let updatedThinkingMd = inputThinkingMd
  let updatedContextMd = inputContextMd
  try {
    if (fs.existsSync(thinkingMdPath)) {
      updatedThinkingMd = await fs.promises.readFile(thinkingMdPath, 'utf-8')
    }
    if (fs.existsSync(contextMdPath)) {
      updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
    }
  } catch {
    // If read fails, keep the original
  }

  if (!runtime.workflowState.contextUpdated && updatedContextMd === inputContextMd) {
    log.warn('[thinking:agent] context.md was not updated by workflow tool; retrying forced context update', {
      thinkingId,
      stage: inputStage
    })
    const forcedMessage = [
      'Internal repair task. Your previous response did not call update_context_document.',
      'You must now call update_context_document to persist the confirmed user intent, decisions, and open questions into /context.md.',
      'Do not use write_file or edit_file.',
      'Do not ask the user a new question in this repair task.',
      '',
      fullUserMessage
    ].join('\n')
    try {
      await runAgentMessage({
        runtime,
        message: forcedMessage,
        modelTimeoutMs
      })
      if (fs.existsSync(contextMdPath)) {
        updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
      }
    } catch (err) {
      log.warn('[thinking:agent] forced context write retry failed; latest-direction fallback will run', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (!runtime.workflowState.contextUpdated) {
    const mergedContextMd = mergeLatestDirectionIntoContextMd({
      contextMd: updatedContextMd,
      currentStage: inputStage,
      userMessage
    })
    if (mergedContextMd !== updatedContextMd) {
      await writeContextMd(thinkingDir, mergedContextMd)
      updatedContextMd = mergedContextMd
    }
  }

  // Stage resolution: 1) agent-requested (via tool)  2) keyword fallback  3) structural check.
  // All explicit requests still pass through the same transition and content-readiness rules.
  let rawAgentRequestedStage = runtime.workflowState.requestedStage
  const rawRequestedStage = routedIntent.requestedStage
  let agentRequestedStage = resolveRequestedStage({
    currentStage: inputStage,
    requestedStage: rawAgentRequestedStage,
    thinkingMd: updatedThinkingMd
  })
  let resolvedRequestedStage = resolveRequestedStage({
    currentStage: inputStage,
    requestedStage: rawRequestedStage,
    thinkingMd: updatedThinkingMd
  })
  const repairTarget = getThinkingRepairTarget({
    currentStage: inputStage,
    rawAgentRequestedStage,
    rawRequestedStage,
    routedIntent,
    userMessage
  })

  if (
    repairTarget &&
    !resolveRequestedStage({
      currentStage: inputStage,
      requestedStage: repairTarget,
      thinkingMd: updatedThinkingMd
    })
  ) {
    log.warn('[thinking:agent] thinking.md is not ready for requested stage; retrying forced thinking update', {
      thinkingId,
      stage: inputStage,
      repairTarget,
      rawAgentRequestedStage,
      rawRequestedStage
    })
    try {
      const repairResult = await runAgentMessage({
        runtime,
        message: buildForcedThinkingUpdateMessage(repairTarget, fullUserMessage),
        modelTimeoutMs,
        onThinkingEvent
      })
      await finalizeStagedThinkingIfNeeded({
        runtime,
        thinkingId,
        reason: 'forced-thinking-repair-complete'
      })
      const repairReply = normalizeThinkingAssistantReply(
        repairResult.latestAssistantStateText || repairResult.replyText
      )
      if (repairReply.trim()) {
        replyText = repairReply.trim()
      }
      if (fs.existsSync(thinkingMdPath)) {
        updatedThinkingMd = await fs.promises.readFile(thinkingMdPath, 'utf-8')
      }
      if (fs.existsSync(contextMdPath)) {
        updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
      }
      rawAgentRequestedStage = runtime.workflowState.requestedStage
      agentRequestedStage = resolveRequestedStage({
        currentStage: inputStage,
        requestedStage: rawAgentRequestedStage,
        thinkingMd: updatedThinkingMd
      })
      resolvedRequestedStage = resolveRequestedStage({
        currentStage: inputStage,
        requestedStage: rawRequestedStage,
        thinkingMd: updatedThinkingMd
      })
    } catch (err) {
      log.warn('[thinking:agent] forced thinking update retry failed; leaving thinking.md unchanged', {
        thinkingId,
        repairTarget,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const credibilityIssues = findUnsupportedPrecisionClaims({
    markdown: updatedThinkingMd,
    hasSources
  })

  if (runtime.workflowState.thinkingUpdated && credibilityIssues.length > 0) {
    log.warn('[thinking:agent] unsupported exact claims detected; retrying credibility repair', {
      thinkingId,
      stage: inputStage,
      issueCount: credibilityIssues.length
    })
    try {
      const repairResult = await runAgentMessage({
        runtime,
        message: buildCredibilityRepairMessage(credibilityIssues, fullUserMessage),
        modelTimeoutMs,
        onThinkingEvent
      })
      await finalizeStagedThinkingIfNeeded({
        runtime,
        thinkingId,
        reason: 'credibility-repair-complete'
      })
      const repairReply = normalizeThinkingAssistantReply(
        repairResult.latestAssistantStateText || repairResult.replyText
      )
      if (repairReply.trim()) {
        replyText = repairReply.trim()
      }
      if (fs.existsSync(thinkingMdPath)) {
        updatedThinkingMd = await fs.promises.readFile(thinkingMdPath, 'utf-8')
      }
      if (fs.existsSync(contextMdPath)) {
        updatedContextMd = await fs.promises.readFile(contextMdPath, 'utf-8')
      }
      rawAgentRequestedStage = runtime.workflowState.requestedStage
      agentRequestedStage = resolveRequestedStage({
        currentStage: inputStage,
        requestedStage: rawAgentRequestedStage,
        thinkingMd: updatedThinkingMd
      })
      resolvedRequestedStage = resolveRequestedStage({
        currentStage: inputStage,
        requestedStage: rawRequestedStage,
        thinkingMd: updatedThinkingMd
      })
    } catch (err) {
      log.warn('[thinking:agent] credibility repair failed; leaving thinking.md unchanged', {
        thinkingId,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const autoStage = checkStageTransition(inputStage, updatedThinkingMd)
  let newStage = agentRequestedStage || resolvedRequestedStage || autoStage

  if (
    rawRequestedStage === 'collect' &&
    resolvedRequestedStage === 'collect' &&
    restartRequested
  ) {
    updatedThinkingMd = buildInitialThinkingMd()
    updatedContextMd = buildInitialContextMd('collect')
    await writeThinkingMd(thinkingDir, updatedThinkingMd)
    await writeContextMd(thinkingDir, updatedContextMd)
    newStage = 'collect'
  }

  // Update context.md with new stage
  updatedContextMd = updateContextStage(updatedContextMd, newStage)
  await writeContextMd(thinkingDir, updatedContextMd)

  log.info('[thinking:agent] chat complete', {
    thinkingId,
    replyLength: replyText.length,
    thinkingMdChanged: updatedThinkingMd !== inputThinkingMd,
    contextToolCalls: runtime.workflowState.contextUpdateCount,
    thinkingToolCalls: runtime.workflowState.thinkingUpdateCount,
    agentRequestedStage: rawAgentRequestedStage,
    resolvedAgentRequestedStage: agentRequestedStage,
    stageTransition: currentStage !== newStage ? `${currentStage} → ${newStage}` : 'none'
  })

  return {
    reply: replyText,
    thinkingMd: updatedThinkingMd,
    contextMd: updatedContextMd,
    stage: newStage
  }
}

function updateContextStage(contextMd: string, newStage: ThinkingStage): string {
  if (/^## Stage:\s*\S+/m.test(contextMd)) {
    return contextMd.replace(
      /^## Stage:\s*\S+/m,
      `## Stage: ${newStage}`
    )
  }
  return upsertSection(contextMd, 'Stage', newStage)
}

export function invalidateRuntime(thinkingId: string): void {
  runtimeCache.delete(thinkingId)
}
