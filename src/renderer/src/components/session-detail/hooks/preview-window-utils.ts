export interface PreviewWindowCandidate {
  id: string
  distance: number
}

export function selectPreviewWindowIds(
  candidates: PreviewWindowCandidate[],
  limit: number
): Set<string> {
  if (limit <= 0) return new Set()

  return new Set(
    candidates
      .filter((candidate) => candidate.id && Number.isFinite(candidate.distance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((candidate) => candidate.id)
  )
}
