import type { GenerateChunkEvent } from '@shared/generation'

type ActivePageEditJob = {
  runId?: string
} | null

export function isPageEditGenerationEvent(
  payload: Pick<GenerateChunkEvent['payload'], 'activityKind' | 'runId'>,
  activePageEditJob: ActivePageEditJob
): boolean {
  if (payload.activityKind === 'page-edit') return true
  if (!activePageEditJob) return false

  return Boolean(payload.runId && activePageEditJob.runId === payload.runId)
}

export function isDeckEditGenerationEvent(
  payload: Pick<GenerateChunkEvent['payload'], 'activityKind' | 'runId'>,
  activeDeckEditJob: ActivePageEditJob
): boolean {
  if (payload.activityKind === 'deck-edit') return true
  if (!activeDeckEditJob) return false
  return Boolean(payload.runId && activeDeckEditJob.runId === payload.runId)
}
