import { ipcMain } from 'electron'
import crypto from 'crypto'
import log from 'electron-log/main.js'
import type { GenerateStartPayload } from '@shared/generation'
import type { IpcContext } from '../ipc/context'
import { executeDeckAllPageEditGeneration } from '../generation/edit-deck-allpage-flow'
import { resolveEditContext } from '../generation/edit-flow'
import { createEmitAssistantMessage } from '../generation/generation-utils'
import { createGenerationContext, normalizeGeneratePayload } from '../generation/context'
import type { EditContext } from '../generation/types'
import { isCancellationMessage, normalizeRestoredSessionStatus } from '../generation/status-utils'
import { JobCoordinator, sessionLockKey, type JobLease } from '../agent-runtime'
import { settleEditJobFailure, settleEditJobSuccess } from './edit-job-finalization'

type ActiveDeckEditJob = {
  sessionId: string
  runId: string
  lease: JobLease
  context: EditContext
}

type DeckEditRunSnapshot = {
  sessionId: string
  runId: string | null
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  hasActiveRun: boolean
  progress: number
  totalPages: number
  completedPageCount: number
  failedPageCount: number
  events: never[]
  error: string | null
  startedAt: number | null
  updatedAt: number | null
  kind: 'deck-edit'
  retryPayload?: GenerateStartPayload
}

const buildDeckEditRetryPayload = (
  input: ReturnType<typeof normalizeGeneratePayload>,
  modelConfigId?: string
): GenerateStartPayload => ({
  sessionId: input.sessionId,
  modelConfigId: modelConfigId || input.modelConfigId,
  userMessage: input.rawUserMessage,
  type: 'page',
  chatType: 'main',
  selectPageIds: input.selectPageIds,
  imagePaths: input.rawImagePaths,
  videoPaths: input.rawVideoPaths,
  docPaths: input.rawDocPaths
})

const parseDeckEditRetryPayload = (
  metadata: string | null,
  sessionId: string
): GenerateStartPayload | undefined => {
  if (!metadata) return undefined
  try {
    const parsed = JSON.parse(metadata) as { retryPayload?: unknown }
    const input = normalizeGeneratePayload({
      ...(parsed.retryPayload && typeof parsed.retryPayload === 'object'
        ? parsed.retryPayload
        : {}),
      sessionId,
      type: 'page',
      chatType: 'main'
    })
    if (!input.rawUserMessage.trim()) return undefined
    return buildDeckEditRetryPayload(input, input.modelConfigId)
  } catch {
    return undefined
  }
}

export class DeckEditJobService {
  private activeJobs = new Map<string, ActiveDeckEditJob>()
  private reservedJobIds = new Map<string, string>()

  constructor(private ctx: IpcContext, private coordinator: JobCoordinator) {}

  async start(event: Electron.IpcMainInvokeEvent, payload: unknown): Promise<{
    success: boolean
    runId?: string
    alreadyRunning?: boolean
  }> {
    const input = normalizeGeneratePayload(payload)
    if (!input.sessionId) throw new Error('sessionId 不能为空')
    if (input.requestedType !== 'page' || input.chatType !== 'main') {
      throw new Error('deck-edit:start 仅支持主会话批量编辑')
    }

    const reservation = await this.coordinator.reserve({
      jobId: crypto.randomUUID(),
      domain: 'edit',
      owner: { kind: 'session', id: input.sessionId },
      claims: { write: [sessionLockKey(input.sessionId)] },
      wait: 'fail'
    })
    if (reservation.status === 'busy') {
      return { success: true, runId: reservation.conflictingJobId, alreadyRunning: true }
    }
    const lease = reservation.lease
    this.reservedJobIds.set(input.sessionId, lease.jobId)
    let context: EditContext | null = null
    let jobCreated = false
    try {
      const editContext = await resolveEditContext(createGenerationContext(this.ctx), event, payload, {
        runId: lease.jobId,
        abortSignal: lease.signal
      })
      context = editContext
      if (lease.signal.aborted) throw new Error('生成已取消')
      if (editContext.runId !== lease.jobId) {
        throw new Error('批量编辑 runId 与 JobCoordinator lease 不一致')
      }

      const totalPages = Math.max(1, input.selectPageIds.length || editContext.totalPages)
      const retryPayload = buildDeckEditRetryPayload(input, editContext.modelConfigId)
      await this.ctx.db.createGenerationRunWithSessionJob({
        run: {
          id: editContext.runId,
          sessionId: editContext.sessionId,
          mode: 'edit',
          totalPages,
          modelConfigId: editContext.modelConfigId,
          metadata: {
            jobType: 'deck-edit',
            editScope: 'deck',
            selectPageIds: input.selectPageIds,
            modelConfigId: editContext.modelConfigId,
            modelConfigName: editContext.modelConfigName,
            provider: editContext.provider,
            model: editContext.model,
            retryPayload
          }
        },
        job: {
          id: editContext.runId,
          sessionId: editContext.sessionId,
          kind: 'deck-edit',
          status: 'active',
          previousSessionStatus: normalizeRestoredSessionStatus(editContext.previousSessionStatus),
          totalPages
        }
      })
      jobCreated = true
      if (lease.signal.aborted) throw new Error('生成已取消')
      editContext.skipGenerationRunCreation = true
      this.ctx.beginSessionRunState({
        sessionId: editContext.sessionId,
        runId: editContext.runId,
        mode: 'edit',
        kind: 'deck-edit',
        activityKind: 'deck-edit',
        totalPages,
        previousSessionStatus: editContext.previousSessionStatus,
        status: 'running'
      })

      const job: ActiveDeckEditJob = {
        sessionId: editContext.sessionId,
        runId: editContext.runId,
        lease,
        context: editContext
      }
      this.activeJobs.set(editContext.sessionId, job)
      void this.run(job)
      return { success: true, runId: editContext.runId }
    } catch (error) {
      try {
        if (context) {
          const message = error instanceof Error ? error.message : String(error || '')
          await settleEditJobFailure({
            ctx: this.ctx,
            context,
            error,
            cancelled: lease.signal.aborted || isCancellationMessage(message),
            hasPersistedJob: jobCreated,
            logPrefix: '[deck-edit:job]'
          })
        }
      } finally {
        lease.release()
        this.reservedJobIds.delete(input.sessionId)
        if (context) this.ctx.agentManager.removeSession(context.sessionId)
      }
      throw error
    }
  }

  async retry(event: Electron.IpcMainInvokeEvent, payload: unknown): Promise<{
    success: boolean
    runId?: string
    alreadyRunning?: boolean
    failedPageCount: number
  }> {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const failedRunId =
      typeof record.failedRunId === 'string' ? record.failedRunId.trim() || undefined : undefined
    const userMessage = typeof record.userMessage === 'string' ? record.userMessage.trim() : ''
    if (!sessionId) throw new Error('sessionId 不能为空')
    if (!userMessage) throw new Error('重试编辑失败：缺少原始编辑指令')

    const failedPages = failedRunId
      ? await this.getFailedPagesForRun(sessionId, failedRunId)
      : await this.ctx.db.listLatestFailedGenerationPages(sessionId)
    let failedPageIds = Array.from(
      new Set(failedPages.map((page) => page.page_id).filter((pageId) => pageId.length > 0))
    )
    if (failedPageIds.length === 0) {
      failedPageIds = normalizeGeneratePayload(record).selectPageIds
    }
    if (failedPageIds.length === 0) {
      failedPageIds = (await this.ctx.db.listSessionPages(sessionId)).map((page) => page.file_slug)
    }
    if (failedPageIds.length === 0) return { success: true, failedPageCount: 0 }

    const result = await this.start(event, {
      ...record,
      sessionId,
      userMessage,
      type: 'page',
      chatType: 'main',
      selectPageIds: failedPageIds,
      persistUserMessage: false
    })
    return { ...result, failedPageCount: 0 }
  }

  async cancel(sessionId: string): Promise<boolean> {
    const job = this.activeJobs.get(sessionId)
    if (!job) {
      const jobId = this.reservedJobIds.get(sessionId)
      return jobId ? this.coordinator.cancel(jobId) : false
    }
    return this.coordinator.cancel(job.lease.jobId)
  }

  async getState(sessionId: string): Promise<DeckEditRunSnapshot> {
    const activeState = this.ctx.sessionRunStates.get(sessionId)
    if (activeState?.activityKind === 'deck-edit') {
      const run = await this.ctx.db.getGenerationRun(activeState.runId)
      return {
        sessionId,
        runId: activeState.runId,
        status: activeState.status,
        hasActiveRun: activeState.status === 'queued' || activeState.status === 'running',
        progress: activeState.progress,
        totalPages: activeState.totalPages,
        completedPageCount: activeState.completedPageKeys.length,
        failedPageCount: activeState.failedPageKeys.length,
        events: [],
        error: activeState.error,
        startedAt: activeState.startedAt,
        updatedAt: activeState.updatedAt,
        kind: 'deck-edit',
        retryPayload: parseDeckEditRetryPayload(run?.metadata || null, sessionId)
      }
    }

    const job = await this.ctx.db.getLatestSessionJob(sessionId, ['deck-edit'])
    const run = job ? await this.ctx.db.getGenerationRun(job.id) : undefined
    const retryPayload = parseDeckEditRetryPayload(run?.metadata || null, sessionId)
    if (job?.status === 'active') {
      return {
        sessionId,
        runId: job.id,
        status: 'running',
        hasActiveRun: true,
        progress: 0,
        totalPages: job.total_pages || 1,
        completedPageCount: 0,
        failedPageCount: 0,
        events: [],
        error: null,
        startedAt: job.activated_at || job.created_at,
        updatedAt: job.updated_at,
        kind: 'deck-edit',
        retryPayload
      }
    }

    const generationPages = run ? await this.ctx.db.listGenerationPages(run.id) : []
    const completedPageCount = generationPages.filter((page) => page.status === 'completed').length
    const persistedFailedPageCount = generationPages.filter((page) => page.status === 'failed').length
    const userCancelled = job?.status === 'aborted' && job.abort_reason === 'cancelled'
    const interrupted = job?.status === 'aborted' && !userCancelled
    const failed = run?.status === 'failed' || run?.status === 'partial' || interrupted
    const failedPageCount = failed
      ? persistedFailedPageCount || Math.max(1, job?.total_pages || run?.total_pages || 1)
      : 0

    return {
      sessionId,
      runId: job?.id || null,
      status: userCancelled
        ? 'cancelled'
        : failed
          ? 'failed'
          : run?.status === 'completed'
            ? 'completed'
            : 'idle',
      hasActiveRun: false,
      progress: run?.status === 'completed' || run?.status === 'partial' ? 100 : 0,
      totalPages: job?.total_pages || 1,
      completedPageCount,
      failedPageCount,
      events: [],
      error: run?.error || job?.abort_reason || null,
      startedAt: job?.created_at || null,
      updatedAt: job?.updated_at || null,
      kind: 'deck-edit',
      retryPayload: failed && !userCancelled ? retryPayload : undefined
    }
  }

  async listActive(): Promise<DeckEditRunSnapshot[]> {
    const jobs = await this.ctx.db.listActiveSessionJobs(['deck-edit'])
    return Promise.all(jobs.map((job) => this.getState(job.session_id)))
  }

  async abortInterruptedJobs(reason: string): Promise<void> {
    const jobs = await this.ctx.db.listActiveSessionJobs(['deck-edit'])
    for (const job of jobs) {
      if (this.activeJobs.has(job.session_id)) continue
      await this.ctx.db.updateSessionJobStatus(job.id, 'aborted', { abortReason: reason })
      await this.ctx.db.updateGenerationRunStatus(job.id, 'failed', reason)
      await this.ctx.db.updateSessionStatus(
        job.session_id,
        normalizeRestoredSessionStatus(job.previous_session_status)
      )
    }
  }

  private async run(job: ActiveDeckEditJob): Promise<void> {
    const emitAssistant = createEmitAssistantMessage(this.ctx.db, this.ctx.emitGenerateChunk)
    try {
      await executeDeckAllPageEditGeneration(
        createGenerationContext(this.ctx),
        emitAssistant,
        job.context
      )
      await settleEditJobSuccess({ ctx: this.ctx, context: job.context })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      const cancelled = job.lease.signal.aborted || isCancellationMessage(message)
      await settleEditJobFailure({
        ctx: this.ctx,
        context: job.context,
        error,
        cancelled,
        hasPersistedJob: true,
        logPrefix: '[deck-edit:job]'
      })
    } finally {
      this.ctx.agentManager.removeSession(job.sessionId)
      this.activeJobs.delete(job.sessionId)
      this.reservedJobIds.delete(job.sessionId)
      job.lease.release()
    }
  }

  private async getFailedPagesForRun(sessionId: string, runId: string) {
    const run = await this.ctx.db.getGenerationRun(runId)
    if (!run || run.session_id !== sessionId) {
      throw new Error('重试失败：原失败任务不存在或不属于当前 Session')
    }
    return (await this.ctx.db.listGenerationPages(runId)).filter((page) => page.status === 'failed')
  }
}

export function registerDeckEditJobHandlers(
  ctx: IpcContext,
  coordinator: JobCoordinator
): DeckEditJobService {
  const service = new DeckEditJobService(ctx, coordinator)
  const interruptedReady = service.abortInterruptedJobs('应用退出导致主会话编辑中断，可重新发起').catch((error) => {
    log.warn('[deck-edit:job] failed to abort interrupted jobs', {
      message: error instanceof Error ? error.message : String(error)
    })
  })

  ipcMain.handle('deck-edit:start', async (event, payload) => {
    await interruptedReady
    return service.start(event, payload)
  })
  ipcMain.handle('deck-edit:cancel', async (_event, rawSessionId) => {
    await interruptedReady
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : ''
    return { success: sessionId ? await service.cancel(sessionId) : true }
  })
  ipcMain.handle('deck-edit:state', async (_event, rawSessionId) => {
    await interruptedReady
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : ''
    if (!sessionId) throw new Error('sessionId 不能为空')
    return service.getState(sessionId)
  })
  ipcMain.handle('deck-edit:listActive', async () => {
    await interruptedReady
    return service.listActive()
  })
  return service
}
