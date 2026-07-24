import type { GenerateChunkEvent } from '@shared/generation'

type ActivePageEditJob = {
  runId?: string
} | null

function matchesActiveJobRun(
  payload: Pick<GenerateChunkEvent['payload'], 'runId'>,
  activeJob: ActivePageEditJob
): boolean {
  return Boolean(payload.runId && activeJob?.runId && payload.runId === activeJob.runId)
}

export function isPageEditGenerationEvent(
  payload: Pick<GenerateChunkEvent['payload'], 'activityKind' | 'runId'>,
  activePageEditJob: ActivePageEditJob
): boolean {
  return matchesActiveJobRun(payload, activePageEditJob)
}

export function isDeckEditGenerationEvent(
  payload: Pick<GenerateChunkEvent['payload'], 'activityKind' | 'runId'>,
  activeDeckEditJob: ActivePageEditJob
): boolean {
  return matchesActiveJobRun(payload, activeDeckEditJob)
}

export function isPageBeautifyGenerationEvent(
  payload: Pick<GenerateChunkEvent['payload'], 'activityKind' | 'runId'>,
  activePageBeautifyJob: ActivePageEditJob
): boolean {
  return matchesActiveJobRun(payload, activePageBeautifyJob)
}
