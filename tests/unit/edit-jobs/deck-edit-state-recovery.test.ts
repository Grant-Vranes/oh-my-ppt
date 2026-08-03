import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('electron-log/main.js', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('../../../src/main/generation/edit-deck-allpage-flow', () => ({
  executeDeckAllPageEditGeneration: vi.fn()
}))
vi.mock('../../../src/main/generation/edit-flow', () => ({ resolveEditContext: vi.fn() }))
vi.mock('../../../src/main/generation/generation-utils', () => ({
  createEmitAssistantMessage: vi.fn()
}))
vi.mock('../../../src/main/edit-jobs/edit-job-finalization', () => ({
  settleEditJobFailure: vi.fn(),
  settleEditJobSuccess: vi.fn()
}))

import { DeckEditJobService } from '../../../src/main/edit-jobs/deck-edit-job-service'
import { JobCoordinator } from '../../../src/main/agent-runtime'

describe('DeckEditJobService state recovery', () => {
  it('restores the retry payload and failed page count from a finished partial job', async () => {
    const sessionId = 'session-1'
    const runId = 'deck-edit-run-1'
    const retryPayload = {
      sessionId,
      modelConfigId: 'model-1',
      userMessage: 'Unify the title style',
      type: 'page' as const,
      chatType: 'main' as const,
      selectPageIds: ['page-1', 'page-2']
    }
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        getLatestSessionJob: vi.fn().mockResolvedValue({
          id: runId,
          status: 'finished',
          total_pages: 2,
          created_at: 100,
          updated_at: 120,
          abort_reason: null
        }),
        getGenerationRun: vi.fn().mockResolvedValue({
          id: runId,
          status: 'partial',
          total_pages: 2,
          error: 'page-2 failed',
          metadata: JSON.stringify({ retryPayload })
        }),
        listGenerationPages: vi.fn().mockResolvedValue([
          { page_id: 'page-1', status: 'completed' },
          { page_id: 'page-2', status: 'failed' }
        ])
      }
    }
    const service = new DeckEditJobService(ctx as never, new JobCoordinator())

    await expect(service.getState(sessionId)).resolves.toMatchObject({
      sessionId,
      runId,
      status: 'failed',
      hasActiveRun: false,
      completedPageCount: 1,
      failedPageCount: 1,
      retryPayload
    })
  })
})
