import type { GenerateChunkEvent } from '@shared/generation'
import type { RuntimeAudience, RuntimeDomain, RuntimeOwner } from '../types'

export type ImageProgressEvent = {
  runId: string
  progress: number
  label: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  sessionId?: string
  pageId?: string
}

export type RuntimeEventMap = {
  'job.queued': { queuePosition?: number }
  'job.started': Record<string, never>
  'job.completed': { summary?: string }
  'job.failed': { errorCode: string; errorMessage: string }
  'job.cancelled': { reason: 'user' | 'timeout' | 'shutdown' }
  'generation.chunk': GenerateChunkEvent
  'image.progress': ImageProgressEvent
}

export type RuntimeEventType = keyof RuntimeEventMap

export type RuntimeEventEnvelope<K extends RuntimeEventType = RuntimeEventType> = {
  type: K
  payload: RuntimeEventMap[K]
  jobId: string
  domain: RuntimeDomain
  owner: RuntimeOwner
  audience: RuntimeAudience
  occurredAt: number
}

export type RuntimeEventFilter = {
  domain?: RuntimeDomain
  owner?: Partial<RuntimeOwner>
  subscriberId?: string
}
