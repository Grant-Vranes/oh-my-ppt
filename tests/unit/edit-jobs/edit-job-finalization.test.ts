import { describe, expect, it, vi } from 'vitest'

const { finalizeGenerationFailureMock, logErrorMock } = vi.hoisted(() => ({
  finalizeGenerationFailureMock: vi.fn(),
  logErrorMock: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({ default: { error: logErrorMock } }))
vi.mock('../../../src/main/ipc/generation/finalization', () => ({
  finalizeGenerationFailure: finalizeGenerationFailureMock
}))

import { settleEditJobFailure } from '../../../src/main/ipc/edit-jobs/edit-job-finalization'

describe('settleEditJobFailure', () => {
  it('settles the persisted job even when generation finalization fails', async () => {
    const updateSessionJobStatus = vi.fn().mockResolvedValue(undefined)
    finalizeGenerationFailureMock.mockRejectedValueOnce(new Error('database temporarily unavailable'))

    await settleEditJobFailure({
      ctx: { db: { updateSessionJobStatus } } as never,
      context: { sessionId: 'session-1', runId: 'run-1' } as never,
      error: new Error('edit failed'),
      cancelled: false,
      hasPersistedJob: true,
      logPrefix: '[test]'
    })

    expect(logErrorMock).toHaveBeenCalledOnce()
    expect(updateSessionJobStatus).toHaveBeenCalledWith('run-1', 'finished', undefined)
  })
})
