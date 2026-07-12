import type { Chart, Element } from '@arcsin1/pptx2json'
import type { SlideAnimationPlan } from '../pptx-animation-import'

export type ImportWarning = {
  pageNumber?: number
  message: string
}

export type PptxImportProgressPayload = {
  sessionId?: string
  stage: 'reading' | 'parsing' | 'media' | 'pages' | 'index' | 'database' | 'completed'
  progress: number
  label: string
  pageNumber?: number
  totalPages?: number
}

export type ImportProgress = (payload: PptxImportProgressPayload) => void

export type ImageRegistry = {
  index: number
  byKey: Map<string, string>
}

export type ImportedTableBorder = {
  borderColor?: string
  borderWidth?: number
  borderType?: string
}

export type ImportedTableCell = {
  text?: string
  rowSpan?: number
  colSpan?: number
  vMerge?: number
  hMerge?: number
  fillColor?: string
  fontColor?: string
  fontBold?: boolean
  vAlign?: string
  borders?: Partial<Record<TableBorderSide, ImportedTableBorder>>
}

export type TableBorderSide = 'top' | 'right' | 'bottom' | 'left'

export type FlattenedElement = {
  element: Element
  left: number
  top: number
  width: number
  height: number
  text: string
}

export type TextImportAdjustment = {
  content: string
  extraCss: string[]
}

export type SlideAnimationContext = {
  plan?: SlideAnimationPlan
  usedAnimationIds: Set<number>
}

export type SvgShapeFill = {
  defs: string[]
  paint: string
  content?: string
}

export type ZIndexCounter = {
  value: number
}

export type ImportedPptxPage = {
  pageNumber: number
  pageId: string
  title: string
  htmlPath: string
  html: string
  contentOutline: string
}

export type ImportedPptxDeck = {
  title: string
  pageCount: number
  indexPath: string
  pages: ImportedPptxPage[]
  warnings: string[]
}

export type PptxChartRewriteRequest = {
  element: Chart
  blockId: string
  pageId: string
  chartIndex: number
  canvasId: string
  frameStyle: string
  animationAttrs: string
  pageNumber?: number
}

export type PptxChartRewriteResult = {
  config: Record<string, unknown>
  warnings?: string[]
}

export type PptxChartRewriteHandler = (
  request: PptxChartRewriteRequest
) => Promise<PptxChartRewriteResult | null>
