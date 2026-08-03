const REMOTE_RUNTIME_RESOURCE_RE =
  /<(script|link)\b[^>]*(?:src|href)\s*=\s*["'](?:https?:)?\/\/[^"']+["'][^>]*>/gi

/** Returns the external runtime resources forbidden in persisted slide HTML. */
export const extractRemoteRuntimeResources = (content: string): string[] => {
  const hits: string[] = []
  REMOTE_RUNTIME_RESOURCE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REMOTE_RUNTIME_RESOURCE_RE.exec(content)) !== null) {
    const raw = match[0].replace(/\s+/g, ' ').trim()
    hits.push(raw.length > 200 ? `${raw.slice(0, 200)}…` : raw)
    if (hits.length >= 8) break
  }
  return hits
}
