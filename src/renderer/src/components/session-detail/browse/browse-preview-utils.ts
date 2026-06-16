export function limitBrowsePreviewIds(ids: ReadonlySet<string>, limit: number): Set<string> {
  if (limit <= 0) return new Set()
  if (ids.size <= limit) return new Set(ids)
  return new Set(Array.from(ids).slice(0, limit))
}
