import log from 'electron-log/main.js'
import type { IpcContext } from '../ipc/context'
import {
  finalizeGenerationFailure,
  resolveGenerationFailureSessionStatus
} from '../generation/finalization'
import { createGenerationContext } from '../generation/context'
import type { EditContext } from '../generation/types'

/** Persists the edit job before publishing its Runtime lifecycle terminal event. */
export async function settleEditJobSuccess(args: {
  ctx: IpcContext
  context: EditContext
}): Promise<void> {
  const { ctx, context } = args
  await ctx.db.updateSessionJobStatus(context.runId, 'finished')
  ctx.emitRuntimeJobTerminal({
    sessionId: context.sessionId,
    jobId: context.runId,
    domain: 'edit',
    status: 'completed'
  })
}

export async function settleEditJobFailure(args: {
  ctx: IpcContext
  context: EditContext
  error: unknown
  cancelled: boolean
  hasPersistedJob: boolean
  logPrefix: string
}): Promise<void> {
  const { ctx, context, error, cancelled, hasPersistedJob, logPrefix } = args
  const failure = cancelled ? new Error('生成已取消') : error
  const message =
    failure instanceof Error && failure.message.length > 0 ? failure.message : 'Edit generation failed'
  let terminalStatePersisted = false
  let finalizationFailed = false

  try {
    await finalizeGenerationFailure(createGenerationContext(ctx), context, failure)
    terminalStatePersisted = true
  } catch (finalizeError) {
    finalizationFailed = true
    log.error(`${logPrefix} failed to finalize generation`, {
      sessionId: context.sessionId,
      runId: context.runId,
      message:
        finalizeError instanceof Error ? finalizeError.message : String(finalizeError || '')
    })
    if (hasPersistedJob) {
      const fallbackResults = await Promise.allSettled([
        ctx.db.updateGenerationRunStatus(context.runId, 'failed', message),
        ctx.db.updateSessionStatus(
          context.sessionId,
          resolveGenerationFailureSessionStatus(context, cancelled)
        )
      ])
      terminalStatePersisted = fallbackResults.every((result) => result.status === 'fulfilled')
      if (!terminalStatePersisted) {
        const fallbackFailure = fallbackResults.find((result) => result.status === 'rejected')
        log.error(`${logPrefix} failed to persist fallback generation terminal state`, {
          sessionId: context.sessionId,
          runId: context.runId,
          message:
            fallbackFailure?.status === 'rejected' && fallbackFailure.reason instanceof Error
              ? fallbackFailure.reason.message
              : String(fallbackFailure?.status === 'rejected' ? fallbackFailure.reason : '')
        })
      }
    }
  }

  // A terminal session job is the crash-recovery boundary. Do not hide a run
  // whose generation/session state could not be finalized.
  if (!hasPersistedJob || !terminalStatePersisted) return
  if (finalizationFailed) {
    ctx.emitGenerateChunk(context.sessionId, {
      type: 'run_error',
      payload: { runId: context.runId, message, cancelled }
    })
  }
  let jobStatusPersisted = false
  try {
    await ctx.db.updateSessionJobStatus(
      context.runId,
      cancelled ? 'aborted' : 'finished',
      cancelled ? { abortReason: 'cancelled' } : undefined
    )
    jobStatusPersisted = true
  } catch (statusError) {
    log.error(`${logPrefix} failed to settle session job`, {
      sessionId: context.sessionId,
      runId: context.runId,
      message: statusError instanceof Error ? statusError.message : String(statusError || '')
    })
  }
  if (jobStatusPersisted) {
    ctx.emitRuntimeJobTerminal({
      sessionId: context.sessionId,
      jobId: context.runId,
      domain: 'edit',
      status: cancelled ? 'cancelled' : 'failed',
      errorCode: cancelled ? undefined : 'edit_failed',
      errorMessage: cancelled
        ? undefined
        : message
    })
  }
}
