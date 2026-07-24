import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import { finalizeGenerationFailure } from '../generation/finalization'
import type { EditContext } from '../generation/types'

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

  try {
    await finalizeGenerationFailure(ctx, context, failure)
  } catch (finalizeError) {
    log.error(`${logPrefix} failed to finalize generation`, {
      sessionId: context.sessionId,
      runId: context.runId,
      message:
        finalizeError instanceof Error ? finalizeError.message : String(finalizeError || '')
    })
  }

  if (!hasPersistedJob) return
  try {
    await ctx.db.updateSessionJobStatus(
      context.runId,
      cancelled ? 'aborted' : 'finished',
      cancelled ? { abortReason: 'cancelled' } : undefined
    )
  } catch (statusError) {
    log.error(`${logPrefix} failed to settle session job`, {
      sessionId: context.sessionId,
      runId: context.runId,
      message: statusError instanceof Error ? statusError.message : String(statusError || '')
    })
  }
}
