import type { SvgPathBounds } from '@arcsin1/pptx-ooxml-geometry'
import type { PptxXmlShapeMetadata } from './xml-shape-metadata'

const PRESET_SHAPES_WITH_LOCAL_VIEWBOX = new Set([
  'arc',
  'blockarc',
  'chevron',
  'curvedleftarrow',
  'curvedrightarrow',
  'donut',
  'ellipse',
  'line',
  'parallelogram',
  'pie',
  'rect',
  'round1rect',
  'roundrect',
  'straightconnector1',
  'trapezoid',
  'triangle'
])

const clampNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/**
 * Adapts a geometry-only SVG bound to the imported element frame. This stays
 * in the application because it relies on importer metadata and render policy.
 */
export const getSvgShapeViewBox = (
  element: Record<string, unknown>,
  pathBounds: SvgPathBounds,
  pathData: string,
  xmlShape?: PptxXmlShapeMetadata
): SvgPathBounds => {
  const width = clampNumber(element.width)
  const height = clampNumber(element.height)
  const xmlPreset = xmlShape?.preset.toLowerCase() || ''
  const epsilon = 0.5
  const pathMaxX = pathBounds.minX + pathBounds.width
  const pathMaxY = pathBounds.minY + pathBounds.height
  const pathFitsElement =
    pathBounds.minX >= -epsilon &&
    pathBounds.minY >= -epsilon &&
    pathMaxX <= width + epsilon &&
    pathMaxY <= height + epsilon
  if (width > 0 && height > 0 && xmlShape?.isCustomGeometry && pathFitsElement) {
    return {
      minX: 0,
      minY: 0,
      width: Math.max(0.0001, width),
      height: Math.max(0.0001, height)
    }
  }
  if (width > 0 && height > 0 && PRESET_SHAPES_WITH_LOCAL_VIEWBOX.has(xmlPreset)) {
    return {
      minX: 0,
      minY: 0,
      width: Math.max(0.0001, width),
      height: Math.max(0.0001, height)
    }
  }
  const pathFillsElement = pathBounds.width >= width * 0.9 && pathBounds.height >= height * 0.9
  const pathHasInteriorOffset = pathBounds.minX > epsilon || pathBounds.minY > epsilon
  const isArcPath = /(?:^|[\s,])A[\s,]/i.test(pathData)
  if (
    width > 0 &&
    height > 0 &&
    pathFitsElement &&
    (pathFillsElement || pathHasInteriorOffset || isArcPath)
  ) {
    return {
      minX: 0,
      minY: 0,
      width: Math.max(0.0001, width),
      height: Math.max(0.0001, height)
    }
  }
  return pathBounds
}
