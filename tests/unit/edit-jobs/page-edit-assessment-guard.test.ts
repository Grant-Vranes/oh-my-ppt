import { describe, expect, it, vi } from 'vitest'

const { assessPageEditMock, executeEditGenerationMock, resolveEditContextMock } = vi.hoisted(() => ({
  assessPageEditMock: vi.fn(),
  executeEditGenerationMock: vi.fn(),
  resolveEditContextMock: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('electron-log/main.js', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('../../../src/main/generation/edit-flow', () => ({
  assessPageEdit: assessPageEditMock,
  executeEditGeneration: executeEditGenerationMock,
  resolveEditContext: resolveEditContextMock
}))
vi.mock('../../../src/main/generation/generation-utils', () => ({
  createEmitAssistantMessage: vi.fn(),
  resolvePageHtmlPath: vi.fn()
}))
vi.mock('../../../src/main/edit-jobs/edit-job-finalization', () => ({
  settleEditJobFailure: vi.fn(),
  settleEditJobSuccess: vi.fn()
}))

import { PageEditJobService } from '../../../src/main/edit-jobs/page-edit-job-service'
import { JobCoordinator, sessionLockKey } from '../../../src/main/agent-runtime'

const reserveSessionWrite = async (coordinator: JobCoordinator, sessionId: string): Promise<void> => {
  const result = await coordinator.reserve({
    jobId: `existing-${sessionId}`,
    domain: 'edit',
    owner: { kind: 'session', id: sessionId },
    claims: { write: [sessionLockKey(sessionId)] },
    wait: 'fail'
  })
  if (result.status !== 'acquired') throw new Error('expected existing session write lease')
}

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
    const service = new PageEditJobService(ctx as never, new JobCoordinator())

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
    const coordinator = new JobCoordinator()
    await reserveSessionWrite(coordinator, sessionId)
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

  it('replaces a prior assessment through its JobCoordinator lease', async () => {
    const sessionId = 'session-replace-assessment'
    const coordinator = new JobCoordinator()
    const service = new PageEditJobService({ sessionRunStates: new Map() } as never, coordinator)
    assessPageEditMock.mockImplementationOnce(
      (_ctx: unknown, _payload: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )
    assessPageEditMock.mockResolvedValueOnce({ reply: 'new assessment' })

    const firstAssessment = service.assess({
      sessionId,
      userMessage: 'Change the title',
      type: 'page',
      chatType: 'page',
      selectedPageId: 'page-1'
    })
    await vi.waitFor(() => {
      expect(coordinator.getByOwner({ kind: 'session', id: sessionId })).toMatchObject({
        state: 'active'
      })
    })

    await expect(
      service.assess({
        sessionId,
        userMessage: 'Change the title again',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-1'
      })
    ).resolves.toEqual({ reply: 'new assessment' })
    await expect(firstAssessment).rejects.toThrow('生成已取消')
    expect(coordinator.getByOwner({ kind: 'session', id: sessionId })).toBeNull()
  })

  it('cancels and waits for an in-flight read assessment before reserving a page-edit writer', async () => {
    const sessionId = 'session-assessment-race'
    const ctx = {
      db: {
        listSessionPages: vi.fn().mockResolvedValue([
          {
            id: 'page-1',
            file_slug: 'page-1',
            html_path: '',
            page_number: 1
          }
        ]),
        createGenerationRunWithSessionJob: vi.fn().mockResolvedValue(undefined)
      },
      sessionRunStates: new Map(),
      beginSessionRunState: vi.fn(),
      emitGenerateChunk: vi.fn(),
      agentManager: { removeSession: vi.fn() }
    }
    const coordinator = new JobCoordinator()
    const service = new PageEditJobService(ctx as never, coordinator)
    resolveEditContextMock.mockImplementation(
      async (
        _ctx: unknown,
        _event: unknown,
        _payload: unknown,
        execution: { runId: string; abortSignal: AbortSignal }
      ) =>
        ({
          sessionId,
          runId: execution.runId,
          abortSignal: execution.abortSignal,
          selectedPageId: 'page-1',
          projectDir: '/tmp/page-edit-assessment-race',
          previousSessionStatus: 'completed',
          effectiveMode: 'edit',
          messageScope: 'page',
          projectId: 'project-1'
        })
    )
    executeEditGenerationMock.mockResolvedValue(undefined)
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
    await vi.waitFor(() => {
      expect(coordinator.getByOwner({ kind: 'session', id: sessionId })).toMatchObject({
        claims: { read: [sessionLockKey(sessionId)] }
      })
    })

    await expect(
      service.start({} as Electron.IpcMainInvokeEvent, {
        sessionId,
        userMessage: 'Change the title',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-1',
        autoApply: true
      })
    ).resolves.toMatchObject({ success: true })
    await assessmentCancelled
    await vi.waitFor(() => {
      expect(coordinator.getByOwner({ kind: 'session', id: sessionId })).toBeNull()
    })
  })
})
