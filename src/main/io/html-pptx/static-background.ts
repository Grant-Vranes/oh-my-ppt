import type { SlideSizePreset } from '@shared/slide-size'

export interface PptxExportLayout {
  captureWidthPx: number
  captureHeightPx: number
  slideWidthIn: number
  slideHeightIn: number
}

export interface PptxCaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export const PPTX_WIDE_LAYOUT: Omit<PptxExportLayout, 'captureWidthPx' | 'captureHeightPx'> = {
  slideWidthIn: 13.333333333,
  slideHeightIn: 7.5
}

export const PPTX_STANDARD_LAYOUT: Omit<PptxExportLayout, 'captureWidthPx' | 'captureHeightPx'> = {
  slideWidthIn: 10,
  slideHeightIn: 7.5
}

export const resolvePptxExportLayout = (slideSize: SlideSizePreset): PptxExportLayout => {
  const physicalSize =
    slideSize.id === 'wide-16-9'
      ? PPTX_WIDE_LAYOUT
      : slideSize.id === 'standard-4-3'
        ? PPTX_STANDARD_LAYOUT
        : null
  if (!physicalSize) {
    throw new Error(`Unsupported PPTX slide size: ${slideSize.id}`)
  }

  return {
    captureWidthPx: slideSize.width,
    captureHeightPx: slideSize.height,
    ...physicalSize
  }
}

export const resolvePptxCaptureRect = (
  rect: { x: number; y: number; w: number; h: number },
  layout: Pick<PptxExportLayout, 'captureWidthPx' | 'captureHeightPx'>,
  paddingPx = 0
): PptxCaptureRect | null => {
  const x = Math.min(layout.captureWidthPx, Math.max(0, rect.x - paddingPx))
  const y = Math.min(layout.captureHeightPx, Math.max(0, rect.y - paddingPx))
  const width = Math.max(0, Math.min(layout.captureWidthPx - x, rect.w + paddingPx * 2))
  const height = Math.max(0, Math.min(layout.captureHeightPx - y, rect.h + paddingPx * 2))
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

const STATIC_BACKGROUND_MIN_AREA_RATIO = 0.2
const STATIC_BACKGROUND_EDGE_TOLERANCE_PX = 2

type PptxShapeBox = {
  x: number
  y: number
  w: number
  h: number
}

// Large edge-anchored fills are structural slide backgrounds. Keeping them in
// the raster base avoids both z-order coverage and accidental animation matches.
export const isPptxStaticBackgroundShape = (
  shape: PptxShapeBox,
  layout: PptxExportLayout = {
    captureWidthPx: 1600,
    captureHeightPx: 900,
    ...PPTX_WIDE_LAYOUT
  }
): boolean => {
  const horizontalToleranceIn =
    (layout.slideWidthIn / layout.captureWidthPx) * STATIC_BACKGROUND_EDGE_TOLERANCE_PX
  const verticalToleranceIn =
    (layout.slideHeightIn / layout.captureHeightPx) * STATIC_BACKGROUND_EDGE_TOLERANCE_PX
  const area = Math.max(0, shape.w) * Math.max(0, shape.h)
  const slideArea = layout.slideWidthIn * layout.slideHeightIn
  if (area < slideArea * STATIC_BACKGROUND_MIN_AREA_RATIO) return false

  const spansHeight = shape.h >= layout.slideHeightIn - verticalToleranceIn
  // Only full-height columns and full-page fills belong in the raster base.
  // Full-width header or footer bands should remain editable shapes.
  if (!spansHeight) return false

  const touchesHorizontalEdge =
    shape.x <= horizontalToleranceIn ||
    shape.x + shape.w >= layout.slideWidthIn - horizontalToleranceIn
  const touchesVerticalEdge =
    shape.y <= verticalToleranceIn ||
    shape.y + shape.h >= layout.slideHeightIn - verticalToleranceIn

  return touchesHorizontalEdge && touchesVerticalEdge
}
