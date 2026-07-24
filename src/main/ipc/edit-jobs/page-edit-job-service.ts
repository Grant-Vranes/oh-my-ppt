import { ipcMain } from 'electron'
import fs from 'fs'
import log from 'electron-log/main.js'
import path from 'path'
import type { IpcContext } from '../context'
import { assessPageEdit, executeEditGeneration, resolveEditContext } from '../generation/edit-flow'
import { createEmitAssistantMessage } from '../generation/generation-utils'
import { normalizeGeneratePayload } from '../generation/context'
import type { EditContext } from '../generation/types'
import { isCancellationMessage, normalizeRestoredSessionStatus } from '../generation/status-utils'
import { resolvePageHtmlPath } from '../generation/generation-utils'
import { SessionJobCoordinator, type SessionJobLease } from './session-job-coordinator'
import { settleEditJobFailure } from './edit-job-finalization'
import { restorePageEditSnapshots, type PageEditFileSnapshot } from './page-edit-rollback'

type ActivePageEditJob = {
  sessionId: string
  runId: string
  lease: SessionJobLease
  context: EditContext
}

type PageEditRunSnapshot = {
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
  kind: 'page-edit'
  targetPageId?: string
  targetPageNumber?: number
}

export class PageEditJobService {
  private activeJobs = new Map<string, ActivePageEditJob>()
  private assessmentControllers = new Map<string, AbortController>()

  constructor(
    private ctx: IpcContext,
    private coordinator: SessionJobCoordinator
  ) {}

  async start(event: Electron.IpcMainInvokeEvent, payload: unknown): Promise<{
    success: boolean
    runId?: string
    alreadyRunning?: boolean
  }> {
    const input = normalizeGeneratePayload(payload)
    if (!input.sessionId) throw new Error('sessionId 不能为空')
    if (input.requestedType !== 'page' || input.chatType !== 'page') {
      throw new Error('page-edit:start 仅支持当前页面编辑')
    }
    if (!input.approvedPlan && !input.autoApply) {
      throw new Error('请先确认页面修改计划，再执行编辑。')
    }

    const activeAssessment = this.assessmentControllers.get(input.sessionId)
    if (activeAssessment && !activeAssessment.signal.aborted) activeAssessment.abort()

    const reservation = this.coordinator.reserve('page-edit:start', input.sessionId)
    if (reservation.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }
    const lease = reservation.lease
    let context: EditContext | null = null
    let jobCreated = false
    lease.controller.signal.addEventListener(
      'abort',
      () => this.ctx.agentManager.cancelSession(input.sessionId),
      { once: true }
    )
    try {
      const editContext = await resolveEditContext(this.ctx, event, payload)
      context = editContext
      if (lease.controller.signal.aborted) throw new Error('生成已取消')
      const targetPage = (await this.ctx.db.listSessionPages(editContext.sessionId)).find(
        (page) =>
          page.id === editContext.selectedPageId || page.file_slug === editContext.selectedPageId
      )
      if (!targetPage) throw new Error('页面编辑任务缺少目标页面')

      lease.runId = editContext.runId
      await this.ctx.db.createGenerationRunWithSessionJob({
        run: {
          id: editContext.runId,
          sessionId: editContext.sessionId,
          mode: 'edit',
          totalPages: 1,
          modelConfigId: editContext.modelConfigId,
          metadata: {
            jobType: 'page-edit',
            targetPageId: targetPage.file_slug,
            targetPageNumber: targetPage.page_number,
            selector: editContext.selector || null
          }
        },
        job: {
          id: editContext.runId,
          sessionId: editContext.sessionId,
          kind: 'page-edit',
          status: 'active',
          targetPageId: targetPage.file_slug,
          targetPageNumber: targetPage.page_number,
          selector: editContext.selector,
          totalPages: 1,
          previousSessionStatus: normalizeRestoredSessionStatus(editContext.previousSessionStatus)
        }
      })
      jobCreated = true
      if (lease.controller.signal.aborted) throw new Error('生成已取消')
      this.ctx.beginSessionRunState({
        sessionId: editContext.sessionId,
        runId: editContext.runId,
        mode: 'edit',
        kind: 'page-edit',
        activityKind: 'page-edit',
        targetPageId: targetPage.file_slug,
        targetPageNumber: targetPage.page_number,
        totalPages: 1,
        previousSessionStatus: editContext.previousSessionStatus,
        status: 'running'
      })

      const job: ActivePageEditJob = {
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
            cancelled: lease.controller.signal.aborted || isCancellationMessage(message),
            hasPersistedJob: jobCreated,
            logPrefix: '[page-edit:job]'
          })
        }
      } finally {
        this.coordinator.release(lease)
        if (context) this.ctx.agentManager.removeSession(context.sessionId)
      }
      throw error
    }
  }

  async assess(payload: unknown) {
    const input = normalizeGeneratePayload(payload)
    if (!input.sessionId) throw new Error('sessionId 不能为空')
    const activeRun = this.ctx.sessionRunStates.get(input.sessionId)
    if (
      this.coordinator.get(input.sessionId) ||
      activeRun?.status === 'queued' ||
      activeRun?.status === 'running'
    ) {
      throw new Error('当前有页面修改任务正在执行')
    }
    const controller = new AbortController()
    this.assessmentControllers.get(input.sessionId)?.abort()
    this.assessmentControllers.set(input.sessionId, controller)
    try {
      return await assessPageEdit(this.ctx, payload, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) throw new Error('生成已取消')
      throw error
    } finally {
      if (this.assessmentControllers.get(input.sessionId) === controller) {
        this.assessmentControllers.delete(input.sessionId)
      }
    }
  }

  async cancel(sessionId: string): Promise<boolean> {
    const assessment = this.assessmentControllers.get(sessionId)
    if (assessment && !assessment.signal.aborted) {
      assessment.abort()
      return true
    }
    const job = this.activeJobs.get(sessionId)
    if (!job) {
      const lease = this.coordinator.get(sessionId)
      if (!lease || !this.coordinator.isOwnedBy(sessionId, 'page-edit')) return false
      if (!lease.controller.signal.aborted) lease.controller.abort()
      return true
    }
    if (!job.lease.controller.signal.aborted) job.lease.controller.abort()
    this.ctx.agentManager.cancelSession(sessionId)
    return true
  }

  async getState(sessionId: string): Promise<PageEditRunSnapshot> {
    const activeState = this.ctx.sessionRunStates.get(sessionId)
    if (activeState?.activityKind === 'page-edit') {
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
        kind: 'page-edit',
        targetPageId: activeState.targetPageId,
        targetPageNumber: activeState.targetPageNumber
      }
    }

    const job = await this.ctx.db.getLatestSessionJob(sessionId, ['page-edit'])
    if (job?.status === 'active') {
      return {
        sessionId,
        runId: job.id,
        status: 'running',
        hasActiveRun: true,
        progress: 0,
        totalPages: 1,
        completedPageCount: 0,
        failedPageCount: 0,
        events: [],
        error: null,
        startedAt: job.activated_at || job.created_at,
        updatedAt: job.updated_at,
        kind: 'page-edit',
        targetPageId: job.target_page_id || undefined,
        targetPageNumber: job.target_page_number || undefined
      }
    }

    return {
      sessionId,
      runId: job?.id || null,
      status: job?.status === 'aborted' ? 'cancelled' : 'idle',
      hasActiveRun: false,
      progress: 0,
      totalPages: 1,
      completedPageCount: 0,
      failedPageCount: 0,
      events: [],
      error: job?.abort_reason || null,
      startedAt: job?.created_at || null,
      updatedAt: job?.updated_at || null,
      kind: 'page-edit',
      targetPageId: job?.target_page_id || undefined,
      targetPageNumber: job?.target_page_number || undefined
    }
  }

  async listActive(): Promise<PageEditRunSnapshot[]> {
    const jobs = await this.ctx.db.listActiveSessionJobs(['page-edit'])
    return Promise.all(jobs.map((job) => this.getState(job.session_id)))
  }

  async abortInterruptedJobs(reason: string): Promise<void> {
    const jobs = await this.ctx.db.listActiveSessionJobs(['page-edit'])
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

  private async run(job: ActivePageEditJob): Promise<void> {
    const emitAssistant = createEmitAssistantMessage(this.ctx.db, this.ctx.emitGenerateChunk)
    let snapshots: PageEditFileSnapshot[] = []
    try {
      const pages = await this.ctx.db.listSessionPages(job.sessionId)
      const targetPage = pages.find(
        (page) => page.id === job.context.selectedPageId || page.file_slug === job.context.selectedPageId
      )
      const targetPagePath = targetPage
        ? resolvePageHtmlPath({
            projectDir: job.context.entry.projectDir,
            fileSlug: targetPage.file_slug,
            candidates: [targetPage.html_path]
          })
        : null
      const snapshotPaths = Array.from(
        new Set([targetPagePath, path.join(job.context.entry.projectDir, 'index.html')].filter(Boolean))
      ) as string[]
      snapshots = await Promise.all(
        snapshotPaths.map(async (filePath) => ({
          path: filePath,
          exists: fs.existsSync(filePath),
          content: fs.existsSync(filePath) ? await fs.promises.readFile(filePath, 'utf-8') : ''
        }))
      )
      await executeEditGeneration(this.ctx, emitAssistant, job.context)
      await this.ctx.db.updateSessionJobStatus(job.runId, 'finished')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      const cancelled = job.lease.controller.signal.aborted || isCancellationMessage(message)
      if (cancelled) {
        const rollbackFailures = await restorePageEditSnapshots(snapshots)
        rollbackFailures.forEach((failure) => {
          log.error('[page-edit:job] failed to restore cancelled file', {
            sessionId: job.sessionId,
            runId: job.runId,
            path: failure.path,
            message:
              failure.error instanceof Error ? failure.error.message : String(failure.error || '')
          })
        })
      }
      await settleEditJobFailure({
        ctx: this.ctx,
        context: job.context,
        error,
        cancelled,
        hasPersistedJob: true,
        logPrefix: '[page-edit:job]'
      })
    } finally {
      this.ctx.agentManager.removeSession(job.sessionId)
      this.activeJobs.delete(job.sessionId)
      this.coordinator.release(job.lease)
    }
  }
}

export function registerPageEditJobHandlers(
  ctx: IpcContext,
  coordinator: SessionJobCoordinator
): PageEditJobService {
  const service = new PageEditJobService(ctx, coordinator)
  const interruptedReady = service.abortInterruptedJobs('应用退出导致页面编辑中断，可重新发起').catch((error) => {
    log.warn('[page-edit:job] failed to abort interrupted jobs', {
      message: error instanceof Error ? error.message : String(error)
    })
  })

  ipcMain.handle('page-edit:assess', async (_event, payload) => {
    await interruptedReady
    return service.assess(payload)
  })
  ipcMain.handle('page-edit:start', async (event, payload) => {
    await interruptedReady
    return service.start(event, payload)
  })
  ipcMain.handle('page-edit:cancel', async (_event, rawSessionId) => {
    await interruptedReady
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : ''
    return { success: sessionId ? await service.cancel(sessionId) : true }
  })
  ipcMain.handle('page-edit:state', async (_event, rawSessionId) => {
    await interruptedReady
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : ''
    if (!sessionId) throw new Error('sessionId 不能为空')
    return service.getState(sessionId)
  })
  ipcMain.handle('page-edit:listActive', async () => {
    await interruptedReady
    return service.listActive()
  })
  return service
}
