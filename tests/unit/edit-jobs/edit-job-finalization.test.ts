import { describe, expect, it, vi } from 'vitest'

const { finalizeGenerationFailureMock, logErrorMock } = vi.hoisted(() => ({
  finalizeGenerationFailureMock: vi.fn(),
  logErrorMock: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({ default: { error: logErrorMock } }))
vi.mock('../../../src/main/generation/finalization', () => ({
  finalizeGenerationFailure: finalizeGenerationFailureMock,
  resolveGenerationFailureSessionStatus: () => 'failed'
}))

import {
  settleEditJobFailure,
  settleEditJobSuccess
} from '../../../src/main/edit-jobs/edit-job-finalization'

describe('edit job terminal finalization', () => {
  it('persists a successful edit job before publishing its terminal event', async () => {
    const updateSessionJobStatus = vi.fn().mockResolvedValue(undefined)
    const emitRuntimeJobTerminal = vi.fn()

    await settleEditJobSuccess({
      ctx: { db: { updateSessionJobStatus }, emitRuntimeJobTerminal } as never,
      context: { sessionId: 'session-1', runId: 'run-1' } as never
    })

    expect(updateSessionJobStatus).toHaveBeenCalledWith('run-1', 'finished')
    expect(emitRuntimeJobTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      jobId: 'run-1',
      domain: 'edit',
      status: 'completed'
    })
    expect(updateSessionJobStatus.mock.invocationCallOrder[0]).toBeLessThan(
      emitRuntimeJobTerminal.mock.invocationCallOrder[0]
    )
  })

  it('persists a fallback domain terminal state before ending an edit job', async () => {
    const updateSessionJobStatus = vi.fn().mockResolvedValue(undefined)
    const updateGenerationRunStatus = vi.fn().mockResolvedValue(undefined)
    const updateSessionStatus = vi.fn().mockResolvedValue(undefined)
    const emitGenerateChunk = vi.fn()
    const emitRuntimeJobTerminal = vi.fn()
    finalizeGenerationFailureMock.mockRejectedValueOnce(new Error('database temporarily unavailable'))

    await settleEditJobFailure({
      ctx: {
        db: { updateSessionJobStatus, updateGenerationRunStatus, updateSessionStatus },
        emitGenerateChunk,
        emitRuntimeJobTerminal
      } as never,
      context: { sessionId: 'session-1', runId: 'run-1' } as never,
      error: new Error('edit failed'),
      cancelled: false,
      hasPersistedJob: true,
      logPrefix: '[test]'
    })

    expect(logErrorMock).toHaveBeenCalledOnce()
    expect(updateGenerationRunStatus).toHaveBeenCalledWith('run-1', 'failed', 'edit failed')
    expect(updateSessionStatus).toHaveBeenCalledWith('session-1', 'failed')
    expect(emitGenerateChunk).toHaveBeenCalledWith('session-1', {
      type: 'run_error',
      payload: { runId: 'run-1', message: 'edit failed', cancelled: false }
    })
    expect(updateSessionJobStatus).toHaveBeenCalledWith('run-1', 'finished', undefined)
    expect(emitRuntimeJobTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      jobId: 'run-1',
      domain: 'edit',
      status: 'failed',
      errorCode: 'edit_failed',
      errorMessage: 'edit failed'
    })
    expect(updateSessionJobStatus.mock.invocationCallOrder[0]).toBeLessThan(
      emitRuntimeJobTerminal.mock.invocationCallOrder[0]
    )
  })

  it('keeps an edit job recoverable when neither finalization nor fallback can settle it', async () => {
    const updateSessionJobStatus = vi.fn().mockResolvedValue(undefined)
    const updateGenerationRunStatus = vi.fn().mockResolvedValue(undefined)
    const updateSessionStatus = vi.fn().mockRejectedValue(new Error('session database unavailable'))
    const emitGenerateChunk = vi.fn()
    const emitRuntimeJobTerminal = vi.fn()
    finalizeGenerationFailureMock.mockRejectedValueOnce(new Error('database temporarily unavailable'))

    await settleEditJobFailure({
      ctx: {
        db: { updateSessionJobStatus, updateGenerationRunStatus, updateSessionStatus },
        emitGenerateChunk,
        emitRuntimeJobTerminal
      } as never,
      context: { sessionId: 'session-1', runId: 'run-1' } as never,
      error: new Error('edit failed'),
      cancelled: false,
      hasPersistedJob: true,
      logPrefix: '[test]'
    })

    expect(updateGenerationRunStatus).toHaveBeenCalledWith('run-1', 'failed', 'edit failed')
    expect(updateSessionStatus).toHaveBeenCalledWith('session-1', 'failed')
    expect(updateSessionJobStatus).not.toHaveBeenCalled()
    expect(emitGenerateChunk).not.toHaveBeenCalled()
    expect(emitRuntimeJobTerminal).not.toHaveBeenCalled()
  })
})
