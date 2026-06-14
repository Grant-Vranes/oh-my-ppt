import { stripInternalEditConfirmations } from '@shared/edit-output'
import type { GenerateChunkEvent } from '@shared/generation'

type ActivityLogLabels = {
  processing: string
  completed: string
  runFailed: string
  pageFailed: (page: number, title: string) => string
  pageContext: (page: number, title: string) => string
  partialCompleted: (count: number) => string
  unknownError: string
}

export type GenerationActivityLogContent = {
  label: string
  detail?: string
}

export type GenerationActivityStatus = 'running' | 'completed' | 'cancelled' | 'failed'

export function resolveGenerationActivityStatus(
  event: GenerateChunkEvent,
  failedPageCount: number
): GenerationActivityStatus {
  if (event.type === 'run_completed') {
    return failedPageCount > 0 ? 'failed' : 'completed'
  }
  if (event.type === 'run_error') {
    return event.payload.cancelled ? 'cancelled' : 'failed'
  }
  return 'running'
}

const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  return stripInternalEditConfirmations(value) || undefined
}

const pageContext = (
  event: GenerateChunkEvent,
  labels: ActivityLogLabels
): string | undefined => {
  if (!('pageNumber' in event.payload) || typeof event.payload.pageNumber !== 'number') {
    return undefined
  }
  const title =
    'title' in event.payload && typeof event.payload.title === 'string'
      ? event.payload.title
      : ''
  return labels.pageContext(event.payload.pageNumber, title)
}

export function buildGenerationActivityLogContent(
  event: GenerateChunkEvent,
  labels: ActivityLogLabels
): GenerationActivityLogContent {
  const eventLabel = 'label' in event.payload ? clean(event.payload.label) : undefined
  const eventDetail = 'detail' in event.payload ? clean(event.payload.detail) : undefined

  if (event.type === 'page_failed') {
    return {
      label: labels.pageFailed(event.payload.pageNumber, event.payload.title || ''),
      detail: clean(event.payload.error) || eventDetail || labels.unknownError
    }
  }
  if (event.type === 'run_error') {
    return {
      label: labels.runFailed,
      detail: clean(event.payload.message) || labels.unknownError
    }
  }
  if (event.type === 'run_completed') {
    const failedPageCount = event.payload.failedPageCount || 0
    return {
      label:
        failedPageCount > 0 ? labels.partialCompleted(failedPageCount) : labels.completed
    }
  }

  return {
    label: eventLabel || labels.processing,
    detail: eventDetail || pageContext(event, labels)
  }
}
