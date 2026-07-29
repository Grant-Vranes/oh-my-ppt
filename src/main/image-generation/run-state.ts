export type ImageRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export type ImageRunState = {
  runId: string
  sessionId: string
  pageId: string
  progress: number
  label: string
  status: ImageRunStatus
  error?: string
  updatedAt: number
}

const imageRunStates = new Map<string, ImageRunState>()

export function setImageRunState(state: ImageRunState): void {
  imageRunStates.set(state.sessionId, state)
}

export function getImageRunState(sessionId: string): ImageRunState | undefined {
  return imageRunStates.get(sessionId)
}
