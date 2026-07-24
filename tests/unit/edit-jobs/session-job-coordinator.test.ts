import { describe, expect, it } from 'vitest'
import { SessionJobCoordinator } from '../../../src/main/ipc/edit-jobs/session-job-coordinator'

describe('SessionJobCoordinator', () => {
  it('keeps page-edit jobs separate while preserving a session write lease', () => {
    const coordinator = new SessionJobCoordinator({ sessionRunStates: new Map() } as never)

    const generation = coordinator.reserve('generate:start', 'session-1')
    if (generation.alreadyRunning) throw new Error('expected generation lease')

    const pageEditWhileGenerating = coordinator.reserve('page-edit:start', 'session-1')
    expect(pageEditWhileGenerating).toEqual({ alreadyRunning: true, runId: undefined })

    coordinator.release(generation.lease)
    const pageEdit = coordinator.reserve('page-edit:start', 'session-1')
    if (pageEdit.alreadyRunning) throw new Error('expected page-edit lease')

    pageEdit.lease.runId = 'page-edit-run-1'
    expect(coordinator.reserve('generate:start', 'session-1')).toEqual({
      alreadyRunning: true,
      runId: 'page-edit-run-1'
    })
  })
})
