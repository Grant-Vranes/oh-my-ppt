import {
  createAbortError,
  ResourceLock,
  resourceClaimsConflict,
  type ReleaseFunc
} from '../lock/resource-lock'
import type {
  ActiveJob,
  JobLease,
  JobOwner,
  JobReservationArgs,
  JobReservationResult
} from './types'

type ManagedJob = ActiveJob & {
  ownerToken: symbol
  controller: AbortController
  releaseLock?: ReleaseFunc
  removeExternalAbortListener: () => void
  released: boolean
}

const ownerKey = (owner: JobOwner): string => `${owner.kind}:${owner.id}`

const relayAbort = (source: AbortSignal | undefined, target: AbortController): (() => void) => {
  if (!source) return () => undefined
  const abort = (): void => target.abort(source.reason)
  if (source.aborted) {
    abort()
    return () => undefined
  }
  source.addEventListener('abort', abort, { once: true })
  return () => source.removeEventListener('abort', abort)
}

/** The sole owner of resource claims and run-level cancellation for Runtime jobs. */
export class JobCoordinator {
  private readonly lock: ResourceLock
  private readonly jobsById = new Map<string, ManagedJob>()
  private readonly jobIdByOwner = new Map<string, string>()

  constructor(lock = new ResourceLock()) {
    this.lock = lock
  }

  async reserve(args: JobReservationArgs): Promise<JobReservationResult> {
    if (args.wait === 'fail') return this.tryReserve(args)
    if (this.jobsById.has(args.jobId)) {
      return { status: 'busy', conflictingJobId: args.jobId }
    }
    const existingJobId = this.jobIdByOwner.get(ownerKey(args.owner))
    if (existingJobId) return { status: 'busy', conflictingJobId: existingJobId }
    if (args.signal?.aborted) throw createAbortError()

    const controller = new AbortController()
    const job: ManagedJob = {
      jobId: args.jobId,
      domain: args.domain,
      owner: args.owner,
      state: 'waiting',
      claims: args.claims,
      ownerToken: Symbol(args.jobId),
      controller,
      removeExternalAbortListener: relayAbort(args.signal, controller),
      released: false
    }
    this.jobsById.set(job.jobId, job)
    this.jobIdByOwner.set(ownerKey(job.owner), job.jobId)

    try {
      const releaseLock = await this.lock.acquire(job.claims, {
        ownerToken: job.ownerToken,
        signal: controller.signal,
        wait: args.wait
      })
      if (!releaseLock) {
        const conflictingJobId = this.findConflictingJobId(job)
        this.removeJob(job)
        if (!conflictingJobId) {
          throw new Error('ResourceLock reported a conflict without a registered Runtime job')
        }
        return { status: 'busy', conflictingJobId }
      }

      job.releaseLock = releaseLock
      job.state = 'active'
      return {
        status: 'acquired',
        lease: this.createLease(job)
      }
    } catch (error) {
      this.removeJob(job)
      throw error
    }
  }

  /**
   * Non-waiting variant for old synchronous IPC handlers. It keeps the same
   * owner map, claims, and cancellation controller as async reserve().
   */
  tryReserve(args: JobReservationArgs): JobReservationResult {
    if (args.wait !== 'fail') {
      throw new Error('JobCoordinator.tryReserve only supports wait=fail')
    }
    if (this.jobsById.has(args.jobId)) {
      return { status: 'busy', conflictingJobId: args.jobId }
    }
    const existingJobId = this.jobIdByOwner.get(ownerKey(args.owner))
    if (existingJobId) return { status: 'busy', conflictingJobId: existingJobId }
    if (args.signal?.aborted) throw createAbortError()

    const controller = new AbortController()
    const job: ManagedJob = {
      jobId: args.jobId,
      domain: args.domain,
      owner: args.owner,
      state: 'waiting',
      claims: args.claims,
      ownerToken: Symbol(args.jobId),
      controller,
      removeExternalAbortListener: relayAbort(args.signal, controller),
      released: false
    }
    this.jobsById.set(job.jobId, job)
    this.jobIdByOwner.set(ownerKey(job.owner), job.jobId)

    try {
      const releaseLock = this.lock.tryAcquire(job.claims, {
        ownerToken: job.ownerToken,
        signal: controller.signal
      })
      if (!releaseLock) {
        const conflictingJobId = this.findConflictingJobId(job)
        this.removeJob(job)
        if (!conflictingJobId) {
          throw new Error('ResourceLock reported a conflict without a registered Runtime job')
        }
        return { status: 'busy', conflictingJobId }
      }

      job.releaseLock = releaseLock
      job.state = 'active'
      return { status: 'acquired', lease: this.createLease(job) }
    } catch (error) {
      this.removeJob(job)
      throw error
    }
  }

  cancel(jobId: string): boolean {
    const job = this.jobsById.get(jobId)
    if (!job || job.controller.signal.aborted) return false
    job.controller.abort()
    return true
  }

  cancelOwner(owner: JobOwner): number {
    let cancelled = 0
    for (const job of this.jobsById.values()) {
      if (job.owner.kind === owner.kind && job.owner.id === owner.id && this.cancel(job.jobId)) {
        cancelled += 1
      }
    }
    return cancelled
  }

  getByOwner(owner: JobOwner): ActiveJob | null {
    const jobId = this.jobIdByOwner.get(ownerKey(owner))
    const job = jobId ? this.jobsById.get(jobId) : undefined
    return job ? this.toActiveJob(job) : null
  }

  private createLease(job: ManagedJob): JobLease {
    return {
      jobId: job.jobId,
      signal: job.controller.signal,
      release: () => this.release(job)
    }
  }

  private release(job: ManagedJob): void {
    if (job.released) return
    job.released = true
    job.releaseLock?.()
    this.removeJob(job)
  }

  private removeJob(job: ManagedJob): void {
    job.removeExternalAbortListener()
    if (this.jobsById.get(job.jobId) === job) this.jobsById.delete(job.jobId)
    if (this.jobIdByOwner.get(ownerKey(job.owner)) === job.jobId) {
      this.jobIdByOwner.delete(ownerKey(job.owner))
    }
  }

  private findConflictingJobId(job: ManagedJob): string | undefined {
    for (const candidate of this.jobsById.values()) {
      if (candidate === job) continue
      if (resourceClaimsConflict(job.claims, candidate.claims)) return candidate.jobId
    }
    return undefined
  }

  private toActiveJob(job: ManagedJob): ActiveJob {
    return {
      jobId: job.jobId,
      domain: job.domain,
      owner: job.owner,
      state: job.state,
      claims: job.claims
    }
  }
}
