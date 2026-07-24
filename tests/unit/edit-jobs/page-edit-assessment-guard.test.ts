import { describe, expect, it, vi } from 'vitest'

const { assessPageEditMock } = vi.hoisted(() => ({ assessPageEditMock: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('electron-log/main.js', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('../../../src/main/ipc/generation/edit-flow', () => ({
  assessPageEdit: assessPageEditMock,
  executeEditGeneration: vi.fn(),
  resolveEditContext: vi.fn()
}))
vi.mock('../../../src/main/ipc/generation/generation-utils', () => ({
  createEmitAssistantMessage: vi.fn(),
  resolvePageHtmlPath: vi.fn()
}))
vi.mock('../../../src/main/ipc/edit-jobs/edit-job-finalization', () => ({
  settleEditJobFailure: vi.fn()
}))

import { PageEditJobService } from '../../../src/main/ipc/edit-jobs/page-edit-job-service'
import { SessionJobCoordinator } from '../../../src/main/ipc/edit-jobs/session-job-coordinator'

describe('PageEditJobService assessment guard', () => {
  it('does not start a read-only assessment while the session has a write job', async () => {
    const sessionId = 'session-1'
    const ctx = {
      sessionRunStates: new Map([
        [
          sessionId,
          {
            runId: 'active-run',
            status: 'running'
          }
        ]
      ])
    }
    const service = new PageEditJobService(ctx as never, new SessionJobCoordinator(ctx as never))

    await expect(
      service.assess({
        sessionId,
        userMessage: 'Change the title',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-1'
      })
    ).rejects.toThrow('当前有页面修改任务正在执行')
    expect(assessPageEditMock).not.toHaveBeenCalled()
  })

  it('does not start an assessment while the coordinator holds an active lease', async () => {
    const sessionId = 'session-lease'
    const ctx = { sessionRunStates: new Map() }
    const coordinator = new SessionJobCoordinator(ctx as never)
    coordinator.reserve('deck-edit:start', sessionId)
    const service = new PageEditJobService(ctx as never, coordinator)

    await expect(
      service.assess({
        sessionId,
        userMessage: 'Change the title',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-1'
      })
    ).rejects.toThrow('当前有页面修改任务正在执行')
    expect(assessPageEditMock).not.toHaveBeenCalled()
  })

  it('aborts an in-flight assessment before reserving a page-edit job', async () => {
    const sessionId = 'session-assessment-race'
    const ctx = { sessionRunStates: new Map() }
    const coordinator = new SessionJobCoordinator(ctx as never)
    const service = new PageEditJobService(ctx as never, coordinator)
    assessPageEditMock.mockImplementationOnce(
      (_ctx: unknown, _payload: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )

    const assessment = service.assess({
      sessionId,
      userMessage: 'Change the title',
      type: 'page',
      chatType: 'page',
      selectedPageId: 'page-1'
    })
    const assessmentCancelled = expect(assessment).rejects.toThrow('生成已取消')
    await Promise.resolve()

    coordinator.reserve('deck-edit:start', sessionId)
    await expect(
      service.start({} as Electron.IpcMainInvokeEvent, {
        sessionId,
        userMessage: 'Change the title',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-1',
        autoApply: true
      })
    ).resolves.toMatchObject({ alreadyRunning: true })
    await assessmentCancelled
  })
})
