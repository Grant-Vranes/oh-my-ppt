import type { DesignContract } from '@shared/generation'

export const DEFAULT_TITLE_FONT = 'Inter'
export const DEFAULT_BODY_FONT = 'Noto Sans SC'

const DEFAULT_PALETTE = ['#ffffff', '#111827', '#2563eb', '#64748b']

export const createDefaultDesignContract = (): DesignContract => ({
  theme: 'clean modern presentation',
  background: 'light canvas with subtle neutral depth',
  palette: DEFAULT_PALETTE,
  titleStyle: 'text-4xl font-semibold text-slate-950',
  layoutMotif: 'clear editorial grids with balanced whitespace',
  chartStyle: 'simple readable charts with restrained color',
  shapeLanguage: '8px radius, light borders, subtle shadows',
  titleFont: DEFAULT_TITLE_FONT,
  bodyFont: DEFAULT_BODY_FONT
})

const parseRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    if (value.trim().length === 0) return null
    try {
      const parsed = JSON.parse(value) as unknown
      return parseRecord(parsed)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const normalizePalette = (value: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(value)) return fallback
  const colors = value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 6)
  return colors.length >= 3 ? colors : fallback
}

export const normalizeDesignContract = (value: unknown): DesignContract => {
  const fallback = createDefaultDesignContract()
  const record = parseRecord(value)
  if (!record) return fallback

  return {
    theme: normalizeText(record.theme) || fallback.theme,
    background: normalizeText(record.background) || fallback.background,
    palette: normalizePalette(record.palette, fallback.palette),
    titleStyle: normalizeText(record.titleStyle) || fallback.titleStyle,
    layoutMotif: normalizeText(record.layoutMotif) || fallback.layoutMotif,
    chartStyle: normalizeText(record.chartStyle) || fallback.chartStyle,
    shapeLanguage: normalizeText(record.shapeLanguage) || fallback.shapeLanguage,
    titleFont: normalizeText(record.titleFont) || fallback.titleFont,
    bodyFont: normalizeText(record.bodyFont) || fallback.bodyFont
  }
}

export const resolveDesignContract = (
  value: unknown
): { contract: DesignContract; shouldPersist: boolean } => {
  const record = parseRecord(value)
  const contract = normalizeDesignContract(record)
  if (!record) return { contract, shouldPersist: true }
  return {
    contract,
    shouldPersist: JSON.stringify(contract) !== JSON.stringify(record)
  }
}
