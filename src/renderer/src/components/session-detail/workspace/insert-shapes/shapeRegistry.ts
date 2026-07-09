import type { InsertShapeType } from './buildInsertElementHtml'

export interface ShapeDefinition {
  type: InsertShapeType
  defaultWidth: number
  defaultHeight: number
  defaultFill: string
  defaultStroke: string
  strokeWidth: number
  /**
   * Produce the inner SVG markup for a viewBox of the given width/height.
   * Filled shapes use preserveAspectRatio="none" so users can stretch them
   * freely; the stroke-only line keeps a non-scaling stroke.
   */
  renderInner: (viewBoxW: number, viewBoxH: number, ctx: ShapeRenderContext) => string
}

export interface ShapeRenderContext {
  fill: string
  stroke: string
  strokeWidth: number
}

const DEFAULT_FILL = '#d4e4c1'
const DEFAULT_STROKE = '#7a875f'

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Points string for a regular polygon inscribed in radius r around (cx, cy). */
function regularPolygon(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  startAngleDeg: number
): string {
  const pts: string[] = []
  for (let i = 0; i < sides; i++) {
    const a = ((startAngleDeg + (360 / sides) * i) * Math.PI) / 180
    pts.push(`${round(cx + r * Math.cos(a))},${round(cy + r * Math.sin(a))}`)
  }
  return pts.join(' ')
}

/** Points string for a star with `points` spikes, alternating outer/inner radius. */
function starPolygon(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  startAngleDeg: number
): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const a = ((startAngleDeg + (180 / points) * i) * Math.PI) / 180
    pts.push(`${round(cx + r * Math.cos(a))},${round(cy + r * Math.sin(a))}`)
  }
  return pts.join(' ')
}

function filledPolygon(
  points: string,
  ctx: ShapeRenderContext,
  extraAttrs = ''
): string {
  return `<polygon points="${points}" fill="${ctx.fill}" stroke="${ctx.stroke}" stroke-width="${ctx.strokeWidth}" stroke-linejoin="round" ${extraAttrs} />`
}

export const SHAPE_REGISTRY: Record<InsertShapeType, ShapeDefinition> = {
  rect: {
    type: 'rect',
    defaultWidth: 220,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const inset = ctx.strokeWidth / 2 + 0.5
      return `<rect x="${inset}" y="${inset}" width="${round(w - inset * 2)}" height="${round(h - inset * 2)}" fill="${ctx.fill}" stroke="${ctx.stroke}" stroke-width="${ctx.strokeWidth}" />`
    }
  },
  'rounded-rect': {
    type: 'rounded-rect',
    defaultWidth: 240,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const inset = ctx.strokeWidth / 2 + 0.5
      const rx = Math.min(w, h) * 0.15
      return `<rect x="${inset}" y="${inset}" width="${round(w - inset * 2)}" height="${round(h - inset * 2)}" rx="${rx}" ry="${rx}" fill="${ctx.fill}" stroke="${ctx.stroke}" stroke-width="${ctx.strokeWidth}" />`
    }
  },
  ellipse: {
    type: 'ellipse',
    defaultWidth: 140,
    defaultHeight: 140,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const cx = w / 2
      const cy = h / 2
      const rx = w / 2 - ctx.strokeWidth / 2 - 0.5
      const ry = h / 2 - ctx.strokeWidth / 2 - 0.5
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${ctx.fill}" stroke="${ctx.stroke}" stroke-width="${ctx.strokeWidth}" />`
    }
  },
  triangle: {
    type: 'triangle',
    defaultWidth: 140,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const pts = `${w / 2},${pad} ${w - pad},${h - pad} ${pad},${h - pad}`
      return filledPolygon(pts, ctx)
    }
  },
  diamond: {
    type: 'diamond',
    defaultWidth: 160,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const cx = w / 2
      const cy = h / 2
      const pts = `${cx},${pad} ${w - pad},${cy} ${cx},${h - pad} ${pad},${cy}`
      return filledPolygon(pts, ctx)
    }
  },
  pentagon: {
    type: 'pentagon',
    defaultWidth: 140,
    defaultHeight: 140,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const r = Math.min(w, h) / 2 - pad
      const pts = regularPolygon(w / 2, h / 2, r, 5, -90)
      return filledPolygon(pts, ctx)
    }
  },
  hexagon: {
    type: 'hexagon',
    defaultWidth: 160,
    defaultHeight: 140,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const r = Math.min(w, h) / 2 - pad
      // pointy-top hexagon (vertex at top)
      const pts = regularPolygon(w / 2, h / 2, r, 6, -90)
      return filledPolygon(pts, ctx)
    }
  },
  parallelogram: {
    type: 'parallelogram',
    defaultWidth: 220,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const skew = h * 0.4
      const pts = `${pad + skew},${pad} ${w - pad},${pad} ${w - pad - skew},${h - pad} ${pad},${h - pad}`
      return filledPolygon(pts, ctx)
    }
  },
  trapezoid: {
    type: 'trapezoid',
    defaultWidth: 200,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const topInset = w * 0.2
      const pts = `${pad + topInset},${pad} ${w - pad - topInset},${pad} ${w - pad},${h - pad} ${pad},${h - pad}`
      return filledPolygon(pts, ctx)
    }
  },
  'star-5': {
    type: 'star-5',
    defaultWidth: 140,
    defaultHeight: 140,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const outerR = Math.min(w, h) / 2 - pad
      const innerR = outerR * 0.4
      const pts = starPolygon(w / 2, h / 2, outerR, innerR, 5, -90)
      return filledPolygon(pts, ctx)
    }
  },
  line: {
    type: 'line',
    defaultWidth: 240,
    defaultHeight: 8,
    defaultFill: 'none',
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 4,
    renderInner: (w, h, { stroke, strokeWidth }) => {
      const y = h / 2
      return `<line x1="0" y1="${y}" x2="${w}" y2="${y}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke" />`
    }
  },
  'arrow-right': {
    type: 'arrow-right',
    defaultWidth: 240,
    defaultHeight: 80,
    defaultFill: DEFAULT_STROKE,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      // Solid block arrow: rectangular shaft + triangular head, filled.
      const pad = ctx.strokeWidth / 2 + 0.5
      const shaftH = h * 0.5
      const shaftTop = (h - shaftH) / 2
      const shaftBottom = shaftTop + shaftH
      const headW = h * 0.6
      const bodyEnd = w - headW
      const pts = [
        `${pad},${round(shaftTop)}`,
        `${round(bodyEnd)},${round(shaftTop)}`,
        `${round(bodyEnd)},${pad}`,
        `${w - pad},${h / 2}`,
        `${round(bodyEnd)},${h - pad}`,
        `${round(bodyEnd)},${round(shaftBottom)}`,
        `${pad},${round(shaftBottom)}`
      ].join(' ')
      return filledPolygon(pts, ctx)
    }
  },
  'chevron-right': {
    type: 'chevron-right',
    defaultWidth: 200,
    defaultHeight: 120,
    defaultFill: DEFAULT_FILL,
    defaultStroke: DEFAULT_STROKE,
    strokeWidth: 2,
    renderInner: (w, h, ctx) => {
      const pad = ctx.strokeWidth / 2 + 0.5
      const notch = w * 0.35
      const pts = [
        `${pad},${pad}`,
        `${round(w - notch)},${pad}`,
        `${w - pad},${h / 2}`,
        `${round(w - notch)},${h - pad}`,
        `${pad},${h - pad}`,
        `${round(pad + notch)},${h / 2}`
      ].join(' ')
      return filledPolygon(pts, ctx)
    }
  }
}

export const SHAPE_LIST: ShapeDefinition[] = Object.values(SHAPE_REGISTRY)

export function getShapeDefinition(type: string): ShapeDefinition | undefined {
  return SHAPE_REGISTRY[type as InsertShapeType]
}

export function isRegisteredShapeType(type: string): boolean {
  return Boolean(SHAPE_REGISTRY[type as InsertShapeType])
}
