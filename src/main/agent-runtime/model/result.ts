export const extractModelText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const content = 'content' in value ? (value as { content?: unknown }).content : undefined
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) {
          return typeof (item as { text?: unknown }).text === 'string'
            ? String((item as { text?: unknown }).text)
            : ''
        }
        return ''
      })
      .join('\n')
      .trim()
  }
  return ''
}

export const extractJsonBlock = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const extractBalanced = (
    start: number,
    open: '{' | '[',
    close: '}' | ']'
  ): string | null => {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === open) depth += 1
      if (char === close) {
        depth -= 1
        if (depth === 0) return raw.slice(start, index + 1)
      }
    }
    return null
  }

  for (let start = 0; start < raw.length; start += 1) {
    const char = raw[start]
    const block =
      char === '{'
        ? extractBalanced(start, '{', '}')
        : char === '['
          ? extractBalanced(start, '[', ']')
          : null
    if (!block) continue
    try {
      JSON.parse(block)
      return block.trim()
    } catch {
      // This can be a prose bracket or malformed model output; keep scanning.
    }
  }
  return raw.trim()
}
