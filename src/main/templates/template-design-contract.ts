import { normalizeFontSelection, type DesignContract } from '@shared/generation'
import { parseJsonObject } from '../ipc/utils'

const DEFAULT_TITLE_FONT = 'Inter'
const DEFAULT_BODY_FONT = 'Inter'

const readText = (record: Record<string, unknown>, key: keyof Omit<DesignContract, 'palette'>): string => {
  const text = String(record[key] ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 220 ? `${text.slice(0, 220).trimEnd()}...` : text
}

function normalizePalette(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['#ffffff', '#111827', '#64748b']
  const colors = raw.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 6)
  return colors.length >= 3 ? colors : ['#ffffff', '#111827', '#64748b']
}

export function resolveTemplateDesignContract(
  value: unknown,
  metadataValue?: unknown
): DesignContract {
  const record = parseJsonObject(value)
  const metadata = parseJsonObject(metadataValue)
  const fontSelection = normalizeFontSelection(metadata.fontSelection)
  const selectedTitleFont =
    fontSelection.mode === 'pair' ? String(fontSelection.title.family || '').trim() : ''
  const selectedBodyFont =
    fontSelection.mode === 'pair' ? String(fontSelection.body.family || '').trim() : ''

  return {
    theme: readText(record, 'theme'),
    background: readText(record, 'background'),
    palette: normalizePalette(record.palette),
    titleStyle: readText(record, 'titleStyle'),
    layoutMotif: readText(record, 'layoutMotif'),
    chartStyle: readText(record, 'chartStyle'),
    shapeLanguage: readText(record, 'shapeLanguage'),
    titleFont: readText(record, 'titleFont') || selectedTitleFont || DEFAULT_TITLE_FONT,
    bodyFont: readText(record, 'bodyFont') || selectedBodyFont || DEFAULT_BODY_FONT
  }
}
