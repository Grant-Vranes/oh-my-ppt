import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { FontSelection, GenerateStartPayload, SourceDocumentPlan } from '@shared/generation'
import { normalizeFontSelection, normalizeSelectPageIds } from '@shared/generation'
import type { ModelTimeoutProfile } from '@shared/model-timeout'
import type { IpcContext } from '../context'
import type { GenerateChatType } from './types'

export { resolveSourceDocuments } from './source-documents'
import { resolveGlobalModelTimeouts, resolveModelConfigForTask } from '../config/model-config-utils'
import { loadStyleSkill, resolveUsableStyleId } from '../../utils/style-skills'
import { extractOutlineTitles, parseJsonObject } from '../utils'
import { sourcePlanFromSkeletonRows } from './source-plan'

export type CommonGenerationContext = {
  session: Awaited<ReturnType<IpcContext['db']['getSession']>>
  sessionRecord: Record<string, unknown>
  previousSessionStatus: string
  runId: string
  provider: string
  apiKey: string
  model: string
  modelConfigId?: string
  modelConfigName?: string
  runModel?: string
  providerBaseUrl: string
  maxTokens: number
  modelTimeouts: Record<ModelTimeoutProfile, number>
  projectDir: string
  abortSignal: AbortSignal
  styleId: string
  styleSkill: ReturnType<typeof loadStyleSkill>
  styleSkillPrompt: string
  topic: string
  deckTitle: string
  appLocale: 'zh' | 'en'
  fontSelection: FontSelection
  sourcePlan: SourceDocumentPlan | null
  projectId: string
  entry: NonNullable<ReturnType<IpcContext['agentManager']['beginRun']>>
}

export type NormalizedGenerateInput = {
  sessionId: string
  modelConfigId?: string
  rawUserMessage: string
  rawImagePaths: string[]
  rawVideoPaths: string[]
  rawDocPaths: string[]
  requestedType?: 'deck' | 'page'
  selectedPageId?: string
  selectPageIds: string[]
  htmlPath?: string
  selector?: string
  elementTag?: string
  elementText?: string
  chatType: GenerateChatType
  chatPageId?: string
}

export function normalizeGeneratePayload(payload: unknown): NormalizedGenerateInput {
  const input = payload as GenerateStartPayload
  const sessionId = String(input?.sessionId || '').trim()
  const modelConfigId =
    typeof input?.modelConfigId === 'string' && input.modelConfigId.trim().length > 0
      ? input.modelConfigId.trim()
      : undefined
  const rawUserMessage = typeof input?.userMessage === 'string' ? input.userMessage : ''
  const rawImagePaths = Array.isArray(input?.imagePaths)
    ? input.imagePaths
        .map((item) => String(item || '').trim())
        .filter((item) => item.startsWith('./images/'))
        .slice(0, 10)
    : []
  const rawVideoPaths = Array.isArray(input?.videoPaths)
    ? input.videoPaths
        .map((item) => String(item || '').trim())
        .filter((item) => item.startsWith('./videos/'))
        .slice(0, 10)
    : []
  const rawDocPaths = Array.isArray(input?.docPaths)
    ? input.docPaths
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 1)
    : []
  const requestedType =
    input?.type === 'page' ? 'page' : input?.type === 'deck' ? 'deck' : undefined
  const selectedPageId =
    typeof input?.selectedPageId === 'string' && input.selectedPageId.trim().length > 0
      ? input.selectedPageId.trim()
      : undefined
  const selectPageIds = normalizeSelectPageIds(input?.selectPageIds)
  const htmlPath = typeof input?.htmlPath === 'string' ? input.htmlPath : undefined
  const selector =
    typeof input?.selector === 'string' && input.selector.trim().length > 0
      ? input.selector.trim()
      : undefined
  const elementTag =
    typeof input?.elementTag === 'string' && input.elementTag.trim().length > 0
      ? input.elementTag.trim()
      : undefined
  const elementText =
    typeof input?.elementText === 'string' && input.elementText.trim().length > 0
      ? input.elementText.trim()
      : undefined
  const chatType: GenerateChatType = input?.chatType === 'page' ? 'page' : 'main'
  const chatPageId =
    chatType === 'page' && typeof input?.chatPageId === 'string' && input.chatPageId.trim().length > 0
      ? input.chatPageId.trim()
      : undefined

  return {
    sessionId,
    modelConfigId,
    rawUserMessage,
    rawImagePaths,
    rawVideoPaths,
    rawDocPaths,
    requestedType,
    selectedPageId,
    selectPageIds,
    htmlPath,
    selector,
    elementTag,
    elementText,
    chatType,
    chatPageId
  }
}

export function buildRetryUserMessage(retrySupplementRaw: string): string {
  const retrySupplement = retrySupplementRaw.trim()
  return retrySupplement
    ? [
        '继续生成本会话中未完成的页面。页面正文、标题、图表标签必须保持与现有页面相同语言。',
        'Continue generating the unfinished slides in this session. Keep slide text, titles, and chart labels in the same language as existing slides.',
        'Determine the content language from the existing topic, outline, source materials, existing slides, and the user supplement; do not infer it from this instruction language.',
        `User supplement:\n${retrySupplement}`
      ].join('\n')
    : [
        '继续生成本会话中未完成的页面。页面正文、标题、图表标签必须保持与现有页面相同语言。',
        'Continue generating the unfinished slides in this session. Keep slide text, titles, and chart labels in the same language as existing slides.',
        'Determine the content language from the existing topic, outline, source materials, and existing slides; do not infer it from this instruction language.'
      ].join('\n')
}

export function buildTotalPages(sessionRecord: Record<string, unknown>): number {
  const total = Number(sessionRecord.page_count ?? sessionRecord.pageCount)
  return Math.max(1, Number.isFinite(total) ? Math.floor(total) : 1)
}

export function buildOutlineTitles(rawUserMessage: string): string[] {
  return extractOutlineTitles(rawUserMessage)
}

export async function resolveCommonContext(
  ctx: IpcContext,
  sessionId: string,
  modelConfigId?: string
): Promise<CommonGenerationContext> {
  const { db, agentManager, ensureSessionAssets } = ctx

  const session = await db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const sessionRecord = session as unknown as Record<string, unknown>
  const sessionMetadata = parseJsonObject(sessionRecord.metadata ?? sessionRecord.metadata_json)
  const sourcePlan = sourcePlanFromSkeletonRows(await db.listSourcePageSkeletons(sessionId))
  const previousSessionStatus = String(sessionRecord.status || 'active')

  const activeModel = await resolveModelConfigForTask(ctx, {
    modelConfigId,
    purpose: 'generation'
  })
  const modelTimeouts = await resolveGlobalModelTimeouts(ctx)
  const runModel = JSON.stringify({
    modelConfigId: activeModel.id,
    name: activeModel.name,
    provider: activeModel.provider,
    model: activeModel.model,
    baseUrl: activeModel.baseUrl || undefined,
    maxTokens: activeModel.maxTokens
  })

  const styleIdRaw =
    typeof sessionRecord.styleId === 'string' ? String(sessionRecord.styleId).trim() : ''
  const styleId = resolveUsableStyleId(styleIdRaw)
  const styleSkill = loadStyleSkill(styleId)

  const existingProject = await db.getProject(sessionId)
  if (!existingProject) {
    const storagePath = await ctx.resolveStoragePath()
    const projectDir = path.join(storagePath, sessionId)
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true })
    }
    await db.createProject({
      session_id: sessionId,
      title: String(sessionRecord.title || 'Untitled'),
      output_path: projectDir,
      root_path: projectDir
    })
  }
  const projectDir = await ctx.resolveSessionProjectDir(sessionId)
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true })
  }
  await ensureSessionAssets(projectDir)

  agentManager.ensureSession({
    sessionId,
    provider: activeModel.provider,
    model: activeModel.model,
    baseUrl: activeModel.baseUrl,
    projectDir
  })
  // Intentional side effect: current consumers always proceed to generation and need abort/run state.
  const entry = agentManager.beginRun(sessionId)
  if (!entry) throw new Error('Session not found')

  const settings = await db.getAllSettings()
  const appLocale: 'zh' | 'en' = settings.locale === 'en' ? 'en' : 'zh'
  const projectId = existingProject?.id ?? (await db.getProject(sessionId))?.id
  if (!projectId) throw new Error('Failed to resolve project for session')

  return {
    session,
    sessionRecord,
    previousSessionStatus,
    runId: crypto.randomUUID(),
    provider: activeModel.provider,
    apiKey: activeModel.apiKey,
    model: activeModel.model,
    modelConfigId: activeModel.id,
    modelConfigName: activeModel.name,
    runModel,
    providerBaseUrl: activeModel.baseUrl,
    maxTokens: activeModel.maxTokens,
    modelTimeouts,
    projectDir: entry.projectDir,
    abortSignal: entry.abortController.signal,
    entry,
    styleId,
    styleSkill,
    styleSkillPrompt: styleSkill.prompt,
    topic: String(sessionRecord.topic || '当前主题'),
    deckTitle: String(sessionRecord.title || 'OhMyPPT Preview'),
    appLocale,
    fontSelection: normalizeFontSelection(sessionMetadata.fontSelection),
    sourcePlan,
    projectId
  }
}
