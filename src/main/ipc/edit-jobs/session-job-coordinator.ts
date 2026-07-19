import type { IpcContext } from '../context'

export type SessionJobLease = {
  sessionId: string
  operation: string
  createdAt: number
  controller: AbortController
  runId?: string
}

export type SessionJobOwner = 'page-edit' | 'deck-edit' | 'generate'

export class SessionJobCoordinator {
  private leases = new Map<string, SessionJobLease>()

  constructor(private ctx: Pick<IpcContext, 'sessionRunStates'>) {}

  reserve(
    operation: string,
    sessionId: string
  ):
    | { alreadyRunning: true; runId?: string }
    | { alreadyRunning: false; lease: SessionJobLease } {
    const existingLease = this.leases.get(sessionId)
    if (existingLease) return { alreadyRunning: true, runId: existingLease.runId }

    const existingRunState = this.ctx.sessionRunStates.get(sessionId)
    if (existingRunState?.status === 'queued' || existingRunState?.status === 'running') {
      return { alreadyRunning: true, runId: existingRunState.runId }
    }

    const lease: SessionJobLease = {
      sessionId,
      operation,
      createdAt: Date.now(),
      controller: new AbortController()
    }
    this.leases.set(sessionId, lease)
    return { alreadyRunning: false, lease }
  }

  get(sessionId: string): SessionJobLease | undefined {
    return this.leases.get(sessionId)
  }

  isOwnedBy(sessionId: string, owner: SessionJobOwner): boolean {
    const lease = this.leases.get(sessionId)
    return Boolean(lease && lease.operation.split(':', 1)[0] === owner)
  }

  release(lease: SessionJobLease | null | undefined): void {
    if (!lease) return
    if (this.leases.get(lease.sessionId) === lease) {
      this.leases.delete(lease.sessionId)
    }
  }
}
