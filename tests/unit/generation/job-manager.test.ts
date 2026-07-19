import { describe, expect, it, vi } from 'vitest'

const logMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({ default: logMocks }))

import { GenerateJobManager } from '../../../src/main/ipc/generation/job-manager'

describe('GenerateJobManager', () => {
  it('persists a background generation as a unified session job', async () => {
    let resolveExecution: (() => void) | undefined
    const execution = new Promise<void>((resolve) => {
      resolveExecution = resolve
    })
    const beginSessionRunState = vi.fn()
    const ctx = {
      db: {
        createGenerationRunWithSessionJob: vi.fn().mockResolvedValue(undefined),
        updateSessionJobStatus: vi.fn().mockResolvedValue(undefined)
      },
      sessionRunStates: new Map(),
      beginSessionRunState,
      emitGenerateChunk: vi.fn(),
      agentManager: {
        removeSession: vi.fn(),
        cancelSession: vi.fn()
      }
    }
    const manager = new GenerateJobManager(ctx as never)
    const reserved = manager.reserve('generate:start', 'session-1')
    if (reserved.alreadyRunning) throw new Error('expected available job reservation')

    const result = await manager.enqueue({
      reservation: reserved.reservation,
      kind: 'standard',
      context: {
        sessionId: 'session-1',
        runId: 'run-generate-1',
        styleId: 'style-1',
        previousSessionStatus: 'completed',
        effectiveMode: 'generate',
        messageScope: 'main',
        projectId: 'project-1'
      },
      totalPages: 1,
      execute: async () => execution
    })

    expect(result).toEqual({ runId: 'run-generate-1', queued: false })
    expect(ctx.db.createGenerationRunWithSessionJob).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({ id: 'run-generate-1', mode: 'generate', totalPages: 1 }),
        job: expect.objectContaining({
          id: 'run-generate-1',
          kind: 'standard',
          previousSessionStatus: 'completed',
          totalPages: 1
        })
      })
    )
    expect(beginSessionRunState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'standard'
      })
    )

    resolveExecution?.()
    await vi.waitFor(() => {
      expect(ctx.db.updateSessionJobStatus).toHaveBeenCalledWith('run-generate-1', 'finished')
    })
  })

  it('does not leave a run behind when atomic job creation fails', async () => {
    const ctx = {
      db: {
        createGenerationRunWithSessionJob: vi.fn().mockRejectedValue(new Error('job insert failed')),
        updateSessionJobStatus: vi.fn(),
        updateGenerationRunStatus: vi.fn().mockResolvedValue(undefined),
        updateSessionStatus: vi.fn().mockResolvedValue(undefined)
      },
      sessionRunStates: new Map(),
      beginSessionRunState: vi.fn(),
      emitGenerateChunk: vi.fn(),
      agentManager: {
        removeSession: vi.fn(),
        cancelSession: vi.fn()
      }
    }
    const manager = new GenerateJobManager(ctx as never)
    const reserved = manager.reserve('generate:start', 'session-2')
    if (reserved.alreadyRunning) throw new Error('expected available job reservation')

    await expect(
      manager.enqueue({
        reservation: reserved.reservation,
        kind: 'standard',
        context: {
          sessionId: 'session-2',
          runId: 'run-generate-2',
          styleId: 'style-1',
          previousSessionStatus: 'completed',
          effectiveMode: 'generate',
          messageScope: 'main',
          projectId: 'project-1'
        },
        totalPages: 1,
        execute: vi.fn()
      })
    ).rejects.toThrow('job insert failed')

    expect(ctx.db.updateGenerationRunStatus).not.toHaveBeenCalled()
    expect(ctx.db.updateSessionStatus).not.toHaveBeenCalled()
  })

  it('aborts the persisted session job when setup fails after it has been created', async () => {
    const ctx = {
      db: {
        createGenerationRunWithSessionJob: vi.fn().mockResolvedValue(undefined),
        updateSessionJobStatus: vi.fn().mockResolvedValue(undefined),
        updateGenerationRunStatus: vi.fn().mockResolvedValue(undefined),
        updateSessionStatus: vi.fn().mockResolvedValue(undefined)
      },
      sessionRunStates: new Map(),
      beginSessionRunState: vi.fn(() => {
        throw new Error('state initialization failed')
      }),
      emitGenerateChunk: vi.fn(),
      agentManager: {
        removeSession: vi.fn(),
        cancelSession: vi.fn()
      }
    }
    const manager = new GenerateJobManager(ctx as never)
    const reserved = manager.reserve('generate:start', 'session-setup-failure')
    if (reserved.alreadyRunning) throw new Error('expected available job reservation')

    await expect(
      manager.enqueue({
        reservation: reserved.reservation,
        kind: 'standard',
        context: {
          sessionId: 'session-setup-failure',
          runId: 'run-generate-setup-failure',
          styleId: 'style-1',
          previousSessionStatus: 'completed',
          effectiveMode: 'generate',
          messageScope: 'main',
          projectId: 'project-1'
        },
        totalPages: 1,
        execute: vi.fn()
      })
    ).rejects.toThrow('state initialization failed')

    expect(ctx.db.updateSessionJobStatus).toHaveBeenCalledWith(
      'run-generate-setup-failure',
      'aborted',
      { abortReason: 'setup_failed' }
    )
    expect(ctx.db.updateGenerationRunStatus).toHaveBeenCalledWith(
      'run-generate-setup-failure',
      'failed',
      'state initialization failed'
    )
  })

  it('restores session status after an interrupted persisted job', async () => {
    const ctx = {
      db: {
        listActiveSessionJobs: vi.fn().mockResolvedValue([
          {
            id: 'run-generate-3',
            session_id: 'session-3',
            previous_session_status: 'completed'
          }
        ]),
        updateSessionJobStatus: vi.fn().mockResolvedValue(undefined),
        updateGenerationRunStatus: vi.fn().mockResolvedValue(undefined),
        updateSessionStatus: vi.fn().mockResolvedValue(undefined)
      },
      sessionRunStates: new Map(),
      beginSessionRunState: vi.fn(),
      emitGenerateChunk: vi.fn(),
      agentManager: {
        removeSession: vi.fn(),
        cancelSession: vi.fn()
      }
    }
    const manager = new GenerateJobManager(ctx as never)

    await manager.abortInterruptedJobs('应用退出导致生成中断')

    expect(ctx.db.updateSessionJobStatus).toHaveBeenCalledWith('run-generate-3', 'aborted', {
      abortReason: '应用退出导致生成中断'
    })
    expect(ctx.db.updateGenerationRunStatus).toHaveBeenCalledWith(
      'run-generate-3',
      'failed',
      '应用退出导致生成中断'
    )
    expect(ctx.db.updateSessionStatus).toHaveBeenCalledWith('session-3', 'completed')
  })
})
