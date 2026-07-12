import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import * as cheerio from 'cheerio'
import {
  parse,
  type Element,
  type ElementLayer,
  type Fill,
  type OoxmlShape,
  type ParseIssue,
  type Shadow,
  type Slide
} from '@arcsin1/pptx2json'
import { buildPageScaffoldHtml, buildProjectIndexHtml, type DeckPageFile } from '../../ipc/engine/template'
import { escapeHtml } from '../../ipc/utils'
import { validatePersistedPageHtml } from '../../tools/html-utils'
import { PptxTextValidator } from '../pptx-text-validator'
import {
  normalizePptxShapeName,
  readPptxAnimationPlans,
  type ImportedElementAnimation,
  type SlideAnimationPlan
} from '../pptx-animation-import'
import { type PptxXmlShapeMetadata } from '../pptx-xml-shape-metadata'
import {
  getSvgPathBounds,
  getSvgShapeViewBox,
  renderXmlPresetShapePath,
  type SvgPathBounds
} from '../pptx-svg-shape-geometry'
import { renderPptxOoxmlCustomGeometryPath } from '../pptx-ooxml-path-renderer'
import { DEFAULT_IMPORTED_TEXT_FONT, PAGE_HEIGHT, PAGE_WIDTH, PPTX_IMPORT_SLIDE_SIZE } from './constants'
import {
  buildChartBlock,
  buildChartFrameStyle,
  buildChartHtmlFromConfig,
  chartCanvasId,
  unsupportedChartWarning
} from './chart-renderer'
import { buildAnimationAttrs, buildBlockStyle, clampNumber } from './render-shared'
import type {
  FlattenedElement,
  ImageRegistry,
  ImportedPptxDeck,
  ImportedPptxPage,
  ImportedTableBorder,
  ImportedTableCell,
  ImportProgress,
  ImportWarning,
  PptxChartRewriteHandler,
  SlideAnimationContext,
  SvgShapeFill,
  TableBorderSide,
  TextImportAdjustment,
  ZIndexCounter
} from './types'

export type {
  ImportedPptxDeck,
  ImportedPptxPage,
  PptxChartRewriteHandler,
  PptxChartRewriteRequest,
  PptxChartRewriteResult,
  PptxImportProgressPayload
} from './types'

const stripHtml = (html: string): string => {
  if (!html) return ''
  const $ = cheerio.load(html, { scriptingEnabled: false })
  return $.root().text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

type ElementFrame = {
  left: number
  top: number
  width: number
  height: number
}

const elementFrame = (element: Element): ElementFrame => {
  const record = element as unknown as Record<string, unknown>
  return {
    left: clampNumber(record.left),
    top: clampNumber(record.top),
    width: clampNumber(record.width),
    height: clampNumber(record.height)
  }
}

const elementBounds = (elements: Element[]): ElementFrame | null => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const element of elements) {
    const frame = elementFrame(element)
    minX = Math.min(minX, frame.left)
    minY = Math.min(minY, frame.top)
    maxX = Math.max(maxX, frame.left + frame.width)
    maxY = Math.max(maxY, frame.top + frame.height)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return {
    left: minX,
    top: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  }
}

const normalizeGroupChildren = (group: Element, children: Element[]): Element[] => {
  if (!children.length) return children
  const groupFrame = elementFrame(group)
  const bounds = elementBounds(children)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || groupFrame.width <= 0 || groupFrame.height <= 0) {
    return children
  }
  const scaleX = groupFrame.width / bounds.width
  const scaleY = groupFrame.height / bounds.height
  const needsNormalization =
    Math.abs(scaleX - 1) > 0.001 ||
    Math.abs(scaleY - 1) > 0.001 ||
    Math.abs(bounds.left) > 0.001 ||
    Math.abs(bounds.top) > 0.001
  if (!needsNormalization) return children

  return children.map((child) => {
    const frame = elementFrame(child)
    return {
      ...child,
      left: (frame.left - bounds.left) * scaleX,
      top: (frame.top - bounds.top) * scaleY,
      width: frame.width * scaleX,
      height: frame.height * scaleY
    } as Element
  })
}

const flattenElements = (
  elements: Element[],
  offsetX = 0,
  offsetY = 0
): FlattenedElement[] => {
  const flattened: FlattenedElement[] = []
  for (const element of elements) {
    const record = element as unknown as Record<string, unknown>
    const left = offsetX + clampNumber(record.left)
    const top = offsetY + clampNumber(record.top)
    if (element.type === 'group') {
      const children = normalizeGroupChildren(
        element,
        Array.isArray(element.elements) ? element.elements : []
      )
      flattened.push(
        ...flattenElements(
          children,
          left,
          top
        )
      )
      continue
    }
    flattened.push({
      element,
      left,
      top,
      width: clampNumber(record.width),
      height: clampNumber(record.height),
      text: 'content' in element ? stripHtml(String(element.content || '')) : ''
    })
  }
  return flattened
}

const isLowValueTitleText = (text: string): boolean => {
  const normalized = text.toLowerCase()
  if (!normalized) return true
  if (/https?:\/\//i.test(text) || /www\./i.test(text)) return true
  if (normalized.includes('ppt模板') || normalized.includes('1ppt.com')) return true
  if (text.includes('单击此处输入') || text.includes('请输入')) return true
  if (normalized.includes('thank you for your attention')) return true
  return false
}

const hasCjkText = (text: string): boolean => /[\u3400-\u9fff]/.test(text)

const hasDeckTitleKeyword = (text: string): boolean =>
  /(总结|汇报|报告|计划|规划|方案|复盘|目录|概述|情况|不足|introduction|overview|summary|agenda|conclusion|plan|report|review)/i.test(text)

const warningFromParseIssue = (issue: ParseIssue): ImportWarning => {
  const location = [
    issue.scope,
    issue.file ? `文件 ${issue.file}` : '',
    issue.elementOrder !== undefined ? `元素 ${issue.elementOrder}` : ''
  ].filter(Boolean).join(' / ')
  return {
    pageNumber: issue.slideIndex !== undefined ? issue.slideIndex + 1 : undefined,
    message: `${location ? `${location}: ` : ''}${issue.message}`
  }
}

const xmlShapeFromParserOoxml = (
  element: Record<string, unknown>
): PptxXmlShapeMetadata | undefined => {
  const ooxml = element.ooxml as OoxmlShape | undefined
  if (!ooxml || typeof ooxml !== 'object') return undefined
  const preset = typeof ooxml.preset === 'string' ? ooxml.preset : ''
  const metadata: PptxXmlShapeMetadata = {
    id: '',
    name: typeof element.name === 'string' ? element.name : '',
    preset,
    adjustments: ooxml.adjustments,
    textInsets: ooxml.textInsets,
    textAnchor: ooxml.textAnchor,
    headEnd: ooxml.lineHeadEnd,
    tailEnd: ooxml.lineTailEnd
  }
  return preset ||
    metadata.adjustments ||
    metadata.textInsets ||
    metadata.textAnchor ||
    metadata.headEnd ||
    metadata.tailEnd
    ? metadata
    : undefined
}

const ALLOWED_TEXT_TAGS = new Set([
  'p',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'sub',
  'sup'
])

const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'canvas',
  'video',
  'audio',
  'img'
])

const ALLOWED_TEXT_STYLE_PROPS = new Set([
  'color',
  'background',
  'background-image',
  'background-color',
  'background-clip',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'text-align',
  'text-shadow',
  'line-height',
  'vertical-align',
  'letter-spacing',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'text-indent'
])

const normalizeImportedSymbols = (value: string): string =>
  value
    // PowerPoint stores Wingdings 3 glyph 0xC4 in Unicode's private-use area.
    .replace(/\uf0c4/gi, '➜')

const scaleCssLengthToken = (value: string, scale: number): string | null => {
  const trimmed = value.trim()
  if (/^0(?:\.0+)?(?:px|pt)?$/i.test(trimmed)) return '0'
  const ptMatch = trimmed.match(/^(-?[0-9.]+)pt$/i)
  if (ptMatch) return `${(clampNumber(ptMatch[1]) * scale).toFixed(1)}px`
  const pxMatch = trimmed.match(/^(-?[0-9.]+)px$/i)
  if (pxMatch) return `${clampNumber(pxMatch[1]).toFixed(1)}px`
  return null
}

const sanitizeCssBoxLength = (value: string, scale: number): string | null => {
  const tokens = value.trim().split(/\s+/)
  if (tokens.length < 1 || tokens.length > 4) return null
  const scaled = tokens.map((token) => scaleCssLengthToken(token, scale))
  return scaled.every((token): token is string => Boolean(token)) ? scaled.join(' ') : null
}

const sanitizeCssValue = (property: string, rawValue: string, scale: number): string | null => {
  const value = rawValue.trim()
  if (!value) return null
  if (/url\s*\(|expression\s*\(|javascript:|data:/i.test(value)) return null
  const normalizedProperty = property.trim().toLowerCase()
  if (normalizedProperty === 'background' || normalizedProperty === 'background-image') {
    if (!/^(?:linear-gradient|radial-gradient)\s*\(/i.test(value)) return null
  }
  if (normalizedProperty === 'background-clip' || normalizedProperty === '-webkit-background-clip') {
    return /^(?:text|border-box|padding-box|content-box)$/i.test(value) ? value : null
  }
  if (property === 'font-size' || property === 'line-height') {
    const ptMatch = value.match(/^([0-9.]+)pt$/i)
    if (ptMatch) {
      const px = Math.max(8, clampNumber(ptMatch[1]) * scale)
      return `${px.toFixed(1)}px`
    }
  }
  if (
    normalizedProperty === 'text-indent' ||
    normalizedProperty === 'margin' ||
    normalizedProperty.startsWith('margin-')
  ) {
    return sanitizeCssBoxLength(value, scale)
  }
  if (/^[#a-z0-9\s.,()%'"-]+$/i.test(value)) return value
  return null
}

const ensureVisibleTextStyle = (style: string): string => {
  if (!style) return ''
  const hasTransparentText =
    /(?:^|;)\s*color\s*:\s*transparent\s*(?:;|$)/i.test(style) ||
    /(?:^|;)\s*-webkit-text-fill-color\s*:\s*transparent\s*(?:;|$)/i.test(style)
  if (!hasTransparentText) return style

  const hasGradientBackground =
    /(?:^|;)\s*background(?:-image)?\s*:\s*(?:linear-gradient|radial-gradient)\s*\(/i.test(style)
  const hasTextClip =
    /(?:^|;)\s*(?:-webkit-)?background-clip\s*:\s*text\s*(?:;|$)/i.test(style)

  if (hasGradientBackground && hasTextClip) {
    return style.includes('-webkit-background-clip')
      ? style
      : `${style};-webkit-background-clip:text`
  }

  return style
    .replace(/((?:^|;)\s*color\s*:\s*)transparent(\s*(?:;|$))/gi, '$1#111827$2')
    .replace(
      /((?:^|;)\s*-webkit-text-fill-color\s*:\s*)transparent(\s*(?:;|$))/gi,
      '$1#111827$2'
    )
}

const sanitizeImportedCssColor = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') return null
  return sanitizeCssValue('color', rawValue, 1)
}

const isTransparentCssColor = (color: string | null | undefined): boolean => {
  if (!color) return true
  const normalized = color.trim().toLowerCase()
  if (!normalized || normalized === 'none' || normalized === 'transparent') return true
  const hex = normalized.match(/^#([0-9a-f]{8})$/i)
  return Boolean(hex && hex[1].slice(6) === '00')
}

const hasVisibleFill = (fill: Fill | undefined): boolean =>
  Boolean(
    fill &&
      (
        fill.type === 'image' ||
        fill.type === 'gradient' ||
        fill.type === 'pattern' ||
        (fill.type === 'color' && !isTransparentCssColor(sanitizeImportedCssColor(fill.value)))
      )
  )

const hasVisibleSurface = (element: Record<string, unknown>): boolean => {
  const borderColor = sanitizeImportedCssColor(element.borderColor)
  return (
    hasVisibleFill(element.fill as Fill | undefined) ||
    (clampNumber(element.borderWidth) > 0 && !isTransparentCssColor(borderColor))
  )
}

const boxShadowCss = (
  element: Record<string, unknown>,
  scaleX: number,
  scaleY: number
): string[] => {
  const shadow = element.shadow as Shadow | undefined
  if (!shadow || !hasVisibleSurface(element)) return []
  const offsetX = clampNumber(shadow.h) * scaleX
  const offsetY = clampNumber(shadow.v) * scaleY
  const blur = Math.max(0, clampNumber(shadow.blur) * ((scaleX + scaleY) / 2))
  if (Math.abs(offsetX) < 0.01 && Math.abs(offsetY) < 0.01 && blur < 0.01) return []
  const color = sanitizeImportedCssColor(shadow.color) || '#00000066'
  return [`box-shadow:${offsetX.toFixed(1)}px ${offsetY.toFixed(1)}px ${blur.toFixed(1)}px ${color}`]
}

const normalizeGradientPosition = (
  rawPosition: unknown,
  fallbackIndex = 0,
  fallbackCount = 1
): string => {
  const fallback = `${Math.round((fallbackIndex / Math.max(1, fallbackCount - 1)) * 100)}%`
  if (typeof rawPosition !== 'string' && typeof rawPosition !== 'number') return fallback
  const value = String(rawPosition).trim()
  if (!value) return fallback
  const percentMatch = value.match(/^([0-9.]+)%$/)
  if (percentMatch) {
    const percent = clampNumber(percentMatch[1])
    return `${Math.max(0, Math.min(100, percent)).toFixed(percent % 1 ? 2 : 0)}%`
  }
  if (!/^[0-9.]+$/.test(value)) return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric > 100) {
    return `${Math.max(0, Math.min(100, numeric / 1000)).toFixed(numeric % 1000 ? 2 : 0)}%`
  }
  return `${Math.max(0, Math.min(100, numeric)).toFixed(numeric % 1 ? 2 : 0)}%`
}

const sanitizeGradientStop = (
  rawColor: unknown,
  rawPosition: unknown,
  fallbackIndex = 0,
  fallbackCount = 1
): string | null => {
  const color = sanitizeImportedCssColor(rawColor)
  if (!color) return null
  return `${color} ${normalizeGradientPosition(rawPosition, fallbackIndex, fallbackCount)}`
}

const sanitizeStyleAttribute = (style: string, scale: number): string => {
  return ensureVisibleTextStyle(
    style
      .split(';')
      .map((part) => {
        const [propertyRaw, ...valueParts] = part.split(':')
        const property = propertyRaw?.trim().toLowerCase()
        const valueRaw = valueParts.join(':')
        if (!property || !ALLOWED_TEXT_STYLE_PROPS.has(property)) return ''
        const value = sanitizeCssValue(property, valueRaw, scale)
        return value ? `${property}:${value}` : ''
      })
      .filter(Boolean)
      .join(';')
  )
}

const sanitizeContentHtml = (html: string, scale: number): string => {
  if (!html) return ''
  const $ = cheerio.load(html, { scriptingEnabled: false }, false)
  $('*').each((_, node) => {
    const rawNode = node as unknown as { tagName?: string; attribs?: Record<string, string> }
    const element = $(node)
    const tagName = String(rawNode.tagName || '').toLowerCase()
    if (DANGEROUS_TAGS.has(tagName)) {
      element.remove()
      return
    }
    if (!ALLOWED_TEXT_TAGS.has(tagName)) {
      element.replaceWith(element.contents())
      return
    }
    for (const attribute of Object.keys(rawNode.attribs || {})) {
      const value = element.attr(attribute) || ''
      const name = attribute.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttr(attribute)
        continue
      }
      if (name !== 'style') {
        element.removeAttr(attribute)
        continue
      }
      const sanitizedStyle = sanitizeStyleAttribute(value, scale)
      if (sanitizedStyle) {
        element.attr('style', sanitizedStyle)
      } else {
        element.removeAttr('style')
      }
    }
  })
  $.root()
    .contents()
    .add($.root().find('*').contents())
    .each((_, node) => {
      if (node.type === 'text' && 'data' in node && typeof node.data === 'string') {
        node.data = normalizeImportedSymbols(node.data)
      }
    })
  return $.root().html() || ''
}

const sanitizeTableCellContentHtml = (html: string, scale: number): string => {
  const sanitized = sanitizeContentHtml(html, Math.min(scale, 1.25))
  return sanitized.replace(/\u00a0/g, '&nbsp;')
}

const parseCssPx = (style: string, property: string): number | null => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = style.match(new RegExp(`${escaped}\\s*:\\s*([0-9.]+)px`, 'i'))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

const parseCssValue = (style: string, property: string): string | null => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = style.match(new RegExp(`${escaped}\\s*:\\s*([^;]+)`, 'i'))
  return match?.[1]?.trim() || null
}

const extractTextTypography = (
  content: string,
  element: Record<string, unknown>,
  textScale: number
): {
  fontSize: number
  lineHeight: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  letterSpacing: number
} => {
  const $ = cheerio.load(`<body>${content}</body>`, { scriptingEnabled: false })
  let style = ''
  $('*').each((_, node) => {
    const candidate = $(node).attr('style') || ''
    if (candidate && (!style || candidate.includes('font-size'))) style = candidate
  })
  const fontSize =
    parseCssPx(style, 'font-size') ||
    Math.max(10, clampNumber(element.fontSize || element.font_size || 18) * textScale)
  const lineHeight = parseCssPx(style, 'line-height') || fontSize * 1.18
  return {
    fontSize,
    lineHeight,
    fontFamily: DEFAULT_IMPORTED_TEXT_FONT,
    fontWeight:
      parseCssValue(style, 'font-weight') ||
      (element.fontBold || element.bold ? '700' : '400'),
    fontStyle: parseCssValue(style, 'font-style') || (element.fontItalic ? 'italic' : 'normal'),
    letterSpacing: parseCssPx(style, 'letter-spacing') || 0
  }
}

const scaleContentTypography = (content: string, ratio: number): string => {
  if (ratio >= 0.995) return content
  const $ = cheerio.load(`<body>${content}</body>`, { scriptingEnabled: false })
  $('*').each((_, node) => {
    const element = $(node)
    const style = element.attr('style') || ''
    if (!style) return
    const scaled = style
      .split(';')
      .map((part) => {
        const [propertyRaw, ...valueParts] = part.split(':')
        const property = propertyRaw?.trim()
        const value = valueParts.join(':').trim()
        if (!property || !value) return ''
        if (/^(font-size|line-height|letter-spacing)$/i.test(property)) {
          const pxMatch = value.match(/^([0-9.]+)px$/i)
          if (pxMatch) {
            return `${property}:${Math.max(0, Number(pxMatch[1]) * ratio).toFixed(1)}px`
          }
        }
        return `${property}:${value}`
      })
      .filter(Boolean)
      .join(';')
    if (scaled) element.attr('style', scaled)
  })
  return $('body').html() || content
}

const getRegistryKey = (key: string, dataUrl: string): string => {
  const stableKey = key.trim()
  if (stableKey && stableKey.length < 512 && !stableKey.startsWith('data:')) return `ref:${stableKey}`
  return `sha256:${crypto.createHash('sha256').update(stableKey || dataUrl).digest('hex')}`
}

const getDataUrlInfo = (dataUrl: string): { mimeType: string; extension: string; data: string } => {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return { mimeType: 'application/octet-stream', extension: '.bin', data: dataUrl }
  const mimeType = match[1]
  const extension =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/jpeg'
        ? '.jpg'
        : mimeType === 'image/webp'
          ? '.webp'
          : mimeType === 'image/gif'
            ? '.gif'
            : mimeType === 'image/svg+xml'
              ? '.svg'
              : '.bin'
  return { mimeType, extension, data: match[2] }
}

const writeImageDataUrl = async (
  imagesDir: string,
  registry: ImageRegistry,
  key: string,
  dataUrl: string
): Promise<string | null> => {
  if (!dataUrl) return null
  const registryKey = getRegistryKey(key, dataUrl)
  const existing = registry.byKey.get(registryKey)
  if (existing) return existing
  const info = getDataUrlInfo(dataUrl)
  if (!info.data || info.extension === '.bin') return null
  registry.index += 1
  const fileName = `imported-${String(registry.index).padStart(4, '0')}${info.extension}`
  const targetPath = path.join(imagesDir, fileName)
  await fs.promises.writeFile(targetPath, Buffer.from(info.data, 'base64'))
  const relativePath = `./images/${fileName}`
  registry.byKey.set(registryKey, relativePath)
  return relativePath
}

const fillToCss = async (
  fill: Fill | undefined,
  imagesDir: string,
  registry: ImageRegistry
): Promise<string[]> => {
  if (!fill) return []
  if (fill.type === 'color' && fill.value) {
    const color = sanitizeImportedCssColor(fill.value)
    return color ? [`background:${color}`] : []
  }
  if (fill.type === 'image' && fill.value?.base64) {
    const imagePath = await writeImageDataUrl(
      imagesDir,
      registry,
      fill.value.ref || fill.value.base64,
      fill.value.base64
    )
    if (imagePath) {
      return [
        `background-image:url('${imagePath}')`,
        'background-size:cover',
        'background-position:center'
      ]
    }
  }
  if (fill.type === 'gradient' && Array.isArray(fill.value?.colors) && fill.value.colors.length) {
    const colors = fill.value.colors
      .map((item, index) => sanitizeGradientStop(item.color, item.pos, index, fill.value.colors.length))
      .filter((item): item is string => Boolean(item))
    return colors.length ? [`background:linear-gradient(135deg, ${colors.join(', ')})`] : []
  }
  return []
}

const borderCss = (element: Record<string, unknown>, scale: number): string[] => {
  const width = clampNumber(element.borderWidth)
  if (width <= 0) return []
  const color = sanitizeImportedCssColor(element.borderColor)
  if (isTransparentCssColor(color)) return []
  const rawType = typeof element.borderType === 'string' ? element.borderType.trim().toLowerCase() : ''
  const type = ['solid', 'dashed', 'dotted', 'double'].includes(rawType) ? rawType : 'solid'
  return [`border:${Math.max(1, width * scale).toFixed(1)}px ${type} ${color}`]
}

const normalizeBorderType = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (['solid', 'dashed', 'dotted', 'double'].includes(raw)) return raw
  return 'solid'
}

const tableBorderDeclaration = (
  side: TableBorderSide,
  border: ImportedTableBorder | undefined,
  scale: number
): string | null => {
  if (!border) return null
  const width = clampNumber(border.borderWidth)
  if (width <= 0) return null
  const color = sanitizeImportedCssColor(border.borderColor)
  if (isTransparentCssColor(color)) return null
  const type = normalizeBorderType(border.borderType)
  return `border-${side}:${Math.max(0.5, width * scale).toFixed(1)}px ${type} ${color}`
}

const tableBorderDeclarations = (
  cellBorders: Partial<Record<TableBorderSide, ImportedTableBorder>> | undefined,
  fallbackBorders: Partial<Record<TableBorderSide, ImportedTableBorder>> | undefined,
  scale: number
): string[] => {
  const declarations = (['top', 'right', 'bottom', 'left'] as TableBorderSide[])
    .map((side) => tableBorderDeclaration(side, cellBorders?.[side] || fallbackBorders?.[side], scale))
    .filter((item): item is string => Boolean(item))
  return declarations.length > 0 ? declarations : ['border:1px solid #d1d5db']
}

const spanAttr = (name: 'colspan' | 'rowspan', value: unknown): string => {
  const span = Math.floor(clampNumber(value, 1))
  return span > 1 ? ` ${name}="${span}"` : ''
}

const spanSize = (value: unknown): number => Math.max(1, Math.floor(clampNumber(value, 1)))

const isMergedTableContinuation = (cell: ImportedTableCell): boolean =>
  clampNumber(cell.hMerge) > 0 || clampNumber(cell.vMerge) > 0

const tableVerticalAlign = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'mid' || raw === 'middle' || raw === 'center' || raw === 'ctr') return 'middle'
  if (raw === 'down' || raw === 'bottom' || raw === 'b') return 'bottom'
  return 'top'
}

const resolveSlideFit = (size: { width: number; height: number }): {
  scale: number
  offsetX: number
  offsetY: number
} => {
  const sourceWidth = Math.max(1, size.width)
  const sourceHeight = Math.max(1, size.height)
  const scale = Math.min(PAGE_WIDTH / sourceWidth, PAGE_HEIGHT / sourceHeight)
  return {
    scale,
    offsetX: Math.max(0, (PAGE_WIDTH - sourceWidth * scale) / 2),
    offsetY: Math.max(0, (PAGE_HEIGHT - sourceHeight * scale) / 2)
  }
}

const overlapArea = (
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number }
): number => {
  const x = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
  const y = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  return x * y
}

const centerInside = (
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number }
): boolean => {
  const cx = inner.x + inner.w / 2
  const cy = inner.y + inner.h / 2
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h
}

const resolveElementAnimation = (
  context: SlideAnimationContext | undefined,
  element: Record<string, unknown>,
  offsetX: number,
  offsetY: number
): ImportedElementAnimation | undefined => {
  const plan = context?.plan
  if (!plan || plan.animations.length === 0) return undefined
  const name = normalizePptxShapeName(element.name)
  if (name) {
    const byName = plan.byName.get(name)
    const match = byName?.find((animation) => !context.usedAnimationIds.has(animation.id))
    if (match) {
      context.usedAnimationIds.add(match.id)
      return match
    }
  }

  const box = {
    x: clampNumber(element.left) + offsetX,
    y: clampNumber(element.top) + offsetY,
    w: Math.max(1, clampNumber(element.width)),
    h: Math.max(1, clampNumber(element.height))
  }
  const boxArea = Math.max(0.0001, box.w * box.h)
  const candidates = plan.animations
    .filter(
      (animation) =>
        !context.usedAnimationIds.has(animation.id) &&
        animation.x !== undefined &&
        animation.y !== undefined &&
        animation.w !== undefined &&
        animation.h !== undefined
    )
    .map((animation) => {
      const animBox = {
        x: animation.x || 0,
        y: animation.y || 0,
        w: Math.max(1, animation.w || 1),
        h: Math.max(1, animation.h || 1)
      }
      const overlap = overlapArea(box, animBox)
      const animArea = Math.max(0.0001, animBox.w * animBox.h)
      const eligible =
        overlap > 0 &&
        (centerInside(box, animBox) || overlap / boxArea >= 0.45 || overlap / animArea >= 0.25)
      return { animation, overlap, eligible }
    })
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.overlap - a.overlap || a.animation.id - b.animation.id)
  const match = candidates[0]?.animation
  if (match) context.usedAnimationIds.add(match.id)
  return match
}

const adjustTextBlockWithPretext = async (args: {
  validator?: PptxTextValidator
  element: Record<string, unknown>
  blockId: string
  content: string
  text: string
  scaleX: number
  scaleY: number
  textScale: number
  offsetX: number
  offsetY: number
  pageNumber?: number
  warnings?: ImportWarning[]
}): Promise<TextImportAdjustment> => {
  if (!args.validator || args.text.length < 2) {
    return { content: args.content, extraCss: [] }
  }
  const y = (clampNumber(args.element.top) + clampNumber(args.offsetY)) * args.scaleY
  const width = Math.max(1, clampNumber(args.element.width) * args.scaleX)
  const height = Math.max(1, clampNumber(args.element.height) * args.scaleY)
  const typography = extractTextTypography(args.content, args.element, args.textScale)
  const [result] = await args.validator.measure([
    {
      id: args.blockId,
      text: args.text,
      width,
      height,
      ...typography
    }
  ])
  if (!result || (!result.overflow && result.suggestedFontSize >= typography.fontSize - 0.5)) {
    return {
      content: args.content,
      extraCss: [
        `font-size:${typography.fontSize.toFixed(1)}px`,
        `line-height:${typography.lineHeight.toFixed(1)}px`
      ]
    }
  }

  const fontRatio = Math.min(1, result.suggestedFontSize / typography.fontSize)
  const maxHeight = Math.max(1, PAGE_HEIGHT - y - 2)
  const nextHeight = Math.min(maxHeight, Math.max(height, result.suggestedHeight))
  const extraCss = [
    `font-size:${result.suggestedFontSize.toFixed(1)}px`,
    `line-height:${result.suggestedLineHeight.toFixed(1)}px`
  ]
  if (nextHeight > height + 1) {
    extraCss.push(`height:${nextHeight.toFixed(1)}px`)
  }
  args.warnings?.push({
    pageNumber: args.pageNumber,
    message: `文本块 ${args.blockId} 已按 Pretext 测量调整排版`
  })

  return {
    content: scaleContentTypography(args.content, fontRatio),
    extraCss
  }
}

const titleFromSlide = (slide: Slide, pageNumber: number): string => {
  const candidates = flattenElements([...(slide.layoutElements || []), ...(slide.elements || [])])
    .filter((item) => (item.element.type === 'text' || item.element.type === 'shape') && item.text.length > 0)
    .map((item) => {
      const area = item.width * item.height
      const textLength = Array.from(item.text).length
      const isShortFragment = textLength <= 1
      const isPrimaryBand = item.top < 180
      const score =
        area +
        (isPrimaryBand ? 8000 : 0) +
        (hasCjkText(item.text) ? 5000 : 0) +
        (hasDeckTitleKeyword(item.text) ? 28000 : 0) +
        (textLength >= 2 && textLength <= 28 ? 6000 : 0) -
        (isShortFragment ? 16000 : 0) -
        (isLowValueTitleText(item.text) ? 50000 : 0)
      return { ...item, area, score }
    })
    .sort((a, b) => b.score - a.score || a.top - b.top)
  const title = candidates.find((item) => !isLowValueTitleText(item.text))?.text || candidates[0]?.text
  return title?.slice(0, 80) || `第 ${pageNumber} 页`
}

const countExplicitTextLines = (content: string): number | null => {
  const $ = cheerio.load(`<body>${content}</body>`, { scriptingEnabled: false })
  const paragraphs = $('p')
  if (paragraphs.length === 0) return null
  let lineCount = 0
  paragraphs.each((_, node) => {
    const paragraph = $(node)
    const text = paragraph.text().replace(/\u00a0/g, ' ').trim()
    if (!text) return
    lineCount += Math.max(1, paragraph.find('br').length + 1)
  })
  return lineCount > 0 ? lineCount : null
}

const isCompactAutoFitText = (
  element: Record<string, unknown>,
  content: string,
  scaleY: number,
  textScale: number
): boolean => {
  const autoFit = element.autoFit as { type?: string } | undefined
  if (autoFit?.type !== 'shape') return false
  const text = stripHtml(content)
  if (!text) return false
  const lineCount = countExplicitTextLines(content)
  if (!lineCount || lineCount > 3) return false
  const typography = extractTextTypography(content, element, textScale)
  const renderedHeight = Math.max(1, clampNumber(element.height) * scaleY)
  const lineHeight = Math.max(1, typography.lineHeight)
  return renderedHeight <= lineHeight * (lineCount + 0.95)
}

const textAnchorCss = (xmlShape?: PptxXmlShapeMetadata): string[] => {
  const anchor = xmlShape?.textAnchor?.toLowerCase()
  if (anchor !== 'ctr' && anchor !== 'b') return []
  return [
    'display:flex',
    'flex-direction:column',
    `justify-content:${anchor === 'b' ? 'flex-end' : 'center'}`
  ]
}

const textVerticalCss = (
  element: Record<string, unknown>,
  xmlShape: PptxXmlShapeMetadata | undefined,
  content: string,
  scaleY: number,
  textScale: number
): string[] => {
  const anchorCss = textAnchorCss(xmlShape)
  if (anchorCss.length) return anchorCss
  if (!isCompactAutoFitText(element, content, scaleY, textScale)) return []
  return [
    'display:flex',
    'flex-direction:column',
    'justify-content:center'
  ]
}

const textInsetCss = (xmlShape?: PptxXmlShapeMetadata, scale = 1): string[] => {
  const base = ['box-sizing:border-box']
  const insets = xmlShape?.textInsets
  if (!insets) return [...base, 'padding:0.1px']
  const top = insets.top ?? 0
  const right = insets.right ?? 0
  const bottom = insets.bottom ?? 0
  const left = insets.left ?? 0
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return [...base, 'padding:0.1px']
  return [
    ...base,
    `padding:${(top * scale).toFixed(1)}px ${(right * scale).toFixed(1)}px ${(bottom * scale).toFixed(1)}px ${(left * scale).toFixed(1)}px`
  ]
}

const applyXmlShapeFrame = (
  element: Record<string, unknown>,
  xmlShape?: PptxXmlShapeMetadata
): Record<string, unknown> => {
  if (!xmlShape) return element
  return {
    ...element,
    left: xmlShape.left ?? element.left,
    top: xmlShape.top ?? element.top,
    width: xmlShape.width ?? element.width,
    height: xmlShape.height ?? element.height,
    rotate: xmlShape.rotate ?? element.rotate,
    isFlipH: Boolean(element.isFlipH) || Boolean(xmlShape.flipH),
    isFlipV: Boolean(element.isFlipV) || Boolean(xmlShape.flipV)
  }
}

const layerSourceRank = (source: unknown): number => {
  if (source === 'master') return 0
  if (source === 'layout') return 1
  if (source === 'slide') return 2
  if (source === 'group') return 3
  return 4
}

const numberAtPath = (path: unknown, index: number): number => {
  if (!Array.isArray(path)) return 0
  return clampNumber(path[index])
}

const compareElementLayerPath = (leftPath: unknown, rightPath: unknown): number => {
  const left = Array.isArray(leftPath) ? leftPath : []
  const right = Array.isArray(rightPath) ? rightPath : []
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const delta = numberAtPath(left, i) - numberAtPath(right, i)
    if (delta !== 0) return delta
  }
  return 0
}

const elementLayer = (element: Element): ElementLayer | undefined =>
  (element as unknown as Record<string, unknown>).layer as ElementLayer | undefined

const elementZIndex = (element: Element): number => {
  const record = element as unknown as Record<string, unknown>
  const layer = elementLayer(element)
  return clampNumber(record.zIndex ?? layer?.zIndex ?? record.order)
}

const compareElementsForRender = (left: Element, right: Element): number => {
  const leftLayer = elementLayer(left)
  const rightLayer = elementLayer(right)
  return (
    layerSourceRank(leftLayer?.source) - layerSourceRank(rightLayer?.source) ||
    elementZIndex(left) - elementZIndex(right) ||
    compareElementLayerPath(leftLayer?.path, rightLayer?.path) ||
    clampNumber((left as unknown as Record<string, unknown>).order) -
      clampNumber((right as unknown as Record<string, unknown>).order)
  )
}

const buildTextBlock = async (args: {
  element: Record<string, unknown>
  blockId: string
  role?: string
  animation?: ImportedElementAnimation
  imagesDir: string
  registry: ImageRegistry
  scaleX: number
  scaleY: number
  textScale: number
  zIndex: number
  offsetX: number
  offsetY: number
  pageNumber?: number
  warnings?: ImportWarning[]
  textValidator?: PptxTextValidator
  xmlShape?: PptxXmlShapeMetadata
}): Promise<string> => {
  const fillCss = await fillToCss(args.element.fill as Fill | undefined, args.imagesDir, args.registry)
  const rawContent = String(args.element.content || '')
  const text = stripHtml(rawContent)
  const sanitizedContent = sanitizeContentHtml(rawContent, args.textScale)
  const adjustment = await adjustTextBlockWithPretext({
    validator: args.textValidator,
    element: args.element,
    blockId: args.blockId,
    content: sanitizedContent,
    text,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    textScale: args.textScale,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    pageNumber: args.pageNumber,
    warnings: args.warnings
  })
  const css = buildBlockStyle({
    element: args.element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    extra: [
      ...fillCss,
      ...borderCss(args.element, args.textScale),
      ...boxShadowCss(args.element, args.scaleX, args.scaleY),
      ...textInsetCss(args.xmlShape, args.textScale),
      ...textVerticalCss(args.element, args.xmlShape, sanitizedContent, args.scaleY, args.textScale),
      ...adjustment.extraCss
    ]
  })
  const roleAttr = args.role ? ` data-role="${escapeHtml(args.role)}"` : ''
  const animationAttrs = buildAnimationAttrs(args.animation)
  const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
  return `<section data-block-id="${escapeHtml(args.blockId)}"${roleAttr}${animationAttrText} style="${css}">${adjustment.content || '&nbsp;'}</section>`
}

const buildImageBlock = async (args: {
  element: Record<string, unknown>
  blockId: string
  animation?: ImportedElementAnimation
  imagesDir: string
  registry: ImageRegistry
  scaleX: number
  scaleY: number
  zIndex: number
  offsetX: number
  offsetY: number
}): Promise<string> => {
  const source = await writeImageDataUrl(
    args.imagesDir,
    args.registry,
    String(args.element.ref || args.element.base64 || args.blockId),
    String(args.element.base64 || '')
  )
  const css = buildBlockStyle({
    element: args.element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    overflow: 'hidden',
    extra: [...borderCss(args.element, Math.min(args.scaleX, args.scaleY)), 'display:flex']
  })
  const animationAttrs = buildAnimationAttrs(args.animation)
  const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
  if (!source) {
    return `<section data-block-id="${escapeHtml(args.blockId)}"${animationAttrText} style="${css};align-items:center;justify-content:center;background:#f3f4f6;color:#6b7280;font-size:18px;">图片未能导入</section>`
  }
  return `<figure data-block-id="${escapeHtml(args.blockId)}"${animationAttrText} style="${css}"><img src="${source}" alt="" style="width:100%;height:100%;object-fit:contain;display:block;" /></figure>`
}

const svgResourceId = (blockId: string, suffix: string): string =>
  `pptx-${blockId}-${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '-')

const OPEN_SHAPE_PRESETS = new Set(['arc', 'line', 'straightconnector1'])

const isOpenXmlShape = (xmlShape?: PptxXmlShapeMetadata): boolean =>
  Boolean(xmlShape?.preset && OPEN_SHAPE_PRESETS.has(xmlShape.preset.toLowerCase()))

const resolveSvgShapeFill = async (args: {
  fill?: Fill
  blockId: string
  safePath: string
  viewBox: SvgPathBounds
  imagesDir: string
  registry: ImageRegistry
}): Promise<SvgShapeFill> => {
  if (!args.fill) return { defs: [], paint: 'none' }
  if (args.fill.type === 'color') {
    return { defs: [], paint: sanitizeImportedCssColor(args.fill.value) || 'none' }
  }
  if (args.fill.type === 'gradient' && args.fill.value.colors.length > 0) {
    const gradient = args.fill.value
    const gradientId = svgResourceId(args.blockId, 'gradient')
    const fallbackPaint = gradient.colors
      .map((stop) => sanitizeImportedCssColor(stop.color))
      .find((color): color is string => Boolean(color)) || '#000000'
    const stops = gradient.colors
      .map((stop, index) => {
        const color = sanitizeImportedCssColor(stop.color)
        if (!color) return ''
        const offset = normalizeGradientPosition(stop.pos, index, gradient.colors.length)
        return `<stop offset="${offset}" stop-color="${color}" />`
      })
      .filter(Boolean)
      .join('')
    if (!stops) return { defs: [], paint: 'none' }
    if (gradient.path === 'line') {
      const rotation = clampNumber(gradient.rot)
      return {
        defs: [
          `<linearGradient id="${gradientId}" x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform="rotate(${rotation.toFixed(2)} 0.5 0.5)">${stops}</linearGradient>`
        ],
        paint: `url(#${gradientId}) ${fallbackPaint}`
      }
    }
    return {
      defs: [
        `<radialGradient id="${gradientId}" cx="50%" cy="50%" r="70%">${stops}</radialGradient>`
      ],
      paint: `url(#${gradientId}) ${fallbackPaint}`
    }
  }
  if (args.fill.type === 'pattern') {
    const patternId = svgResourceId(args.blockId, 'pattern')
    const foreground = sanitizeImportedCssColor(args.fill.value.foregroundColor) || '#000000'
    const background = sanitizeImportedCssColor(args.fill.value.backgroundColor) || '#ffffff'
    const patternType = String(args.fill.value.type || '').toLowerCase()
    const patternLines = patternType.includes('vert')
      ? '<path d="M4 0 V8" />'
      : patternType.includes('horz')
        ? '<path d="M0 4 H8" />'
        : patternType.includes('cross')
          ? '<path d="M4 0 V8 M0 4 H8" />'
          : '<path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" />'
    return {
      defs: [
        `<pattern id="${patternId}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${background}" /><g fill="none" stroke="${foreground}" stroke-width="1">${patternLines}</g></pattern>`
      ],
      paint: `url(#${patternId}) ${background}`
    }
  }
  if (args.fill.type === 'image' && args.fill.value.base64) {
    const source = await writeImageDataUrl(
      args.imagesDir,
      args.registry,
      args.fill.value.ref || args.fill.value.base64,
      args.fill.value.base64
    )
    if (!source) return { defs: [], paint: 'none' }
    const clipId = svgResourceId(args.blockId, 'clip')
    const opacity = Math.min(1, Math.max(0, clampNumber(args.fill.value.opacity, 1)))
    return {
      defs: [`<clipPath id="${clipId}"><path d="${escapeHtml(args.safePath)}" /></clipPath>`],
      paint: 'none',
      content: `<image href="${escapeHtml(source)}" x="${args.viewBox.minX.toFixed(4)}" y="${args.viewBox.minY.toFixed(4)}" width="${args.viewBox.width.toFixed(4)}" height="${args.viewBox.height.toFixed(4)}" preserveAspectRatio="xMidYMid slice" opacity="${opacity.toFixed(3)}" clip-path="url(#${clipId})" />`
    }
  }
  return { defs: [], paint: 'none' }
}

const buildShapeBlock = async (args: {
  element: Record<string, unknown>
  blockId: string
  role?: string
  animation?: ImportedElementAnimation
  imagesDir: string
  registry: ImageRegistry
  scaleX: number
  scaleY: number
  textScale: number
  zIndex: number
  offsetX: number
  offsetY: number
  pageNumber?: number
  warnings?: ImportWarning[]
  textValidator?: PptxTextValidator
  xmlShape?: PptxXmlShapeMetadata
}): Promise<string> => {
  const element = applyXmlShapeFrame(args.element, args.xmlShape)
  const rawContent = typeof element.content === 'string' ? element.content : ''
  const hasTextContent = stripHtml(rawContent).length > 0
  const customGeometryPath = args.xmlShape?.customGeometry
    ? renderPptxOoxmlCustomGeometryPath(
        args.xmlShape.customGeometry,
        clampNumber(element.width),
        clampNumber(element.height)
      )
    : ''
  const presetGeometryPath =
    !customGeometryPath && args.xmlShape?.preset
      ? renderXmlPresetShapePath(
          args.xmlShape.preset,
          clampNumber(element.width),
          clampNumber(element.height),
          args.xmlShape.adjustments
      )
      : ''
  const importedGeometryPath = !customGeometryPath && !presetGeometryPath &&
    String(element.shapType || '').toLowerCase() === 'customgeometry' &&
    typeof element.path === 'string'
    ? scaleImportedUnitPath(element.path, clampNumber(element.width), clampNumber(element.height))
    : ''
  const rawPath =
    customGeometryPath || presetGeometryPath || importedGeometryPath || (typeof element.path === 'string' ? element.path.trim() : '')
  const safePath = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(rawPath) ? rawPath : ''
  const fill = element.fill as Fill | undefined
  const pathBounds = safePath ? getSvgPathBounds(safePath) : null
  const isDegeneratePath = Boolean(pathBounds && (pathBounds.width < 0.5 || pathBounds.height < 0.5))
  const borderColor = sanitizeImportedCssColor(element.borderColor)
  const hasVisibleBorder = clampNumber(element.borderWidth) > 0 && !isTransparentCssColor(borderColor)
  const shapeHasVisibleFill = hasVisibleFill(fill)
  if (hasTextContent && (!(safePath && pathBounds) || (isDegeneratePath && !shapeHasVisibleFill && !hasVisibleBorder))) {
    return buildTextBlock({ ...args, element })
  }
  if (safePath && pathBounds) {
    const viewBox = getSvgShapeViewBox(element, pathBounds, safePath, args.xmlShape)
    const shadow = element.shadow as
      | { h?: number; v?: number; blur?: number; color?: string }
      | undefined
    const css = buildBlockStyle({
      element,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      zIndex: args.zIndex,
      offsetX: args.offsetX,
      offsetY: args.offsetY,
      overflow: shadow ? 'visible' : 'hidden'
    })
    const isOpenShape = isOpenXmlShape(args.xmlShape)
    const svgFill = isOpenShape
      ? { defs: [], paint: 'none' }
      : args.xmlShape?.fillColor
      ? { defs: [], paint: args.xmlShape.fillColor }
      : await resolveSvgShapeFill({
          fill,
          blockId: args.blockId,
          safePath,
          viewBox,
          imagesDir: args.imagesDir,
          registry: args.registry
        })
    const strokeWidth = Math.max(
      0,
      args.xmlShape?.lineWidth !== undefined
        ? args.xmlShape.lineWidth
        : clampNumber(element.borderWidth)
    ) * (4 / 3)
    const rawStrokeColor = args.xmlShape?.lineColor || sanitizeImportedCssColor(element.borderColor)
    const strokeColor = strokeWidth > 0 && !isTransparentCssColor(rawStrokeColor)
      ? rawStrokeColor || '#000000'
      : 'none'
    let dashArray = typeof element.borderStrokeDasharray === 'string' &&
      /^[0-9.,\s-]+$/.test(element.borderStrokeDasharray)
      ? element.borderStrokeDasharray
      : ''
    const borderType = String(element.borderType || '').toLowerCase()
    if (!dashArray && strokeWidth > 0 && borderType === 'dashed') {
      dashArray = `${(strokeWidth * 4).toFixed(2)} ${(strokeWidth * 2).toFixed(2)}`
    } else if (!dashArray && strokeWidth > 0 && borderType === 'dotted') {
      dashArray = `0 ${(strokeWidth * 2).toFixed(2)}`
    }
    if (strokeColor === 'none') dashArray = ''
    const defs = [...svgFill.defs]
    let filterAttribute = ''
    if (shadow) {
      const shadowColor = sanitizeImportedCssColor(shadow.color) || '#00000066'
      const shadowId = svgResourceId(args.blockId, 'shadow')
      defs.push(
        `<filter id="${shadowId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${(clampNumber(shadow.h) * (4 / 3)).toFixed(3)}" dy="${(clampNumber(shadow.v) * (4 / 3)).toFixed(3)}" stdDeviation="${Math.max(0, clampNumber(shadow.blur) * (2 / 3)).toFixed(3)}" flood-color="${shadowColor}" /></filter>`
      )
      filterAttribute = ` filter="url(#${shadowId})"`
    }
    const markerAttributes: string[] = []
    if (strokeColor !== 'none' && args.xmlShape?.headEnd && args.xmlShape.headEnd !== 'none') {
      const markerId = svgResourceId(args.blockId, 'head-arrow')
      defs.push(
        `<marker id="${markerId}" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill="${strokeColor}"></path></marker>`
      )
      markerAttributes.push(`marker-start="url(#${markerId})"`)
    }
    if (strokeColor !== 'none' && args.xmlShape?.tailEnd && args.xmlShape.tailEnd !== 'none') {
      const markerId = svgResourceId(args.blockId, 'tail-arrow')
      defs.push(
        `<marker id="${markerId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${strokeColor}"></path></marker>`
      )
      markerAttributes.push(`marker-end="url(#${markerId})"`)
    }
    const flipX = element.isFlipH ? -1 : 1
    const flipY = element.isFlipV ? -1 : 1
    const svgTransform = flipX === 1 && flipY === 1
      ? ''
      : `transform:scale(${flipX},${flipY});transform-origin:center;`
    const animationAttrs = buildAnimationAttrs(args.animation)
    const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
    const defsMarkup = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : ''
    const markerAttrText = markerAttributes.length ? ` ${markerAttributes.join(' ')}` : ''
    const shapeMarkup = `${svgFill.content || ''}<path d="${escapeHtml(safePath)}" fill="${svgFill.paint}" stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(3)}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} stroke-linecap="round" stroke-linejoin="round"${markerAttrText} />`
    const sanitizedOverlayContent = hasTextContent ? sanitizeContentHtml(rawContent, args.textScale) : ''
    const overlayCss = [
      'position:absolute',
      'inset:0',
      'overflow:visible',
      ...textInsetCss(args.xmlShape, args.textScale),
      ...textVerticalCss(
        element,
        args.xmlShape,
        sanitizedOverlayContent,
        args.scaleY,
        args.textScale
      )
    ].join(';')
    const textOverlay = hasTextContent
      ? `<div style="${overlayCss}">${sanitizedOverlayContent}</div>`
      : ''
    return `<figure data-block-id="${escapeHtml(args.blockId)}" data-pptx-kind="vector-shape"${animationAttrText} style="${css};margin:0"><svg viewBox="${viewBox.minX.toFixed(4)} ${viewBox.minY.toFixed(4)} ${viewBox.width.toFixed(4)} ${viewBox.height.toFixed(4)}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible;${svgTransform}" aria-hidden="true">${defsMarkup}<g${filterAttribute}>${shapeMarkup}</g></svg>${textOverlay}</figure>`
  }
  const fillCss = await fillToCss(element.fill as Fill | undefined, args.imagesDir, args.registry)
  const shadowCss = boxShadowCss(element, args.scaleX, args.scaleY)
  const css = buildBlockStyle({
    element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    overflow: shadowCss.length ? 'visible' : 'hidden',
    extra: [...fillCss, ...borderCss(element, args.textScale), ...shadowCss]
  })
  const animationAttrs = buildAnimationAttrs(args.animation)
  const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
  return `<div data-block-id="${escapeHtml(args.blockId)}"${animationAttrText} style="${css}"></div>`
}

const scaleImportedUnitPath = (path: string, width: number, height: number): string => {
  const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []
  const output: string[] = []
  let command = ''
  let coordinateIndex = 0
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      command = token
      coordinateIndex = 0
      output.push(token)
      continue
    }
    const value = Number(token)
    if (!Number.isFinite(value)) continue
    const upperCommand = command.toUpperCase()
    let scaled = value
    if (['M', 'L', 'C', 'Q', 'S', 'T'].includes(upperCommand)) {
      scaled = value * (coordinateIndex % 2 === 0 ? width : height)
    } else if (upperCommand === 'A') {
      const arcIndex = coordinateIndex % 7
      if (arcIndex === 0 || arcIndex === 5) scaled = value * width
      else if (arcIndex === 1 || arcIndex === 6) scaled = value * height
    }
    output.push(Number(scaled.toFixed(4)).toString())
    coordinateIndex += 1
  }
  return output.join(' ')
}

const buildTableBlock = (args: {
  element: Record<string, unknown>
  blockId: string
  animation?: ImportedElementAnimation
  scaleX: number
  scaleY: number
  textScale: number
  zIndex: number
  offsetX: number
  offsetY: number
}): string => {
  const rows = Array.isArray(args.element.data) ? (args.element.data as ImportedTableCell[][]) : []
  const tableTextScale = Math.min(args.textScale, 1.25)
  const tableBorders = args.element.borders as Partial<Record<TableBorderSide, ImportedTableBorder>> | undefined
  const colWidths = Array.isArray(args.element.colWidths)
    ? (args.element.colWidths as unknown[])
        .map((width) => clampNumber(width) * args.scaleX)
        .filter((width) => width > 0)
    : []
  const rowHeights = Array.isArray(args.element.rowHeights)
    ? (args.element.rowHeights as unknown[]).map((height) => clampNumber(height) * args.scaleY)
    : []
  const colgroup = colWidths.length
    ? `<colgroup>${colWidths
        .map((width) => `<col style="width:${width.toFixed(1)}px;" />`)
        .join('')}</colgroup>`
    : ''
  const tableRows = rows
    .map((row, rowIndex) => {
      let logicalColIndex = 0
      const rowHeight = rowHeights[rowIndex] && rowHeights[rowIndex] > 0
        ? ` style="height:${rowHeights[rowIndex].toFixed(1)}px;"`
        : ''
      const cells = row
        .map((cell) => {
          if (isMergedTableContinuation(cell)) {
            logicalColIndex += 1
            return ''
          }
          const colIndex = logicalColIndex
          logicalColIndex += spanSize(cell.colSpan)
          const styles = [
            ...tableBorderDeclarations(cell.borders, tableBorders, args.textScale),
            'padding:6px 8px',
            'overflow-wrap:anywhere',
            'white-space:pre-wrap',
            `vertical-align:${tableVerticalAlign(cell.vAlign)}`,
            sanitizeImportedCssColor(cell.fillColor) ? `background:${sanitizeImportedCssColor(cell.fillColor)}` : '',
            sanitizeImportedCssColor(cell.fontColor) ? `color:${sanitizeImportedCssColor(cell.fontColor)}` : '',
            cell.fontBold ? 'font-weight:700' : '',
            rowHeights[rowIndex] && rowHeights[rowIndex] > 0
              ? `height:${rowHeights[rowIndex].toFixed(1)}px`
              : ''
          ]
            .filter(Boolean)
            .join(';')
          const colspan = spanAttr('colspan', cell.colSpan)
          const rowspan = spanAttr('rowspan', cell.rowSpan)
          const content = sanitizeTableCellContentHtml(String(cell.text || ''), args.textScale)
          return `<td data-cell-id="r${rowIndex + 1}-c${colIndex + 1}"${colspan}${rowspan} style="${styles}">${content || '&nbsp;'}</td>`
        })
        .join('')
      return `<tr${rowHeight}>${cells}</tr>`
    })
    .join('')
  const css = buildBlockStyle({
    element: args.element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    extra: ['background:transparent']
  })
  const placeholderCss = buildBlockStyle({
    element: args.element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    extra: ['background:#fff']
  })
  const animationAttrs = buildAnimationAttrs(args.animation)
  const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
  if (!rows.length) {
    return `<section data-block-id="${escapeHtml(args.blockId)}" data-pptx-kind="table" data-pptx-import-mode="placeholder"${animationAttrText} style="${placeholderCss};display:flex;align-items:center;justify-content:center;color:#6b7280;">表格已作为占位导入</section>`
  }
  return `<section data-block-id="${escapeHtml(args.blockId)}" data-pptx-kind="table" data-pptx-import-mode="editable"${animationAttrText} style="${css}"><table style="width:100%;height:100%;border-collapse:collapse;border-spacing:0;table-layout:fixed;font-size:${Math.max(12, 12 * tableTextScale).toFixed(1)}px;">${colgroup}${tableRows}</table></section>`
}

export const __pptxImporterTestUtils = {
  buildShapeBlock,
  buildTextBlock,
  buildTableBlock,
  buildChartBlock,
  flattenElements,
  compareElementsForRender,
  resolveSlideFit,
  sanitizeContentHtml,
  getSvgPathBounds,
  xmlShapeFromParserOoxml
}

const renderElement = async (args: {
  element: Element
  pageId: string
  blockCounters: Record<string, number>
  animationContext?: SlideAnimationContext
  inheritedAnimation?: ImportedElementAnimation
  imagesDir: string
  registry: ImageRegistry
  scaleX: number
  scaleY: number
  textScale: number
  zIndexCounter: ZIndexCounter
  offsetX: number
  offsetY: number
  titleAssigned: boolean
  pageNumber?: number
  warnings?: ImportWarning[]
  textValidator?: PptxTextValidator
  chartRewrite?: PptxChartRewriteHandler
}): Promise<{ html: string; titleAssigned: boolean }> => {
  const nextBlockId = (prefix: string): string => {
    args.blockCounters[prefix] = (args.blockCounters[prefix] || 0) + 1
    return `${prefix}-${args.blockCounters[prefix]}`
  }
  const record = args.element as unknown as Record<string, unknown>
  const xmlShape = xmlShapeFromParserOoxml(record)
  const elementAnimation =
    resolveElementAnimation(args.animationContext, record, args.offsetX, args.offsetY) ||
    args.inheritedAnimation
  if (args.element.type === 'group') {
    const children = Array.isArray(args.element.elements)
      ? normalizeGroupChildren(args.element, args.element.elements).sort(compareElementsForRender)
      : []
    const rendered: string[] = []
    let titleAssigned = args.titleAssigned
    const groupOffsetX = args.offsetX + clampNumber(record.left)
    const groupOffsetY = args.offsetY + clampNumber(record.top)
    for (const child of children) {
      const result = await renderElement({
        ...args,
        element: child,
        offsetX: groupOffsetX,
        offsetY: groupOffsetY,
        inheritedAnimation: elementAnimation,
        titleAssigned
      })
      rendered.push(result.html)
      titleAssigned = result.titleAssigned
    }
    return { html: rendered.join('\n'), titleAssigned }
  }
  if (args.element.type === 'image') {
    return {
      html: await buildImageBlock({
        element: record,
        blockId: nextBlockId('image'),
        animation: elementAnimation,
        imagesDir: args.imagesDir,
        registry: args.registry,
        scaleX: args.scaleX,
        scaleY: args.scaleY,
        offsetX: args.offsetX,
        offsetY: args.offsetY,
        zIndex: args.zIndexCounter.value++
      }),
      titleAssigned: args.titleAssigned
    }
  }
  if (args.element.type === 'table') {
    return {
      html: buildTableBlock({
        element: record,
        blockId: nextBlockId('table'),
        animation: elementAnimation,
        scaleX: args.scaleX,
        scaleY: args.scaleY,
        textScale: args.textScale,
        offsetX: args.offsetX,
        offsetY: args.offsetY,
        zIndex: args.zIndexCounter.value++
      }),
      titleAssigned: args.titleAssigned
    }
  }
  if (args.element.type === 'chart') {
    const chartIndex = (args.blockCounters.chart || 0) + 1
    args.blockCounters.chart = chartIndex
    const blockId = `chart-${chartIndex}`
    const canvasId = chartCanvasId(args.pageId, chartIndex)
    const animationAttrs = buildAnimationAttrs(elementAnimation)
    const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
    const zIndex = args.zIndexCounter.value++
    const frameStyle = buildChartFrameStyle({
      element: args.element,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      zIndex,
      offsetX: args.offsetX,
      offsetY: args.offsetY
    })
    let html = buildChartBlock({
      element: args.element,
      blockId,
      animation: elementAnimation,
      pageId: args.pageId,
      chartIndex,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      offsetX: args.offsetX,
      offsetY: args.offsetY,
      zIndex,
      pageNumber: args.pageNumber,
      warnings: args.warnings,
      suppressUnsupportedWarning: true
    })
    if (html.includes('data-pptx-import-mode="placeholder"') && args.chartRewrite) {
      const rewritten = await args.chartRewrite({
        element: args.element,
        blockId,
        pageId: args.pageId,
        chartIndex,
        canvasId,
        frameStyle,
        animationAttrs,
        pageNumber: args.pageNumber
      })
      if (rewritten?.config) {
        html = buildChartHtmlFromConfig({
          element: args.element,
          blockId,
          canvasId,
          frameStyle,
          animationAttrText,
          config: rewritten.config
        })
        if (rewritten.warnings?.length) {
          args.warnings?.push(
            ...rewritten.warnings.map((message) => ({ pageNumber: args.pageNumber, message }))
          )
        }
      }
    }
    if (html.includes('data-pptx-import-mode="placeholder"')) {
      args.warnings?.push({
        pageNumber: args.pageNumber,
        message: unsupportedChartWarning(blockId, args.element.chartType)
      })
    }
    return {
      html,
      titleAssigned: args.titleAssigned
    }
  }
  if (args.element.type === 'text') {
    const text = stripHtml(String(record.content || ''))
    const shouldBeTitle = !args.titleAssigned && text.length > 0 && clampNumber(record.top) < 120
    return {
      html: await buildTextBlock({
        element: record,
        blockId: shouldBeTitle ? 'title' : nextBlockId('text'),
        role: shouldBeTitle ? 'title' : undefined,
        animation: elementAnimation,
        imagesDir: args.imagesDir,
        registry: args.registry,
        scaleX: args.scaleX,
        scaleY: args.scaleY,
        textScale: args.textScale,
        offsetX: args.offsetX,
        offsetY: args.offsetY,
        zIndex: args.zIndexCounter.value++,
        pageNumber: args.pageNumber,
        warnings: args.warnings,
        textValidator: args.textValidator,
        xmlShape
      }),
      titleAssigned: args.titleAssigned || shouldBeTitle
    }
  }
  if (args.element.type === 'shape') {
    const text = stripHtml(String(record.content || ''))
    const shouldBeTitle = !args.titleAssigned && text.length > 0 && clampNumber(record.top) < 120
    return {
      html: await buildShapeBlock({
        element: record,
        blockId: shouldBeTitle ? 'title' : nextBlockId(text ? 'text' : 'shape'),
        role: shouldBeTitle ? 'title' : undefined,
        animation: elementAnimation,
        imagesDir: args.imagesDir,
        registry: args.registry,
        scaleX: args.scaleX,
        scaleY: args.scaleY,
        textScale: args.textScale,
        offsetX: args.offsetX,
        offsetY: args.offsetY,
        zIndex: args.zIndexCounter.value++,
        xmlShape,
        pageNumber: args.pageNumber,
        warnings: args.warnings,
        textValidator: args.textValidator
      }),
      titleAssigned: args.titleAssigned || shouldBeTitle
    }
  }
  if (args.element.type === 'diagram' && Array.isArray(args.element.elements)) {
    const text = args.element.textList?.join(' / ') || 'SmartArt'
    const css = buildBlockStyle({
      element: record,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      zIndex: args.zIndexCounter.value++,
      offsetX: args.offsetX,
      offsetY: args.offsetY,
      extra: ['background:#f8fafc', 'border:1px dashed #cbd5e1', 'padding:12px', 'color:#475569']
    })
    const animationAttrs = buildAnimationAttrs(elementAnimation)
    const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
    return {
      html: `<section data-block-id="${nextBlockId('diagram')}"${animationAttrText} style="${css}">${escapeHtml(text)}</section>`,
      titleAssigned: args.titleAssigned
    }
  }
  if (args.element.type === 'math') {
    const text = String(record.latex || record.text || 'Formula')
    const css = buildBlockStyle({
      element: record,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      zIndex: args.zIndexCounter.value++,
      offsetX: args.offsetX,
      offsetY: args.offsetY,
      extra: [
        'background:#ffffff',
        'border:1px dashed #cbd5e1',
        'padding:10px',
        'color:#334155',
        'font-family:Georgia,serif',
        'font-size:18px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'text-align:center'
      ]
    })
    const animationAttrs = buildAnimationAttrs(elementAnimation)
    const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
    return {
      html: `<section data-block-id="${nextBlockId('math')}" data-pptx-kind="math"${animationAttrText} style="${css}">${escapeHtml(text)}</section>`,
      titleAssigned: args.titleAssigned
    }
  }
  return { html: '', titleAssigned: args.titleAssigned }
}

const buildFallbackTitle = (title: string): string =>
  `<header data-block-id="title" data-role="title" style="position:absolute;left:48px;top:36px;width:900px;height:56px;z-index:1;overflow:hidden;">
    <h1 style="margin:0;font-size:36px;line-height:1.2;color:#111827;">${escapeHtml(title)}</h1>
  </header>`

const buildImportedPptxMotionScript = (): string => `<script data-pptx-import-motion="1">
(function () {
  function runImportedPptxMotion() {
    var root = document.querySelector(".ppt-page-root");
    var pptApi = window.PPT;
    if (!root || !pptApi || typeof pptApi.scanDataAnim !== "function") return;
    var config = pptApi.scanDataAnim(root);
    if (!config || (!config.load.length && !config.click.length)) return;
    if (config.load.length && typeof pptApi.executeDataAnim === "function") {
      pptApi.executeDataAnim(config.load);
    }
    if (config.click.length && pptApi.clicks && typeof pptApi.clicks.on === "function") {
      var clickSteps = Array.isArray(config.clickSteps) && config.clickSteps.length > 0
        ? config.clickSteps
        : config.click.map(function (animDef) { return [animDef]; });
      clickSteps.forEach(function (stepDefs, index) {
        pptApi.clicks.on(index + 1, function () {
          if (typeof pptApi.executeDataAnim === "function") {
            pptApi.executeDataAnim(stepDefs);
          }
        });
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runImportedPptxMotion, { once: true });
  } else {
    runImportedPptxMotion();
  }
})();
</script>`

const buildSlideHtml = async (args: {
  slide: Slide
  pageNumber: number
  pageId: string
  title: string
  size: { width: number; height: number }
  animationPlan?: SlideAnimationPlan
  projectDir: string
  registry: ImageRegistry
  textValidator?: PptxTextValidator
  chartRewrite?: PptxChartRewriteHandler
}): Promise<{ html: string; contentOutline: string; warnings: ImportWarning[] }> => {
  const imagesDir = path.join(args.projectDir, 'images')
  const slideFit = resolveSlideFit(args.size)
  const scaleX = slideFit.scale
  const scaleY = slideFit.scale
  const textScale = slideFit.scale
  const warnings: ImportWarning[] = []
  const backgroundCss = await fillToCss(args.slide.fill, imagesDir, args.registry)
  const blockCounters: Record<string, number> = {}
  const animationContext: SlideAnimationContext = {
    plan: args.animationPlan,
    usedAnimationIds: new Set<number>()
  }
  const elements = [...(args.slide.layoutElements || []), ...(args.slide.elements || [])].sort(
    compareElementsForRender
  )
  const rendered: string[] = []
  const zIndexCounter: ZIndexCounter = { value: 2 }
  let titleAssigned = false
  for (const [index, element] of elements.entries()) {
    try {
      const result = await renderElement({
        element,
        pageId: args.pageId,
        blockCounters,
        animationContext,
        imagesDir,
        registry: args.registry,
        scaleX,
        scaleY,
        textScale,
        zIndexCounter,
        offsetX: slideFit.offsetX,
        offsetY: slideFit.offsetY,
        titleAssigned,
        pageNumber: args.pageNumber,
        warnings,
        textValidator: args.textValidator,
        chartRewrite: args.chartRewrite
      })
      if (result.html) rendered.push(result.html)
      titleAssigned = result.titleAssigned
    } catch (error) {
      warnings.push({
        pageNumber: args.pageNumber,
        message: `元素 ${index + 1} 导入失败：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
  if (!titleAssigned) {
    rendered.unshift(buildFallbackTitle(args.title))
  }
  const contentOutline = flattenElements(elements)
    .map(({ element, text }) => {
      if (text && !isLowValueTitleText(text)) return text
      if (element.type === 'table') return '表格'
      if (element.type === 'chart') return '图表'
      if (element.type === 'image') return '图片'
      return ''
    })
    .filter(Boolean)
    .slice(0, 8)
    .join('；')
  const sectionStyle = ['position:relative', 'width:100%', 'height:100%', 'overflow:hidden', ...backgroundCss].join(';')
  const hasImportedAnimations = rendered.some((html) => /\sdata-anim=/.test(html))
  const body = `<section data-page-scaffold="1" style="${sectionStyle}">
  <main data-block-id="content" data-role="content" style="position:absolute;inset:0;z-index:0;">
    ${rendered.join('\n')}
  </main>
</section>
${hasImportedAnimations ? buildImportedPptxMotionScript() : ''}`
  const scaffold = buildPageScaffoldHtml({
    pageNumber: args.pageNumber,
    pageId: args.pageId,
    title: args.title
  }, PPTX_IMPORT_SLIDE_SIZE)
  const $ = cheerio.load(scaffold, { scriptingEnabled: false })
  $('.ppt-page-root').first().removeClass('p-2 p-8').attr('style', 'padding:0;')
  $('.ppt-page-content').first().html(body)
  const html = $.html()
  const validation = validatePersistedPageHtml(html, args.pageId)
  if (!validation.valid) {
    warnings.push(
      ...validation.errors.map((message) => ({
        pageNumber: args.pageNumber,
        message
      }))
    )
  }
  return {
    html,
    contentOutline: contentOutline || args.title,
    warnings
  }
}

/**
 * 等距抽样：从 slides 中均匀选取 count 页，保证首尾都包含，中间按等距取。
 */
type SelectedSlide<T> = { slide: T; originalIndex: number }

function selectSlidesEvenly<T>(slides: T[], count: number): SelectedSlide<T>[] {
  const entries = slides.map((slide, originalIndex) => ({ slide, originalIndex }))
  if (count >= slides.length) return entries
  if (count <= 2) return [entries[0], entries[entries.length - 1]]
  const result: SelectedSlide<T>[] = [entries[0]]
  const middle = slides.slice(1, -1)
  const middleCount = count - 2
  for (let i = 0; i < middleCount; i++) {
    const idx = Math.floor((i + 0.5) * middle.length / middleCount)
    result.push(entries[idx + 1])
  }
  result.push(entries[entries.length - 1])
  return result
}

export async function importPptxToEditableHtml(args: {
  filePath: string
  projectDir: string
  title?: string
  maxPages?: number
  onProgress?: ImportProgress
  chartRewrite?: PptxChartRewriteHandler
}): Promise<ImportedPptxDeck> {
  const fileName = path.basename(args.filePath)
  const title = (args.title || path.basename(fileName, path.extname(fileName)) || '导入的 PPTX').trim()
  const indexPath = path.join(args.projectDir, 'index.html')
  const imagesDir = path.join(args.projectDir, 'images')
  await fs.promises.mkdir(imagesDir, { recursive: true })
  args.onProgress?.({ stage: 'reading', progress: 5, label: '正在读取 PPTX 文件' })
  const buffer = await fs.promises.readFile(args.filePath)
  args.onProgress?.({ stage: 'parsing', progress: 14, label: '正在解析 PPTX 结构' })
  const parsed = await parse(buffer, {
    imageMode: 'base64',
    videoMode: 'none',
    audioMode: 'none'
  })
  const slides = parsed.slides || []
  if (slides.length === 0) {
    throw new Error('PPTX 中没有可导入的幻灯片')
  }
  const rawMaxPages = typeof args.maxPages === 'number' ? Math.floor(args.maxPages) : null
  const maxPages = rawMaxPages && rawMaxPages > 0 ? rawMaxPages : null
  const effectiveSlides = maxPages && maxPages < slides.length
    ? selectSlidesEvenly(slides, maxPages)
    : slides.map((slide, originalIndex) => ({ slide, originalIndex }))
  const animationPlans = readPptxAnimationPlans(
    buffer,
    effectiveSlides.map(({ originalIndex }) => originalIndex),
    parsed.size
  )
  args.onProgress?.({
    stage: 'media',
    progress: 24,
    label: '正在整理图片和页面元素',
    totalPages: effectiveSlides.length
  })
  const registry: ImageRegistry = { index: 0, byKey: new Map() }
  const pages: ImportedPptxPage[] = []
  const allWarnings: ImportWarning[] = (parsed.diagnostics || []).map(warningFromParseIssue)
  const textValidator = new PptxTextValidator()
  try {
    for (let i = 0; i < effectiveSlides.length; i += 1) {
      const pageNumber = i + 1
      const pageId = `page-${pageNumber}`
      const selectedSlide = effectiveSlides[i]
      const pageTitle = titleFromSlide(selectedSlide.slide, pageNumber)
      args.onProgress?.({
        stage: 'pages',
        progress: 25 + Math.round((pageNumber / effectiveSlides.length) * 58),
        label: `正在导入并校验第 ${pageNumber} / ${effectiveSlides.length} 页`,
        pageNumber,
        totalPages: effectiveSlides.length
      })
      const htmlPath = path.join(args.projectDir, `${pageId}.html`)
      const rendered = await buildSlideHtml({
        slide: selectedSlide.slide,
        pageNumber,
        pageId,
        title: pageTitle,
        size: parsed.size,
        animationPlan: animationPlans[i],
        projectDir: args.projectDir,
        registry,
        textValidator,
        chartRewrite: args.chartRewrite
      })
      await fs.promises.writeFile(htmlPath, rendered.html, 'utf-8')
      pages.push({
        pageNumber,
        pageId,
        title: pageTitle,
        htmlPath,
        html: rendered.html,
        contentOutline: rendered.contentOutline
      })
      allWarnings.push(...rendered.warnings)
    }
  } finally {
    textValidator.close()
  }
  args.onProgress?.({ stage: 'index', progress: 90, label: '正在生成演示总览' })
  await fs.promises.writeFile(
    indexPath,
    buildProjectIndexHtml(
      title,
      pages.map(
        (page): DeckPageFile => ({
          pageNumber: page.pageNumber,
          pageId: page.pageId,
          title: page.title,
          htmlPath: path.basename(page.htmlPath)
        })
      ),
      PPTX_IMPORT_SLIDE_SIZE
    ),
    'utf-8'
  )
  return {
    title: title.slice(0, 120) || '导入的 PPTX',
    pageCount: pages.length,
    indexPath,
    pages,
    warnings: allWarnings.map((warning) =>
      warning.pageNumber ? `第 ${warning.pageNumber} 页：${warning.message}` : warning.message
    )
  }
}
