import fs from 'fs'
import path from 'path'
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

  it('handles dialog activities or runs with an active retry context', () => {
    expect(shouldHandleGenerationActivity(undefined, null)).toBe(false)
    expect(shouldHandleGenerationActivity('edit', null)).toBe(true)
    expect(shouldHandleGenerationActivity('style-switch', null)).toBe(true)
    expect(shouldHandleGenerationActivity('single-page-retry', null)).toBe(true)
    expect(shouldHandleGenerationActivity('addPage', null)).toBe(true)
    expect(
      shouldHandleGenerationActivity(undefined, { kind: 'style-switch', styleId: 'style-2' })
    ).toBe(true)
  })

  it('routes activity runs into the generation activity dialog', () => {
    const handlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )
    const addPageHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:addPage'"),
      handlerSource.indexOf("ipcMain.handle('generate:retrySinglePage'")
    )
    const retryHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:retrySinglePage'"),
      handlerSource.indexOf("ipcMain.handle('generate:cancel'")
    )
    const dialogSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/modal/GenerationActivityDialog.tsx'),
      'utf8'
    )

    expect(addPageHandler).toContain("activityKind: 'addPage'")
    expect(retryHandler).toContain("activityKind: 'single-page-retry'")
    expect(dialogSource).toContain("event.payload.activityKind === 'addPage'")
    expect(dialogSource).toContain("event.payload.activityKind === 'single-page-retry'")
  })
})
