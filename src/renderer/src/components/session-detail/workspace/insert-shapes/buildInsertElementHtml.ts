import { escapeHtmlText } from '@renderer/lib/utils'
import {
  ICON_VIEWBOX,
  getIconDefinition,
  iconOuterSvgAttrs,
  isRegisteredIconId,
  serializeIconInner
} from './iconRegistry'
import { getShapeDefinition } from './shapeRegistry'

export type InsertShapeType =
  | 'rect'
  | 'rounded-rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'parallelogram'
  | 'trapezoid'
  | 'star-5'
  | 'line'
  | 'arrow-right'
  | 'chevron-right'

export interface InsertElementLayout {
  blockId: string
  left: number
  top: number
  width: number
  height: number
  zIndex: number
}

export interface BuildShapeOptions extends InsertElementLayout {
  type: InsertShapeType
  fill?: string
  stroke?: string
}

export interface BuildIconOptions extends InsertElementLayout {
  iconId: string
  color?: string
}

// blockId is generated as `select-arcsin1-` + nanoid(8); validate strictly so
// we never splice an arbitrary string into an HTML attribute.
const BLOCK_ID_RE = /^select-arcsin1-[A-Za-z0-9_-]{4,32}$/
// Accept #hex (3/4/6/8 digits) and CSS named colors; reject everything else
// (no url(), no expression(), no var() with user input).
const COLOR_RE =
  /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|transparent|currentColor|none|[a-zA-Z]+)$/

export function isValidBlockId(value: string): boolean {
  return BLOCK_ID_RE.test(value)
}

export function isValidColor(value: string): boolean {
  return COLOR_RE.test(value)
}

function assertBlockId(blockId: string): void {
  if (!isValidBlockId(blockId)) {
    throw new Error(`buildInsertElementHtml: invalid blockId "${blockId}"`)
  }
}

function resolveColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (!isValidColor(value)) {
    throw new Error(`buildInsertElementHtml: invalid color "${value}"`)
  }
  return value
}

function outerStyle(layout: InsertElementLayout, extra: string[]): string {
  return escapeHtmlText(
    [
      'position:absolute',
      `left:${layout.left}px`,
      `top:${layout.top}px`,
      `width:${layout.width}px`,
      `height:${layout.height}px`,
      `z-index:${layout.zIndex}`,
      ...extra
    ].join('; ')
  )
}

export function buildShapeElementHtml(options: BuildShapeOptions): string {
  assertBlockId(options.blockId)
  const def = getShapeDefinition(options.type)
  if (!def) {
    throw new Error(`buildInsertElementHtml: unknown shape type "${options.type}"`)
  }
  const fill = resolveColor(options.fill, def.defaultFill)
  const stroke = resolveColor(options.stroke, def.defaultStroke)
  const strokeWidth = def.strokeWidth
  // Use the default viewBox so the shape's intrinsic proportions are stable;
  // the outer svg scales to the div via width/height 100%.
  const vbW = def.defaultWidth
  const vbH = def.defaultHeight
  const inner = def.renderInner(vbW, vbH, { fill, stroke, strokeWidth })
  const style = outerStyle(options, [])
  return `<div data-block-id="${options.blockId}" data-ppt-edit-kind="shape" data-ppt-shape-type="${options.type}" style="${style}"><svg viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="none">${inner}</svg></div>`
}

export function buildIconElementHtml(options: BuildIconOptions): string {
  assertBlockId(options.blockId)
  if (!isRegisteredIconId(options.iconId)) {
    throw new Error(`buildInsertElementHtml: unknown iconId "${options.iconId}"`)
  }
  const def = getIconDefinition(options.iconId)!
  const color = resolveColor(options.color, '#3f4b35')
  // color lives on the outer div so currentColor (used by the svg stroke / badge fill) can
  // be updated later by editing the div's inline style only.
  const style = outerStyle(options, [`color:${color}`])
  const inner = serializeIconInner(def)
  const svgAttrs = iconOuterSvgAttrs(def)
  return `<div data-block-id="${options.blockId}" data-ppt-edit-kind="icon" data-ppt-icon-id="${options.iconId}" style="${style}"><svg viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}" width="100%" height="100%" ${svgAttrs}>${inner}</svg></div>`
}
