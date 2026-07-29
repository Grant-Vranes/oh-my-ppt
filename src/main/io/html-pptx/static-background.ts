export const PPTX_SLIDE_WIDTH_IN = 13.333
export const PPTX_SLIDE_HEIGHT_IN = 7.5

const STATIC_BACKGROUND_MIN_AREA_RATIO = 0.2
const PPTX_CAPTURE_WIDTH_PX = 1600
const STATIC_BACKGROUND_EDGE_TOLERANCE_PX = 2
export const PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN =
  (PPTX_SLIDE_WIDTH_IN / PPTX_CAPTURE_WIDTH_PX) * STATIC_BACKGROUND_EDGE_TOLERANCE_PX

type PptxShapeBox = {
  x: number
  y: number
  w: number
  h: number
}

// Large edge-anchored fills are structural slide backgrounds. Keeping them in
// the raster base avoids both z-order coverage and accidental animation matches.
export const isPptxStaticBackgroundShape = (shape: PptxShapeBox): boolean => {
  const area = Math.max(0, shape.w) * Math.max(0, shape.h)
  const slideArea = PPTX_SLIDE_WIDTH_IN * PPTX_SLIDE_HEIGHT_IN
  if (area < slideArea * STATIC_BACKGROUND_MIN_AREA_RATIO) return false

  const spansWidth = shape.w >= PPTX_SLIDE_WIDTH_IN - PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN
  const spansHeight = shape.h >= PPTX_SLIDE_HEIGHT_IN - PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN
  if (!spansWidth && !spansHeight) return false

  const touchesHorizontalEdge =
    shape.x <= PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN ||
    shape.x + shape.w >= PPTX_SLIDE_WIDTH_IN - PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN
  const touchesVerticalEdge =
    shape.y <= PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN ||
    shape.y + shape.h >= PPTX_SLIDE_HEIGHT_IN - PPTX_STATIC_BACKGROUND_EDGE_TOLERANCE_IN

  return touchesHorizontalEdge && touchesVerticalEdge
}
