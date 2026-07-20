import { create } from 'zustand'
import type { GenerateStartPayload } from '@shared/generation'

export type GenerationRetryContext = { kind: 'edit'; payload: GenerateStartPayload }

export function shouldAutoCloseGenerationActivity(
  eventType: string,
  failedPageCount: number
): boolean {
  return eventType === 'run_completed' && failedPageCount === 0
}

export function shouldHandleGenerationActivity(
  activityKind: 'page-edit' | 'deck-edit' | 'edit' | 'single-page-retry' | 'addPage' | undefined,
  retryContext: GenerationRetryContext | null
): boolean {
  return (
    activityKind === 'edit' ||
    activityKind === 'single-page-retry' ||
    activityKind === 'addPage' ||
    retryContext !== null
  )
}

interface GenerationActivityStore {
  retryContext: GenerationRetryContext | null
  failedPageCount: number
  failedRunId: string | null
  startEdit: (payload: GenerateStartPayload) => void
  setFailedRun: (runId: string | null, count: number) => void
  reset: () => void
}

export const useGenerationActivityStore = create<GenerationActivityStore>((set) => ({
  retryContext: null,
  failedPageCount: 0,
  failedRunId: null,
  startEdit: (payload) =>
    set({ retryContext: { kind: 'edit', payload }, failedPageCount: 0, failedRunId: null }),
  setFailedRun: (failedRunId, failedPageCount) =>
    set({
      failedRunId: failedPageCount > 0 ? failedRunId : null,
      failedPageCount: Math.max(0, failedPageCount)
    }),
  reset: () => set({ retryContext: null, failedPageCount: 0, failedRunId: null })
}))
