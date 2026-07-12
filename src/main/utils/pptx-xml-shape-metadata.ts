import { unzipSync } from 'fflate'
import {
  parsePptxOoxmlCustomGeometry,
  type PptxOoxmlCustomGeometry
} from './pptx-ooxml-path-renderer'

export type PptxXmlShapeMetadata = {
  id: string
  name: string
  preset: string
  isCustomGeometry?: boolean
  customGeometry?: PptxOoxmlCustomGeometry
  fillColor?: string
  lineColor?: string
  lineWidth?: number
  headEnd?: string
  tailEnd?: string
  flipH?: boolean
  flipV?: boolean
  left?: number
  top?: number
  width?: number
  height?: number
  rotate?: number
  adjustments?: Record<string, number>
  textInsets?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  textAnchor?: string
}

export type PptxXmlSlideMetadata = {
  byName: Map<string, PptxXmlShapeMetadata>
}

export type PptxXmlDeckMetadata = {
  slides: Map<number, PptxXmlSlideMetadata>
  themeColors: Map<string, string>
}

const decodeUtf8 = (data: Uint8Array): string => new TextDecoder().decode(data)

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

const dirname = (path: string): string => path.replace(/\/[^/]*$/, '')

const normalizeZipPath = (basePath: string, target: string): string => {
  const parts = `${dirname(basePath)}/${target}`.split('/')
  const normalized: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') normalized.pop()
    else normalized.push(part)
  }
  return normalized.join('/')
}

const relsPathFor = (path: string): string => {
  const file = path.split('/').pop() || path
  return `${dirname(path)}/_rels/${file}.rels`
}

const parseRelationships = (xml: string): Map<string, { type: string; target: string }> => {
  const relationships = new Map<string, { type: string; target: string }>()
  const relRe = /<Relationship\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = relRe.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[0])
    if (!attrs.Id || !attrs.Target) continue
    relationships.set(attrs.Id, {
      type: (attrs.Type || '').split('/').pop() || '',
      target: attrs.Target
    })
  }
  return relationships
}

const applyColorTransform = (hex: string, colorXml: string): string => {
  const normalized = hex.replace(/^#/, '').padStart(6, '0').slice(0, 6)
  const tint = colorXml.match(/<a:tint\b[^>]*\bval=["'](\d+)["']/)?.[1]
  const shade = colorXml.match(/<a:shade\b[^>]*\bval=["'](\d+)["']/)?.[1]
  const lumMod = colorXml.match(/<a:lumMod\b[^>]*\bval=["'](\d+)["']/)?.[1]
  const lumOff = colorXml.match(/<a:lumOff\b[^>]*\bval=["'](\d+)["']/)?.[1]
  const alpha = colorXml.match(/<a:alpha\b[^>]*\bval=["'](\d+)["']/)?.[1]
  let channels = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16))
  if (tint) {
    const ratio = clampNumber(tint, 100000) / 100000
    channels = channels.map((value) => Math.round(value + (255 - value) * ratio))
  }
  if (shade) {
    const ratio = clampNumber(shade, 100000) / 100000
    channels = channels.map((value) => Math.round(value * ratio))
  }
  if (lumMod || lumOff) {
    const mod = clampNumber(lumMod, 100000) / 100000
    const off = clampNumber(lumOff, 0) / 100000
    channels = channels.map((value) => Math.round(value * mod + 255 * off))
  }
  const color = channels
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  if (!alpha || clampNumber(alpha, 100000) >= 100000) return `#${color}`
  const alphaHex = Math.round((clampNumber(alpha) / 100000) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
  return `#${color}${alphaHex}`
}

const parseOoxmlColor = (
  xml: string,
  themeColors: Map<string, string>
): string | undefined => {
  if (/<a:noFill\b/.test(xml)) return undefined
  const srgbMatch = xml.match(
    /<a:srgbClr\b[^>]*\bval=["']([0-9A-Fa-f]{6})["'][^>]*\/>|<a:srgbClr\b[^>]*\bval=["']([0-9A-Fa-f]{6})["'][^>]*>[\s\S]*?<\/a:srgbClr>/
  )
  if (srgbMatch) return applyColorTransform(srgbMatch[1] || srgbMatch[2], srgbMatch[0])
  const schemeMatch = xml.match(
    /<a:schemeClr\b[^>]*\bval=["']([^"']+)["'][^>]*\/>|<a:schemeClr\b[^>]*\bval=["']([^"']+)["'][^>]*>[\s\S]*?<\/a:schemeClr>/
  )
  if (schemeMatch) {
    const theme = themeColors.get(schemeMatch[1] || schemeMatch[2])
    return theme ? applyColorTransform(theme, schemeMatch[0]) : undefined
  }
  const presetMatch = xml.match(/<a:prstClr\b[^>]*\bval=["']([^"']+)["']/)
  if (presetMatch?.[1] === 'black') return '#000000'
  if (presetMatch?.[1] === 'white') return '#ffffff'
  return undefined
}

const parseGeometryAdjustments = (xml: string): Record<string, number> | undefined => {
  const adjustments: Record<string, number> = {}
  const gdRe = /<a:gd\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = gdRe.exec(xml)) !== null) {
    const attrs = parseXmlAttributes(match[0])
    const value = attrs.fmla?.match(/^val\s+(-?\d+(?:\.\d+)?)$/)?.[1]
    if (attrs.name && value !== undefined) adjustments[attrs.name] = clampNumber(value)
  }
  return Object.keys(adjustments).length ? adjustments : undefined
}

const parseTextInset = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : clampNumber(value) / 12700

const parsePptxThemeColors = (files: Record<string, Uint8Array>, themeName: string): Map<string, string> => {
  const colors = new Map<string, string>()
  if (!themeName) return colors
  const xml = decodeUtf8(files[themeName])
  const colorRe = /<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)\b[^>]*>[\s\S]*?<\/a:\1>/g
  let match: RegExpExecArray | null
  while ((match = colorRe.exec(xml)) !== null) {
    const value = match[0].match(
      /<(?:a:srgbClr|a:sysClr)\b[^>]*(?:val|lastClr)=["']([0-9A-Fa-f]{6})["']/
    )?.[1]
    if (value) colors.set(match[1], value)
  }
  colors.set('tx1', colors.get('dk1') || '000000')
  colors.set('tx2', colors.get('dk2') || '000000')
  colors.set('bg1', colors.get('lt1') || 'FFFFFF')
  colors.set('bg2', colors.get('lt2') || 'FFFFFF')
  return colors
}

const parseAllPptxThemeColors = (
  files: Record<string, Uint8Array>
): Map<string, Map<string, string>> => {
  const themes = new Map<string, Map<string, string>>()
  for (const name of Object.keys(files)) {
    if (!/^ppt\/theme\/theme\d+\.xml$/i.test(name)) continue
    themes.set(name, parsePptxThemeColors(files, name))
  }
  return themes
}

const findThemeForSlide = (
  files: Record<string, Uint8Array>,
  slidePath: string,
  fallbackThemePath: string
): string => {
  const slideRels = files[relsPathFor(slidePath)]
  if (!slideRels) return fallbackThemePath
  const layoutRel = [...parseRelationships(decodeUtf8(slideRels)).values()].find(
    (rel) => rel.type === 'slideLayout'
  )
  if (!layoutRel) return fallbackThemePath
  const layoutPath = normalizeZipPath(slidePath, layoutRel.target)
  const layoutRels = files[relsPathFor(layoutPath)]
  if (!layoutRels) return fallbackThemePath
  const masterRel = [...parseRelationships(decodeUtf8(layoutRels)).values()].find(
    (rel) => rel.type === 'slideMaster'
  )
  if (!masterRel) return fallbackThemePath
  const masterPath = normalizeZipPath(layoutPath, masterRel.target)
  const masterRels = files[relsPathFor(masterPath)]
  if (!masterRels) return fallbackThemePath
  const themeRel = [...parseRelationships(decodeUtf8(masterRels)).values()].find(
    (rel) => rel.type === 'theme'
  )
  return themeRel ? normalizeZipPath(masterPath, themeRel.target) : fallbackThemePath
}

export const parsePptxXmlDeckMetadata = (buffer: Buffer): PptxXmlDeckMetadata => {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buffer))
  } catch {
    return { slides: new Map(), themeColors: new Map() }
  }
  const themePaths = Object.keys(files)
    .filter((name) => /^ppt\/theme\/theme\d+\.xml$/i.test(name))
    .sort()
  const fallbackThemePath = themePaths[0] || ''
  const themes = parseAllPptxThemeColors(files)
  const themeColors = themes.get(fallbackThemePath) || new Map<string, string>()
  const slides = new Map<number, PptxXmlSlideMetadata>()
  for (const name of Object.keys(files)) {
    const slideMatch = name.match(/^ppt\/slides\/slide(\d+)\.xml$/i)
    if (!slideMatch) continue
    const xml = decodeUtf8(files[name])
    const slideThemePath = findThemeForSlide(files, name, fallbackThemePath)
    const slideThemeColors = themes.get(slideThemePath) || themeColors
    const byName = new Map<string, PptxXmlShapeMetadata>()
    const shapeRe = /<p:(sp|cxnSp)\b[\s\S]*?<\/p:\1>/g
    let shapeMatch: RegExpExecArray | null
    while ((shapeMatch = shapeRe.exec(xml)) !== null) {
      const shapeXml = shapeMatch[0]
      const cNvPr = shapeXml.match(/<p:cNvPr\b[^>]*>/)?.[0] || ''
      const attrs = parseXmlAttributes(cNvPr)
      const preset = shapeXml.match(/<a:prstGeom\b[^>]*\bprst=["']([^"']+)["']/)?.[1] || ''
      const customGeometryXml = shapeXml.match(/<a:custGeom\b[\s\S]*?<\/a:custGeom>/)?.[0] || ''
      const customGeometry = customGeometryXml
        ? parsePptxOoxmlCustomGeometry(customGeometryXml)
        : undefined
      const isCustomGeometry = Boolean(customGeometryXml)
      const prstGeomXml = shapeXml.match(/<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/)?.[0] || ''
      const spPr = shapeXml.match(/<p:spPr\b[\s\S]*?<\/p:spPr>/)?.[0] || ''
      const xfrmAttrs = parseXmlAttributes(spPr.match(/<a:xfrm\b[^>]*>/)?.[0] || '')
      const offAttrs = parseXmlAttributes(spPr.match(/<a:off\b[^>]*>/)?.[0] || '')
      const extAttrs = parseXmlAttributes(spPr.match(/<a:ext\b[^>]*>/)?.[0] || '')
      const fillXml = spPr.match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/)?.[0] || ''
      const lineXml = spPr.match(/<a:ln\b[\s\S]*?<\/a:ln>/)?.[0] || ''
      const styleXml = shapeXml.match(/<p:style\b[\s\S]*?<\/p:style>/)?.[0] || ''
      const lineRefXml = styleXml.match(/<a:lnRef\b[\s\S]*?<\/a:lnRef>/)?.[0] || ''
      const lineAttrs = parseXmlAttributes(lineXml.match(/<a:ln\b[^>]*>/)?.[0] || '')
      const headEndAttrs = parseXmlAttributes(lineXml.match(/<a:headEnd\b[^>]*>/)?.[0] || '')
      const tailEndAttrs = parseXmlAttributes(lineXml.match(/<a:tailEnd\b[^>]*>/)?.[0] || '')
      const bodyPrAttrs = parseXmlAttributes(shapeXml.match(/<a:bodyPr\b[^>]*>/)?.[0] || '')
      const metadata: PptxXmlShapeMetadata = {
        id: attrs.id || '',
        name: attrs.name || '',
        preset,
        isCustomGeometry,
        customGeometry,
        fillColor: fillXml ? parseOoxmlColor(fillXml, slideThemeColors) : undefined,
        lineColor: lineXml
          ? parseOoxmlColor(lineXml, slideThemeColors) ||
            (/<a:noFill\b/.test(lineXml) ? undefined : parseOoxmlColor(lineRefXml, slideThemeColors))
          : undefined,
        lineWidth: lineAttrs.w ? clampNumber(lineAttrs.w) / 12700 : undefined,
        headEnd: headEndAttrs.type,
        tailEnd: tailEndAttrs.type,
        flipH: xfrmAttrs.flipH === '1',
        flipV: xfrmAttrs.flipV === '1',
        left: offAttrs.x ? clampNumber(offAttrs.x) / 12700 : undefined,
        top: offAttrs.y ? clampNumber(offAttrs.y) / 12700 : undefined,
        width: extAttrs.cx ? clampNumber(extAttrs.cx) / 12700 : undefined,
        height: extAttrs.cy ? clampNumber(extAttrs.cy) / 12700 : undefined,
        rotate: xfrmAttrs.rot ? clampNumber(xfrmAttrs.rot) / 60000 : undefined,
        adjustments: parseGeometryAdjustments(prstGeomXml),
        textInsets: {
          top: parseTextInset(bodyPrAttrs.tIns),
          right: parseTextInset(bodyPrAttrs.rIns),
          bottom: parseTextInset(bodyPrAttrs.bIns),
          left: parseTextInset(bodyPrAttrs.lIns)
        },
        textAnchor: bodyPrAttrs.anchor
      }
      if (metadata.name) byName.set(metadata.name, metadata)
    }
    slides.set(Number(slideMatch[1]), { byName })
  }
  return { slides, themeColors }
}
