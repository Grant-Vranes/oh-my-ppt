import type {
  EditableElementSnapshot,
  EditSelectionPayload
} from '@renderer/components/preview/edit-mode-script'
import type { ElementEditDraft } from './types'

export const EMPTY_ELEMENT_DRAFT: ElementEditDraft = {
  html: '',
  text: '',
  color: '#34402c',
  fontSize: '',
  fontWeight: '400',
  textAlign: 'left',
  layoutX: '',
  layoutY: '',
  layoutWidth: '',
  layoutHeight: '',
  layoutZIndex: '',
  opacity: '1',
  backgroundColor: '#ffffff',
  objectFit: 'contain',
  alt: '',
  poster: '',
  controls: false,
  muted: false,
  loop: false,
  autoplay: false,
  playsInline: true,
  preload: 'metadata',
  artTextTemplateId: '',
  formulaLatex: '',
  formulaHtml: '',
  formulaDisplayMode: false,
  chartType: 'bar',
  chartTitle: '',
  chartLabels: '',
  chartValues: '',
  chartDataJson: '',
  chartPrimaryColor: '#5d6b4d',
  chartAccentColor: '#8fbc8f',
  chartTextColor: '#2f3b28',
  chartSmooth: true,
  chartHorizontal: false,
  chartStacked: false,
  chartAreaFill: true,
  chartShowPoints: true,
  chartShowLegend: false,
  chartDoughnutCutout: '58',
  chartRadarFill: true,
  chartConfigJson: ''
}

export function rgbToHex(value: string | undefined): string {
  const text = String(value || '').trim()
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return text
  const match = text.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i)
  if (!match) return '#34402c'
  const toHex = (part: string): string =>
    Math.max(0, Math.min(255, Number(part) || 0))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`
}

export function fontSizeToNumber(value: string | undefined): string {
  const parsed = Number(String(value || '').replace(/px$/i, ''))
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : ''
}

export function normalizeFontWeight(value: string | undefined): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value === 'bold' ? '700' : '400'
  return String(Math.max(300, Math.min(800, Math.round(parsed / 100) * 100)))
}

export function normalizeTextAlign(value: string | undefined): string {
  const text = String(value || '').trim()
  if (text === 'center' || text === 'right' || text === 'justify') return text
  return 'left'
}

export function opacityToInput(value: string | undefined): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(Math.max(0, Math.min(1, parsed))) : '1'
}

export function buildSelectedElementFromSnapshot(args: {
  selector: string
  blockId?: string
  snapshot: EditableElementSnapshot
}): EditSelectionPayload {
  const { selector, blockId, snapshot } = args
  const rawZIndex = snapshot.computed.zIndex || ''
  const zIndex = rawZIndex && rawZIndex !== 'auto' ? parseInt(rawZIndex, 10) : undefined
  return {
    selector,
    blockId,
    label: snapshot.label,
    elementTag: snapshot.elementTag,
    elementText: snapshot.elementText,
    kind: snapshot.kind,
    capabilities: snapshot.capabilities,
    snapshot: {
      ...snapshot,
      selector,
      blockId
    },
    isText: Boolean(snapshot.text?.editable),
    text: snapshot.text?.value || '',
    html: snapshot.text?.html || '',
    style: {
      color: snapshot.computed.color || '',
      fontSize: snapshot.computed.fontSize || '',
      fontWeight: snapshot.computed.fontWeight || '',
      textAlign: normalizeTextAlign(snapshot.computed.textAlign),
      lineHeight: snapshot.computed.lineHeight || '',
      backgroundColor: snapshot.computed.svgPaintColor || snapshot.computed.backgroundColor || ''
    },
    bounds: snapshot.metrics.viewport,
    viewportBounds: snapshot.metrics.viewport,
    pageBounds: snapshot.metrics.page,
    translateX: snapshot.metrics.translateX,
    translateY: snapshot.metrics.translateY,
    zIndex: Number.isFinite(zIndex) ? zIndex : undefined,
    editability: { x: true, y: true, width: true, height: true }
  }
}
