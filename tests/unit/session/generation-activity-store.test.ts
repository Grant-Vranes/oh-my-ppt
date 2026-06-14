import { beforeEach, describe, expect, it } from 'vitest'
import {
  shouldAutoCloseGenerationActivity,
  shouldHandleGenerationActivity,
  useGenerationActivityStore
} from '../../../src/renderer/src/store/generationActivityStore'

describe('generationActivityStore', () => {
  beforeEach(() => {
    useGenerationActivityStore.getState().reset()
  })

  it('keeps the original edit request for failed-page retries', () => {
    const payload = {
      sessionId: 'session-1',
      userMessage: '统一标题字号',
      type: 'page' as const,
      chatType: 'main' as const,
      selectPageIds: ['page-1', 'page-2']
    }

    useGenerationActivityStore.getState().startEdit(payload)
    useGenerationActivityStore.getState().setFailedRun('run-1', 2)

    expect(useGenerationActivityStore.getState()).toMatchObject({
      retryContext: { kind: 'edit', payload },
      failedPageCount: 2,
      failedRunId: 'run-1'
    })
  })

  it('clears style-switch and failure state together', () => {
    useGenerationActivityStore.getState().startStyleSwitch('style-2')
    useGenerationActivityStore.getState().setFailedRun('run-2', 3)
    useGenerationActivityStore.getState().reset()

    expect(useGenerationActivityStore.getState().retryContext).toBeNull()
    expect(useGenerationActivityStore.getState().failedPageCount).toBe(0)
    expect(useGenerationActivityStore.getState().failedRunId).toBeNull()
  })

  it('auto-closes every successful run completion without requiring activity context', () => {
    expect(shouldAutoCloseGenerationActivity('run_completed', 0)).toBe(true)
    expect(shouldAutoCloseGenerationActivity('run_completed', 1)).toBe(false)
    expect(shouldAutoCloseGenerationActivity('run_error', 0)).toBe(false)
  })

  it('handles only edit activities or runs with an active retry context', () => {
    expect(shouldHandleGenerationActivity(undefined, null)).toBe(false)
    expect(shouldHandleGenerationActivity('edit', null)).toBe(true)
    expect(shouldHandleGenerationActivity('style-switch', null)).toBe(true)
    expect(
      shouldHandleGenerationActivity(undefined, { kind: 'style-switch', styleId: 'style-2' })
    ).toBe(true)
  })
})
