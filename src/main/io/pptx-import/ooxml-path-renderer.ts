export type PptxOoxmlPoint = {
  x: number
  y: number
}

export type PptxOoxmlPathCommand =
  | { type: 'moveTo'; point: PptxOoxmlPoint }
  | { type: 'lineTo'; point: PptxOoxmlPoint }
  | { type: 'cubicBezTo'; points: [PptxOoxmlPoint, PptxOoxmlPoint, PptxOoxmlPoint] }
  | { type: 'quadBezTo'; points: [PptxOoxmlPoint, PptxOoxmlPoint] }
  | { type: 'arcTo'; widthRadius: number; heightRadius: number; startAngle: number; sweepAngle: number }
  | { type: 'close' }

export type PptxOoxmlCustomPath = {
  width: number
  height: number
  commands: PptxOoxmlPathCommand[]
}

export type PptxOoxmlCustomGeometry = {
  paths: PptxOoxmlCustomPath[]
}

const OOXML_ANGLE = 60000

const clampNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const parseXmlAttributes = (tag: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  const attrRe = /([\w:-]+)=["']([^"']*)["']/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(tag)) !== null) attrs[match[1]] = match[2]
  return attrs
}

const parsePoint = (xml: string): PptxOoxmlPoint | null => {
  const attrs = parseXmlAttributes(xml.match(/<a:pt\b[^>]*>/)?.[0] || '')
  if (attrs.x === undefined || attrs.y === undefined) return null
  return {
    x: clampNumber(attrs.x),
    y: clampNumber(attrs.y)
  }
}

const parsePoints = (xml: string): PptxOoxmlPoint[] => {
  const points: PptxOoxmlPoint[] = []
  const pointRe = /<a:pt\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = pointRe.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[0])
    points.push({
      x: clampNumber(attrs.x),
      y: clampNumber(attrs.y)
    })
  }
  return points
}

export const parsePptxOoxmlCustomGeometry = (
  customGeometryXml: string
): PptxOoxmlCustomGeometry | undefined => {
  const paths: PptxOoxmlCustomPath[] = []
  const pathRe = /<a:path\b[^>]*>[\s\S]*?<\/a:path>/g
  let pathMatch: RegExpExecArray | null
  while ((pathMatch = pathRe.exec(customGeometryXml)) !== null) {
    const pathXml = pathMatch[0]
    const pathAttrs = parseXmlAttributes(pathXml.match(/<a:path\b[^>]*>/)?.[0] || '')
    const commands: PptxOoxmlPathCommand[] = []
    const commandRe =
      /<a:(moveTo|lnTo|cubicBezTo|quadBezTo|arcTo)\b[^>]*(?:\/>|>[\s\S]*?<\/a:\1>)|<a:close\s*\/>/g
    let commandMatch: RegExpExecArray | null
    while ((commandMatch = commandRe.exec(pathXml)) !== null) {
      const commandXml = commandMatch[0]
      const commandName = commandMatch[1] || 'close'
      if (commandName === 'moveTo') {
        const point = parsePoint(commandXml)
        if (point) commands.push({ type: 'moveTo', point })
      } else if (commandName === 'lnTo') {
        const point = parsePoint(commandXml)
        if (point) commands.push({ type: 'lineTo', point })
      } else if (commandName === 'cubicBezTo') {
        const points = parsePoints(commandXml)
        if (points.length >= 3) {
          commands.push({ type: 'cubicBezTo', points: [points[0], points[1], points[2]] })
        }
      } else if (commandName === 'quadBezTo') {
        const points = parsePoints(commandXml)
        if (points.length >= 2) {
          commands.push({ type: 'quadBezTo', points: [points[0], points[1]] })
        }
      } else if (commandName === 'arcTo') {
        const attrs = parseXmlAttributes(commandXml.match(/<a:arcTo\b[^>]*>/)?.[0] || '')
        commands.push({
          type: 'arcTo',
          widthRadius: clampNumber(attrs.wR),
          heightRadius: clampNumber(attrs.hR),
          startAngle: clampNumber(attrs.stAng) / OOXML_ANGLE,
          sweepAngle: clampNumber(attrs.swAng) / OOXML_ANGLE
        })
      } else {
        commands.push({ type: 'close' })
      }
    }
    if (commands.length > 0) {
      paths.push({
        width: Math.max(1, clampNumber(pathAttrs.w)),
        height: Math.max(1, clampNumber(pathAttrs.h)),
        commands
      })
    }
  }
  return paths.length > 0 ? { paths } : undefined
}

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(4)).toString()
}

const pointToSvg = (point: PptxOoxmlPoint, scaleX: number, scaleY: number): string =>
  `${formatNumber(point.x * scaleX)} ${formatNumber(point.y * scaleY)}`

const arcToSvg = (args: {
  command: Extract<PptxOoxmlPathCommand, { type: 'arcTo' }>
  current: PptxOoxmlPoint
  scaleX: number
  scaleY: number
}): { path: string; current: PptxOoxmlPoint } | null => {
  const radiusX = Math.abs(args.command.widthRadius)
  const radiusY = Math.abs(args.command.heightRadius)
  if (radiusX <= 0 || radiusY <= 0) return null
  const start = (args.command.startAngle * Math.PI) / 180
  const end = ((args.command.startAngle + args.command.sweepAngle) * Math.PI) / 180
  const center = {
    x: args.current.x - radiusX * Math.cos(start),
    y: args.current.y - radiusY * Math.sin(start)
  }
  const next = {
    x: center.x + radiusX * Math.cos(end),
    y: center.y + radiusY * Math.sin(end)
  }
  const largeArc = Math.abs(args.command.sweepAngle) > 180 ? 1 : 0
  const sweep = args.command.sweepAngle >= 0 ? 1 : 0
  return {
    path: `A ${formatNumber(radiusX * args.scaleX)} ${formatNumber(radiusY * args.scaleY)} 0 ${largeArc} ${sweep} ${pointToSvg(next, args.scaleX, args.scaleY)}`,
    current: next
  }
}

export const renderPptxOoxmlCustomGeometryPath = (
  geometry: PptxOoxmlCustomGeometry,
  width: number,
  height: number
): string => {
  const rendered: string[] = []
  for (const path of geometry.paths) {
    const scaleX = width / Math.max(1, path.width)
    const scaleY = height / Math.max(1, path.height)
    let current: PptxOoxmlPoint = { x: 0, y: 0 }
    for (const command of path.commands) {
      if (command.type === 'moveTo') {
        current = command.point
        rendered.push(`M ${pointToSvg(command.point, scaleX, scaleY)}`)
      } else if (command.type === 'lineTo') {
        current = command.point
        rendered.push(`L ${pointToSvg(command.point, scaleX, scaleY)}`)
      } else if (command.type === 'cubicBezTo') {
        current = command.points[2]
        rendered.push(
          `C ${command.points.map((point) => pointToSvg(point, scaleX, scaleY)).join(' ')}`
        )
      } else if (command.type === 'quadBezTo') {
        current = command.points[1]
        rendered.push(
          `Q ${command.points.map((point) => pointToSvg(point, scaleX, scaleY)).join(' ')}`
        )
      } else if (command.type === 'arcTo') {
        const arc = arcToSvg({ command, current, scaleX, scaleY })
        if (arc) {
          current = arc.current
          rendered.push(arc.path)
        }
      } else {
        rendered.push('Z')
      }
    }
  }
  return rendered.join(' ')
}
