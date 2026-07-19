import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import type { SessionJobKind } from '../../db/database'
import type { FinalizeContext } from './types'
import { finalizeGenerationFailure } from './finalization'
import { isCancellationMessage, normalizeRestoredSessionStatus } from './status-utils'
import { SessionJobCoordinator, type SessionJobLease } from '../edit-jobs/session-job-coordinator'

const MAX_ACTIVE_GENERATION_JOBS = 2

export type GenerateJobReservation = SessionJobLease

type BackgroundJob<TContext extends FinalizeContext> = {
  sessionId: string
  runId: string
  kind: SessionJobKind
  operation: string
  context: TContext
  totalPages: number
  status: 'pending' | 'active'
  execute: (context: TContext) => Promise<void>
}

export class GenerateJobManager {
  private ctx: IpcContext
  private jobsBySession = new Map<string, BackgroundJob<FinalizeContext>>()
  private pendingQueue: Array<BackgroundJob<FinalizeContext>> = []
  private activeCount = 0
  private startingCount = 0

  private coordinator: SessionJobCoordinator

  constructor(ctx: IpcContext, coordinator?: SessionJobCoordinator) {
    this.ctx = ctx
    this.coordinator = coordinator || new SessionJobCoordinator(ctx)
  }

  reserve(
    operation: string,
    sessionId: string
  ):
    | { alreadyRunning: true; runId?: string }
    | { alreadyRunning: false; reservation: GenerateJobReservation } {
    const existingJob = this.jobsBySession.get(sessionId)
    if (existingJob) {
      return { alreadyRunning: true, runId: existingJob.runId }
    }
    const result = this.coordinator.reserve(operation, sessionId)
    return result.alreadyRunning
      ? result
      : { alreadyRunning: false, reservation: result.lease }
  }

  assertNotCancelled(reservation: GenerateJobReservation | null | undefined): void {
    if (reservation?.controller.signal.aborted) {
      throw new Error('生成已取消')
    }
  }

  release(reservation: GenerateJobReservation | null | undefined): void {
    if (!reservation) return
    this.coordinator.release(reservation)
  }

  async enqueue<TContext extends FinalizeContext>(args: {
    reservation: GenerateJobReservation
    kind: Extract<SessionJobKind, 'standard' | 'template' | 'retry'>
    context: TContext
    totalPages: number
    activityKind?: 'page-edit' | 'edit' | 'style-switch' | 'single-page-retry' | 'addPage'
    targetPageId?: string
    targetPageNumber?: number
    completedPageBaseCount?: number
    failedPageBaseKeys?: string[]
    execute: (context: TContext) => Promise<void>
  }): Promise<{ runId: string; queued: boolean }> {
    const {
      reservation,
      context,
      kind,
      totalPages,
      activityKind,
      targetPageId,
      targetPageNumber,
      completedPageBaseCount,
      failedPageBaseKeys,
      execute
    } = args
    const runId = context.runId
    reservation.runId = runId
    this.assertNotCancelled(reservation)

    const willRunNow = this.activeCount + this.startingCount < MAX_ACTIVE_GENERATION_JOBS
    if (willRunNow) {
      this.startingCount += 1
    }
    let runCreated = false
    let jobCreated = false

    try {
      await this.ctx.db.createGenerationRunWithSessionJob({
        run: {
          id: runId,
          sessionId: context.sessionId,
          mode: context.effectiveMode,
          totalPages,
          modelConfigId: context.modelConfigId,
          animationPreferences: context.animationPreferences || null,
          metadata: {
            backgroundJob: true,
            kind,
            jobKind: kind
          }
        },
        job: {
          id: runId,
          sessionId: context.sessionId,
          kind,
          status: willRunNow ? 'active' : 'pending',
          previousSessionStatus: normalizeRestoredSessionStatus(context.previousSessionStatus),
          totalPages
        }
      })
      runCreated = true
      jobCreated = true
      this.assertNotCancelled(reservation)

      this.ctx.beginSessionRunState({
        sessionId: context.sessionId,
        runId,
        mode: context.effectiveMode,
        kind,
        activityKind,
        targetPageId,
        targetPageNumber,
        totalPages,
        previousSessionStatus: context.previousSessionStatus,
        status: willRunNow ? 'running' : 'queued',
        completedPageBaseCount,
        failedPageBaseKeys
      })

      const job: BackgroundJob<FinalizeContext> = {
        sessionId: context.sessionId,
        runId,
        kind,
        operation: reservation.operation,
        context,
        totalPages,
        status: willRunNow ? 'active' : 'pending',
        execute: execute as (context: FinalizeContext) => Promise<void>
      }
      this.jobsBySession.set(context.sessionId, job)

      if (willRunNow) {
        this.startJob(job, { reservedSlot: true })
      } else {
        this.pendingQueue.push(job)
        this.ctx.emitGenerateChunk(context.sessionId, {
          type: 'stage_started',
          payload: {
            runId,
            stage: 'queued',
            label: '排队中',
            progress: 0,
            totalPages
          }
        })
        log.info('[generate:job] queued', { sessionId: context.sessionId, runId, kind })
      }

      return { runId, queued: !willRunNow }
    } catch (error) {
      if (willRunNow) {
        this.startingCount = Math.max(0, this.startingCount - 1)
      }
      const message = error instanceof Error ? error.message : String(error || 'Generation job setup failed')
      if (jobCreated) {
        await this.ctx.db
          .updateSessionJobStatus(runId, 'aborted', {
            abortReason: isCancellationMessage(message) ? 'cancelled' : 'setup_failed'
          })
          .catch((statusError) => {
            log.warn('[generate:job] failed to abort partially created job', {
              sessionId: context.sessionId,
              runId,
              message: statusError instanceof Error ? statusError.message : String(statusError)
            })
          })
      }
      if (runCreated) {
        const settled = await Promise.allSettled([
          this.ctx.db.updateGenerationRunStatus(runId, 'failed', message),
          this.ctx.db.updateSessionStatus(
            context.sessionId,
            normalizeRestoredSessionStatus(context.previousSessionStatus)
          )
        ])
        settled.forEach((result) => {
          if (result.status === 'rejected') {
            log.warn('[generate:job] failed to clean up partial job setup', {
              sessionId: context.sessionId,
              runId,
              message: result.reason instanceof Error ? result.reason.message : String(result.reason)
            })
          }
        })
      }
      throw error
    }
  }

  async cancel(sessionId: string): Promise<boolean> {
    const job = this.jobsBySession.get(sessionId)
    const reservation = this.coordinator.get(sessionId)
    if (reservation && !reservation.controller.signal.aborted) {
      reservation.controller.abort()
      log.info('[generate:job] cancel reservation', {
        sessionId,
        operation: reservation.operation
      })
    }
    if (!job) return false
    if (job.status === 'pending') {
      this.pendingQueue = this.pendingQueue.filter((candidate) => candidate !== job)
      this.jobsBySession.delete(sessionId)
      await this.ctx.db.updateSessionJobStatus(job.runId, 'aborted', { abortReason: 'cancelled' })
      await this.ctx.db.updateGenerationRunStatus(job.runId, 'failed', '生成已取消')
      await this.ctx.db.updateSessionStatus(
        sessionId,
        normalizeRestoredSessionStatus(job.context.previousSessionStatus)
      )
      this.ctx.emitGenerateChunk(sessionId, {
        type: 'run_error',
        payload: { runId: job.runId, message: '生成已取消' }
      })
      this.ctx.agentManager.removeSession(sessionId)
      this.release(this.coordinator.get(sessionId))
      this.processQueue()
      return true
    }
    this.ctx.agentManager.cancelSession(sessionId)
    return true
  }

  async abortInterruptedJobs(reason: string): Promise<void> {
    const activeJobs = await this.ctx.db.listActiveSessionJobs(['standard', 'template', 'retry'])
    for (const job of activeJobs) {
      if (this.jobsBySession.has(job.session_id)) continue
      const reservation = this.coordinator.get(job.session_id)
      if (reservation?.runId === job.id) continue
      await this.ctx.db.updateSessionJobStatus(job.id, 'aborted', { abortReason: reason })
      await this.ctx.db.updateGenerationRunStatus(job.id, 'failed', reason)
      await this.ctx.db.updateSessionStatus(
        job.session_id,
        normalizeRestoredSessionStatus(job.previous_session_status)
      )
    }
  }

  private startJob(
    job: BackgroundJob<FinalizeContext>,
    options?: { reservedSlot?: boolean }
  ): void {
    job.status = 'active'
    if (options?.reservedSlot) {
      this.startingCount = Math.max(0, this.startingCount - 1)
    }
    this.activeCount += 1
    void this.ctx.db.updateSessionJobStatus(job.runId, 'active').catch((error) => {
      log.warn('[generate:job] failed to mark active', {
        sessionId: job.sessionId,
        runId: job.runId,
        message: error instanceof Error ? error.message : String(error)
      })
    })
    const state = this.ctx.sessionRunStates.get(job.sessionId)
    if (state?.runId === job.runId) {
      state.status = 'running'
      state.updatedAt = Date.now()
    }
    log.info('[generate:job] start', {
      sessionId: job.sessionId,
      runId: job.runId,
      kind: job.kind
    })
    void this.runJob(job)
  }

  private async runJob(job: BackgroundJob<FinalizeContext>): Promise<void> {
    try {
      await job.execute(job.context)
      await this.ctx.db.updateSessionJobStatus(job.runId, 'finished')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      const cancelled =
        this.coordinator.get(job.sessionId)?.controller.signal.aborted || isCancellationMessage(message)
      await finalizeGenerationFailure(
        this.ctx,
        job.context,
        cancelled ? new Error('生成已取消') : error
      )
      if (cancelled) {
        await this.ctx.db.updateSessionJobStatus(job.runId, 'aborted', {
          abortReason: 'cancelled'
        })
      } else {
        await this.ctx.db.updateSessionJobStatus(job.runId, 'finished')
      }
    } finally {
      this.ctx.agentManager.removeSession(job.sessionId)
      this.jobsBySession.delete(job.sessionId)
      this.release(this.coordinator.get(job.sessionId))
      this.activeCount = Math.max(0, this.activeCount - 1)
      this.processQueue()
    }
  }

  private processQueue(): void {
    while (
      this.activeCount + this.startingCount < MAX_ACTIVE_GENERATION_JOBS &&
      this.pendingQueue.length > 0
    ) {
      const next = this.pendingQueue.shift()
      if (!next || !this.jobsBySession.has(next.sessionId)) continue
      this.startJob(next)
    }
  }
}
