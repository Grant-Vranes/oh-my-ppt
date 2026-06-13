export type StyleCaseItem = {
  styleCase?: string
}

export type StyleCaseOption = {
  label: string
  count: number
}

export function parseStyleCases(styleCase?: string): string[] {
  if (!styleCase) return []
  return Array.from(
    new Set(
      styleCase
        .split(/[、,，;；\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

export function buildStyleCaseOptions(items: StyleCaseItem[]): StyleCaseOption[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const styleCase of parseStyleCases(item.styleCase)) {
      counts.set(styleCase, (counts.get(styleCase) || 0) + 1)
    }
  }

  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')
  )
}

export function filterByStyleCase<T extends StyleCaseItem>(items: T[], styleCase: string): T[] {
  if (!styleCase) return items
  return items.filter((item) => parseStyleCases(item.styleCase).includes(styleCase))
}
