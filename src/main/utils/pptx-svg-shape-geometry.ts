import type { PptxXmlShapeMetadata } from './pptx-xml-shape-metadata'

export type SvgPathBounds = {
  minX: number
  minY: number
  width: number
  height: number
}

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

const TWO_PI = Math.PI * 2

const FULL_CIRCLE_DEGREES = 360

const clampNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(4)).toString()
}

const angleFromAdjustment = (
  adjustments: Record<string, number> | undefined,
  key: string,
  fallbackDegrees: number
): number => clampNumber(adjustments?.[key], fallbackDegrees * 60000) / 60000

const positiveSweepDegrees = (start: number, end: number): number => {
  let sweep = end - start
  while (sweep <= 0) sweep += FULL_CIRCLE_DEGREES
  while (sweep > FULL_CIRCLE_DEGREES) sweep -= FULL_CIRCLE_DEGREES
  return sweep
}

const pointOnEllipse = (
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  degrees: number
): { x: number; y: number } => {
  const radians = (degrees * Math.PI) / 180
  return {
    x: centerX + radiusX * Math.cos(radians),
    y: centerY + radiusY * Math.sin(radians)
  }
}

const pointText = (point: { x: number; y: number }): string =>
  `${formatNumber(point.x)} ${formatNumber(point.y)}`

export const renderXmlPresetShapePath = (
  preset: string | undefined,
  width: number,
  height: number,
  adjustments?: Record<string, number>
): string => {
  const normalized = preset?.toLowerCase()
  if (!normalized || width <= 0 || height <= 0) return ''
  if (normalized === 'rect') {
    return rectPath(width, height)
  }
  if (normalized === 'ellipse') {
    return ellipsePath(width, height)
  }
  if (
    normalized === 'roundrect' ||
    normalized === 'round1rect' ||
    normalized === 'round2samerect' ||
    normalized === 'round2diagrect'
  ) {
    return roundRectPath(width, height, adjustments)
  }
  if (normalized === 'trapezoid') {
    const shortSide = Math.min(width, height)
    const adjustment = clamp(clampNumber(adjustments?.adj, 25000), 0, 50000)
    const inset = clamp((shortSide * adjustment) / 100000, 0, width / 2)
    return [
      `M ${formatNumber(inset)} 0`,
      `L ${formatNumber(width - inset)} 0`,
      `L ${formatNumber(width)} ${formatNumber(height)}`,
      `L 0 ${formatNumber(height)}`,
      'Z'
    ].join(' ')
  }
  if (normalized === 'straightconnector1' || normalized === 'line') {
    if (height < 1 && width >= 1) {
      const y = height / 2
      return `M 0 ${formatNumber(y)} L ${formatNumber(width)} ${formatNumber(y)}`
    }
    if (width < 1 && height >= 1) {
      const x = width / 2
      return `M ${formatNumber(x)} 0 L ${formatNumber(x)} ${formatNumber(height)}`
    }
    return `M 0 0 L ${formatNumber(width)} ${formatNumber(height)}`
  }
  if (normalized === 'arc') {
    const radiusX = width / 2
    const radiusY = height / 2
    const startAngle = angleFromAdjustment(adjustments, 'adj1', 0)
    const endAngle = angleFromAdjustment(adjustments, 'adj2', 90)
    const sweep = positiveSweepDegrees(startAngle, endAngle)
    const start = pointOnEllipse(radiusX, radiusY, radiusX, radiusY, startAngle)
    const end = pointOnEllipse(radiusX, radiusY, radiusX, radiusY, startAngle + sweep)
    return [
      `M ${pointText(start)}`,
      `A ${formatNumber(radiusX)} ${formatNumber(radiusY)} 0 ${sweep > 180 ? 1 : 0} 1 ${pointText(end)}`
    ].join(' ')
  }
  if (normalized === 'blockarc') {
    const outerRadiusX = width / 2
    const outerRadiusY = height / 2
    const centerX = outerRadiusX
    const centerY = outerRadiusY
    const startAngle = angleFromAdjustment(adjustments, 'adj1', 0)
    const endAngle = angleFromAdjustment(adjustments, 'adj2', 90)
    const sweep = positiveSweepDegrees(startAngle, endAngle)
    const thickness = clamp(
      (Math.min(width, height) * clampNumber(adjustments?.adj3, 25000)) / 100000,
      0,
      Math.min(outerRadiusX, outerRadiusY)
    )
    const innerRadiusX = Math.max(0.0001, outerRadiusX - thickness)
    const innerRadiusY = Math.max(0.0001, outerRadiusY - thickness)
    const outerStart = pointOnEllipse(centerX, centerY, outerRadiusX, outerRadiusY, startAngle)
    const outerEnd = pointOnEllipse(centerX, centerY, outerRadiusX, outerRadiusY, startAngle + sweep)
    const innerEnd = pointOnEllipse(centerX, centerY, innerRadiusX, innerRadiusY, startAngle + sweep)
    const innerStart = pointOnEllipse(centerX, centerY, innerRadiusX, innerRadiusY, startAngle)
    const largeArc = sweep > 180 ? 1 : 0
    return [
      `M ${pointText(outerStart)}`,
      `A ${formatNumber(outerRadiusX)} ${formatNumber(outerRadiusY)} 0 ${largeArc} 1 ${pointText(outerEnd)}`,
      `L ${pointText(innerEnd)}`,
      `A ${formatNumber(innerRadiusX)} ${formatNumber(innerRadiusY)} 0 ${largeArc} 0 ${pointText(innerStart)}`,
      'Z'
    ].join(' ')
  }
  if (normalized === 'triangle') return trianglePath(width, height)
  if (normalized === 'rttriangle') return rightTrianglePath(width, height)
  if (normalized === 'parallelogram') return parallelogramPath(width, height, adjustments)
  if (normalized === 'diamond' || normalized === 'flowchartdecision') return diamondPath(width, height)
  if (normalized === 'chevron') return chevronPath(width, height, adjustments)
  if (normalized === 'homeplate') return homePlatePath(width, height, adjustments)
  if (normalized === 'rightarrow' || normalized === 'stripedrightarrow') return rightArrowPath(width, height)
  if (normalized === 'leftarrow') return leftArrowPath(width, height)
  if (normalized === 'snip2samerect') return snip2SameRectPath(width, height)
  if (normalized === 'teardrop') return teardropPath(width, height)
  return ''
}

const rectPath = (width: number, height: number): string =>
  `M 0 0 L ${formatNumber(width)} 0 L ${formatNumber(width)} ${formatNumber(height)} L 0 ${formatNumber(height)} Z`

const ellipsePath = (width: number, height: number): string => {
  const rx = width / 2
  const ry = height / 2
  return [
    `M 0 ${formatNumber(ry)}`,
    `A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(width)} ${formatNumber(ry)}`,
    `A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 0 ${formatNumber(ry)}`,
    'Z'
  ].join(' ')
}

const roundRectPath = (
  width: number,
  height: number,
  adjustments?: Record<string, number>
): string => {
  const adjustment = clamp(clampNumber(adjustments?.adj, 16667), 0, 50000) / 100000
  const radius = Math.min(width, height) * adjustment
  if (radius <= 0) return rectPath(width, height)
  const right = width - radius
  const bottom = height - radius
  return [
    `M ${formatNumber(radius)} 0`,
    `L ${formatNumber(right)} 0`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(width)} ${formatNumber(radius)}`,
    `L ${formatNumber(width)} ${formatNumber(bottom)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(right)} ${formatNumber(height)}`,
    `L ${formatNumber(radius)} ${formatNumber(height)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 0 ${formatNumber(bottom)}`,
    `L 0 ${formatNumber(radius)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 1 ${formatNumber(radius)} 0`,
    'Z'
  ].join(' ')
}

const trianglePath = (width: number, height: number): string =>
  `M ${formatNumber(width / 2)} 0 L ${formatNumber(width)} ${formatNumber(height)} L 0 ${formatNumber(height)} Z`

const rightTrianglePath = (width: number, height: number): string =>
  `M 0 0 L ${formatNumber(width)} ${formatNumber(height)} L 0 ${formatNumber(height)} Z`

const parallelogramPath = (
  width: number,
  height: number,
  adjustments?: Record<string, number>
): string => {
  const inset = (width * clamp(clampNumber(adjustments?.adj, 25000), 0, 50000)) / 100000
  return [
    `M ${formatNumber(inset)} 0`,
    `L ${formatNumber(width)} 0`,
    `L ${formatNumber(width - inset)} ${formatNumber(height)}`,
    `L 0 ${formatNumber(height)}`,
    'Z'
  ].join(' ')
}

const diamondPath = (width: number, height: number): string => [
  `M ${formatNumber(width / 2)} 0`,
  `L ${formatNumber(width)} ${formatNumber(height / 2)}`,
  `L ${formatNumber(width / 2)} ${formatNumber(height)}`,
  `L 0 ${formatNumber(height / 2)}`,
  'Z'
].join(' ')

const chevronPath = (
  width: number,
  height: number,
  adjustments?: Record<string, number>
): string => {
  const inset = (width * clamp(clampNumber(adjustments?.adj, 50000), 0, 100000)) / 100000 / 2
  return [
    'M 0 0',
    `L ${formatNumber(width - inset)} 0`,
    `L ${formatNumber(width)} ${formatNumber(height / 2)}`,
    `L ${formatNumber(width - inset)} ${formatNumber(height)}`,
    `L 0 ${formatNumber(height)}`,
    `L ${formatNumber(inset)} ${formatNumber(height / 2)}`,
    'Z'
  ].join(' ')
}

const homePlatePath = (
  width: number,
  height: number,
  adjustments?: Record<string, number>
): string => {
  const inset = (width * clamp(clampNumber(adjustments?.adj, 50000), 0, 100000)) / 100000 / 2
  return [
    'M 0 0',
    `L ${formatNumber(width - inset)} 0`,
    `L ${formatNumber(width)} ${formatNumber(height / 2)}`,
    `L ${formatNumber(width - inset)} ${formatNumber(height)}`,
    `L 0 ${formatNumber(height)}`,
    'Z'
  ].join(' ')
}

const rightArrowPath = (width: number, height: number): string => [
  `M 0 ${formatNumber(height * 0.25)}`,
  `L ${formatNumber(width * 0.65)} ${formatNumber(height * 0.25)}`,
  `L ${formatNumber(width * 0.65)} 0`,
  `L ${formatNumber(width)} ${formatNumber(height / 2)}`,
  `L ${formatNumber(width * 0.65)} ${formatNumber(height)}`,
  `L ${formatNumber(width * 0.65)} ${formatNumber(height * 0.75)}`,
  `L 0 ${formatNumber(height * 0.75)}`,
  'Z'
].join(' ')

const leftArrowPath = (width: number, height: number): string => [
  `M ${formatNumber(width)} ${formatNumber(height * 0.25)}`,
  `L ${formatNumber(width * 0.35)} ${formatNumber(height * 0.25)}`,
  `L ${formatNumber(width * 0.35)} 0`,
  `L 0 ${formatNumber(height / 2)}`,
  `L ${formatNumber(width * 0.35)} ${formatNumber(height)}`,
  `L ${formatNumber(width * 0.35)} ${formatNumber(height * 0.75)}`,
  `L ${formatNumber(width)} ${formatNumber(height * 0.75)}`,
  'Z'
].join(' ')

const snip2SameRectPath = (width: number, height: number): string => {
  const snip = Math.min(width, height) * 0.2
  return [
    `M ${formatNumber(snip)} 0`,
    `L ${formatNumber(width - snip)} 0`,
    `L ${formatNumber(width)} ${formatNumber(snip)}`,
    `L ${formatNumber(width)} ${formatNumber(height)}`,
    `L 0 ${formatNumber(height)}`,
    `L 0 ${formatNumber(snip)}`,
    'Z'
  ].join(' ')
}

const teardropPath = (width: number, height: number): string => [
  `M ${formatNumber(width)} ${formatNumber(height / 2)}`,
  `C ${formatNumber(width)} ${formatNumber(height * 0.78)} ${formatNumber(width * 0.78)} ${formatNumber(height)} ${formatNumber(width / 2)} ${formatNumber(height)}`,
  `C ${formatNumber(width * 0.22)} ${formatNumber(height)} 0 ${formatNumber(height * 0.78)} 0 ${formatNumber(height / 2)}`,
  `C 0 ${formatNumber(height * 0.18)} ${formatNumber(width * 0.36)} 0 ${formatNumber(width * 0.78)} 0`,
  `C ${formatNumber(width * 0.92)} 0 ${formatNumber(width)} ${formatNumber(height * 0.08)} ${formatNumber(width)} ${formatNumber(height / 2)}`,
  'Z'
].join(' ')

const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
  const dot = ux * vx + uy * vy
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (length === 0) return 0
  const clamped = Math.min(1, Math.max(-1, dot / length))
  const sign = ux * vy - uy * vx < 0 ? -1 : 1
  return sign * Math.acos(clamped)
}

const normalizeAngle = (angle: number): number => {
  const normalized = angle % TWO_PI
  return normalized < 0 ? normalized + TWO_PI : normalized
}

const isAngleInArcSweep = (angle: number, startAngle: number, sweepAngle: number): boolean => {
  const epsilon = 1e-10
  if (sweepAngle >= 0) {
    const distance = normalizeAngle(angle - startAngle)
    return distance <= sweepAngle + epsilon
  }
  const distance = normalizeAngle(startAngle - angle)
  return distance <= Math.abs(sweepAngle) + epsilon
}

const includeSvgArcBounds = (args: {
  fromX: number
  fromY: number
  radiusX: number
  radiusY: number
  rotation: number
  largeArcFlag: number
  sweepFlag: number
  toX: number
  toY: number
  include: (nextX: number, nextY: number) => void
}): void => {
  args.include(args.fromX, args.fromY)
  args.include(args.toX, args.toY)

  let radiusX = Math.abs(args.radiusX)
  let radiusY = Math.abs(args.radiusY)
  if (radiusX === 0 || radiusY === 0) return
  if (args.fromX === args.toX && args.fromY === args.toY) {
    args.include(args.fromX - radiusX, args.fromY - radiusY)
    args.include(args.fromX + radiusX, args.fromY + radiusY)
    return
  }

  const phi = (args.rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (args.fromX - args.toX) / 2
  const dy = (args.fromY - args.toY) / 2
  const x1Prime = cosPhi * dx + sinPhi * dy
  const y1Prime = -sinPhi * dx + cosPhi * dy
  const radiiScale = (x1Prime ** 2) / (radiusX ** 2) + (y1Prime ** 2) / (radiusY ** 2)
  if (radiiScale > 1) {
    const scale = Math.sqrt(radiiScale)
    radiusX *= scale
    radiusY *= scale
  }

  const rxSq = radiusX ** 2
  const rySq = radiusY ** 2
  const x1PrimeSq = x1Prime ** 2
  const y1PrimeSq = y1Prime ** 2
  const denominator = rxSq * y1PrimeSq + rySq * x1PrimeSq
  if (denominator === 0) return

  const numerator = Math.max(0, rxSq * rySq - rxSq * y1PrimeSq - rySq * x1PrimeSq)
  const sign = Boolean(args.largeArcFlag) === Boolean(args.sweepFlag) ? -1 : 1
  const coefficient = sign * Math.sqrt(numerator / denominator)
  const centerXPrime = coefficient * ((radiusX * y1Prime) / radiusY)
  const centerYPrime = coefficient * (-(radiusY * x1Prime) / radiusX)
  const centerX =
    cosPhi * centerXPrime - sinPhi * centerYPrime + (args.fromX + args.toX) / 2
  const centerY =
    sinPhi * centerXPrime + cosPhi * centerYPrime + (args.fromY + args.toY) / 2
  const startVectorX = (x1Prime - centerXPrime) / radiusX
  const startVectorY = (y1Prime - centerYPrime) / radiusY
  const endVectorX = (-x1Prime - centerXPrime) / radiusX
  const endVectorY = (-y1Prime - centerYPrime) / radiusY
  const startAngle = vectorAngle(1, 0, startVectorX, startVectorY)
  let sweepAngle = vectorAngle(startVectorX, startVectorY, endVectorX, endVectorY)
  if (!args.sweepFlag && sweepAngle > 0) sweepAngle -= TWO_PI
  if (args.sweepFlag && sweepAngle < 0) sweepAngle += TWO_PI

  const candidateAngles = [
    Math.atan2(-radiusY * sinPhi, radiusX * cosPhi),
    Math.atan2(-radiusY * sinPhi, radiusX * cosPhi) + Math.PI,
    Math.atan2(radiusY * cosPhi, radiusX * sinPhi),
    Math.atan2(radiusY * cosPhi, radiusX * sinPhi) + Math.PI
  ]
  for (const angle of candidateAngles) {
    if (!isAngleInArcSweep(angle, startAngle, sweepAngle)) continue
    args.include(
      centerX + radiusX * Math.cos(angle) * cosPhi - radiusY * Math.sin(angle) * sinPhi,
      centerY + radiusX * Math.cos(angle) * sinPhi + radiusY * Math.sin(angle) * cosPhi
    )
  }
}

export const getSvgPathBounds = (pathData: string): SvgPathBounds | null => {
  const tokens = pathData.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens?.length) return null
  const parameterCounts: Record<string, number> = {
    M: 2,
    L: 2,
    H: 1,
    V: 1,
    C: 6,
    S: 4,
    Q: 4,
    T: 2,
    A: 7,
    Z: 0
  }
  let command = ''
  let index = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const include = (nextX: number, nextY: number): void => {
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return
    minX = Math.min(minX, nextX)
    minY = Math.min(minY, nextY)
    maxX = Math.max(maxX, nextX)
    maxY = Math.max(maxY, nextY)
  }
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) {
      command = tokens[index]
      index += 1
      if (command.toUpperCase() === 'Z') {
        x = startX
        y = startY
        include(x, y)
        continue
      }
    }
    if (!command) return null
    const upper = command.toUpperCase()
    const parameterCount = parameterCounts[upper]
    if (!parameterCount || index + parameterCount > tokens.length) break
    const values = tokens.slice(index, index + parameterCount).map(Number)
    if (values.some((value) => !Number.isFinite(value))) return null
    index += parameterCount
    const relative = command === command.toLowerCase()
    const point = (pointX: number, pointY: number): [number, number] => [
      relative ? x + pointX : pointX,
      relative ? y + pointY : pointY
    ]
    if (upper === 'H') {
      x = relative ? x + values[0] : values[0]
      include(x, y)
    } else if (upper === 'V') {
      y = relative ? y + values[0] : values[0]
      include(x, y)
    } else if (upper === 'A') {
      const [nextX, nextY] = point(values[5], values[6])
      includeSvgArcBounds({
        fromX: x,
        fromY: y,
        radiusX: values[0],
        radiusY: values[1],
        rotation: values[2],
        largeArcFlag: values[3],
        sweepFlag: values[4],
        toX: nextX,
        toY: nextY,
        include
      })
      x = nextX
      y = nextY
    } else {
      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 2) {
        const [nextX, nextY] = point(values[valueIndex], values[valueIndex + 1])
        include(nextX, nextY)
      }
      const [nextX, nextY] = point(values[values.length - 2], values[values.length - 1])
      x = nextX
      y = nextY
      if (upper === 'M') {
        startX = x
        startY = y
        command = relative ? 'l' : 'L'
      }
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  return {
    minX,
    minY,
    width: Math.max(0.0001, maxX - minX),
    height: Math.max(0.0001, maxY - minY)
  }
}

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
