export const MASTER_DIRECTORY = 'master'
export const MASTER_CSS_FILENAME = 'master.css'
export const MASTER_HTML_FILENAME = 'master.html'
export const MASTER_CSS_RELATIVE_PATH = `${MASTER_DIRECTORY}/${MASTER_CSS_FILENAME}`
export const MASTER_HTML_RELATIVE_PATH = `${MASTER_DIRECTORY}/${MASTER_HTML_FILENAME}`
export const MASTER_CSS_HREF = `./${MASTER_CSS_RELATIVE_PATH}`
export const MASTER_HTML_HREF = `./${MASTER_HTML_RELATIVE_PATH}`
export const MASTER_LINK_SELECTOR = 'link[data-ppt-master="1"]'

export const MASTER_FONT_PRESETS = ['inherit', 'sans', 'serif', 'mono'] as const
export const MASTER_BACKGROUND_MODES = ['inherit', 'override'] as const
export const MASTER_BACKGROUND_STYLES = ['solid', 'gradient', 'image'] as const
export const MASTER_GRADIENT_TYPES = ['linear', 'radial'] as const
export const MIN_MASTER_GRADIENT_STOPS = 2
export const MAX_MASTER_GRADIENT_STOPS = 5
export const MIN_MASTER_BODY_FONT_SIZE = 8
export const MAX_MASTER_BODY_FONT_SIZE = 96
export const MIN_MASTER_TITLE_FONT_SIZE = 12
export const MAX_MASTER_TITLE_FONT_SIZE = 160

export type MasterFontPreset = (typeof MASTER_FONT_PRESETS)[number]
export type MasterBackgroundMode = (typeof MASTER_BACKGROUND_MODES)[number]
export type MasterBackgroundStyle = (typeof MASTER_BACKGROUND_STYLES)[number]
export type MasterGradientType = (typeof MASTER_GRADIENT_TYPES)[number]

export type MasterGradientStop = {
  color: string
  position: number
}

export type MasterGradient = {
  type: MasterGradientType
  angle: number
  stops: MasterGradientStop[]
}

export type MasterElementPosition = {
  x: number
  y: number
}

export type MasterElementSize = {
  width: number
  height: number
}

export type MasterElementsConfig = {
  logoImage: string | null
  footerText: string
  watermarkText: string
  showLogo: boolean
  showFooter: boolean
  showPageNumber: boolean
  showWatermark: boolean
  footerFontSize: number
  pageNumberFontSize: number
  footerColor: string
  pageNumberColor: string
  watermarkRotation: number
  watermarkSizeAuto: boolean
  logoPosition: MasterElementPosition
  footerPosition: MasterElementPosition
  pageNumberPosition: MasterElementPosition
  watermarkPosition: MasterElementPosition
  logoSize: MasterElementSize
  footerSize: MasterElementSize
  pageNumberSize: MasterElementSize
  watermarkSize: MasterElementSize
}

export type SessionMasterConfig = {
  backgroundColor: string
  backgroundMode: MasterBackgroundMode
  backgroundStyle: MasterBackgroundStyle
  backgroundGradient: MasterGradient
  backgroundImage: string | null
  titleFontPreset: MasterFontPreset
  bodyFontPreset: MasterFontPreset
  titleFontFamily: string | null
  bodyFontFamily: string | null
  titleFontSize: number | null
  bodyFontSize: number | null
  elements: MasterElementsConfig
}

export type SessionMasterStatus = {
  css: string
  html: string
  config: SessionMasterConfig
  exists: boolean
  revision: string
  linkedPageCount: number
  unlinkedPageCount: number
  missingPageCount: number
  totalPageCount: number
  disabledPageIds: string[]
}

const DEFAULT_MASTER_GRADIENT: MasterGradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#c7d2fe', position: 0 },
    { color: '#4f46e5', position: 100 }
  ]
}

const DEFAULT_MASTER_ELEMENTS: MasterElementsConfig = {
  logoImage: null,
  footerText: '',
  watermarkText: '',
  showLogo: false,
  showFooter: false,
  showPageNumber: false,
  showWatermark: false,
  footerFontSize: 16,
  pageNumberFontSize: 16,
  footerColor: '#334155',
  pageNumberColor: '#334155',
  watermarkRotation: -24,
  watermarkSizeAuto: true,
  logoPosition: { x: 5, y: 5 },
  footerPosition: { x: 5, y: 91 },
  pageNumberPosition: { x: 90, y: 91 },
  watermarkPosition: { x: 30, y: 42 },
  logoSize: { width: 16, height: 10 },
  footerSize: { width: 56, height: 5 },
  pageNumberSize: { width: 6, height: 5 },
  watermarkSize: { width: 40, height: 16 }
}

const MAX_MASTER_FOOTER_TEXT_LENGTH = 180
const MAX_MASTER_WATERMARK_TEXT_LENGTH = 80
const MIN_MASTER_ELEMENT_FONT_SIZE = 8
const MAX_MASTER_ELEMENT_FONT_SIZE = 160

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const cloneGradientStops = (stops: MasterGradientStop[]): MasterGradientStop[] =>
  stops.map((stop) => ({ ...stop }))

const normalizeGradientColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback
  const color = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : fallback
}

const isMasterGradientType = (value: unknown): value is MasterGradientType =>
  typeof value === 'string' && MASTER_GRADIENT_TYPES.includes(value as MasterGradientType)

const normalizeGradientAngle = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MASTER_GRADIENT.angle
  return ((Math.round(value) % 360) + 360) % 360
}

const normalizeGradientStops = (value: unknown): MasterGradientStop[] => {
  if (!Array.isArray(value) || value.length < MIN_MASTER_GRADIENT_STOPS) {
    return cloneGradientStops(DEFAULT_MASTER_GRADIENT.stops)
  }
  return value.slice(0, MAX_MASTER_GRADIENT_STOPS).map((item, index) => {
    const fallback =
      DEFAULT_MASTER_GRADIENT.stops[Math.min(index, DEFAULT_MASTER_GRADIENT.stops.length - 1)]
    const stop = isRecord(item) ? item : {}
    return {
      color: normalizeGradientColor(stop.color, fallback.color),
      position:
        typeof stop.position === 'number' && Number.isFinite(stop.position)
          ? Math.round(clamp(stop.position, 0, 100))
          : fallback.position
    }
  })
}

const interpolateGradientColors = (left: string, right: string, amount: number): string => {
  const ratio = clamp(amount, 0, 1)
  const channels = [1, 3, 5].map((start) =>
    Math.round(
      Number.parseInt(left.slice(start, start + 2), 16) * (1 - ratio) +
        Number.parseInt(right.slice(start, start + 2), 16) * ratio
    )
      .toString(16)
      .padStart(2, '0')
  )
  return `#${channels.join('')}`
}

export function createDefaultMasterGradient(): MasterGradient {
  return { ...DEFAULT_MASTER_GRADIENT, stops: cloneGradientStops(DEFAULT_MASTER_GRADIENT.stops) }
}

export function normalizeMasterGradient(value: unknown): MasterGradient {
  const input = isRecord(value) ? value : {}
  return {
    type: isMasterGradientType(input.type) ? input.type : DEFAULT_MASTER_GRADIENT.type,
    angle: normalizeGradientAngle(input.angle),
    stops: cloneGradientStops(normalizeGradientStops(input.stops)).sort(
      (left, right) => left.position - right.position
    )
  }
}

export function buildMasterGradientCss(value: unknown): string {
  const gradient = normalizeMasterGradient(value)
  const stops = gradient.stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ')
  return gradient.type === 'radial'
    ? `radial-gradient(circle at center, ${stops})`
    : `linear-gradient(${gradient.angle}deg, ${stops})`
}

export function addMasterGradientStop(value: unknown, preferredPosition?: number): MasterGradient {
  const gradient = normalizeMasterGradient(value)
  if (gradient.stops.length >= MAX_MASTER_GRADIENT_STOPS) return gradient
  const pairs = gradient.stops.slice(0, -1).map((stop, index) => ({
    left: stop,
    right: gradient.stops[index + 1],
    gap: gradient.stops[index + 1].position - stop.position
  }))
  const requestedPosition =
    typeof preferredPosition === 'number' && Number.isFinite(preferredPosition)
      ? Math.round(clamp(preferredPosition, 0, 100))
      : undefined
  const target =
    (requestedPosition === undefined
      ? undefined
      : pairs.find(
          (pair) =>
            requestedPosition >= pair.left.position && requestedPosition <= pair.right.position
        )) || pairs.reduce((largest, pair) => (pair.gap > largest.gap ? pair : largest), pairs[0])
  if (!target) return gradient
  const position =
    requestedPosition ?? Math.round((target.left.position + target.right.position) / 2)
  const ratio =
    target.gap === 0
      ? 0.5
      : (position - target.left.position) / (target.right.position - target.left.position)
  return normalizeMasterGradient({
    ...gradient,
    stops: [
      ...gradient.stops,
      {
        color: interpolateGradientColors(target.left.color, target.right.color, ratio),
        position
      }
    ]
  })
}

export function updateMasterGradientStop(
  value: unknown,
  index: number,
  patch: Partial<MasterGradientStop>
): MasterGradient {
  const gradient = normalizeMasterGradient(value)
  if (!Number.isInteger(index) || index < 0 || index >= gradient.stops.length) return gradient
  return normalizeMasterGradient({
    ...gradient,
    stops: gradient.stops.map((stop, currentIndex) =>
      currentIndex === index ? { ...stop, ...patch } : stop
    )
  })
}

export function removeMasterGradientStop(value: unknown, index: number): MasterGradient {
  const gradient = normalizeMasterGradient(value)
  if (
    gradient.stops.length <= MIN_MASTER_GRADIENT_STOPS ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= gradient.stops.length
  ) {
    return gradient
  }
  return normalizeMasterGradient({
    ...gradient,
    stops: gradient.stops.filter((_, currentIndex) => currentIndex !== index)
  })
}

export function parseMasterGradientCss(css: string): MasterGradient | null {
  if (typeof css !== 'string') return null
  const parseStops = (value: string): MasterGradientStop[] | null => {
    const stops = value.split(',').map((part) => {
      const match = part.trim().match(/^(#[0-9a-fA-F]{6})\s+(-?\d+(?:\.\d+)?)%$/)
      return match ? { color: match[1], position: Number(match[2]) } : null
    })
    return stops.some((stop) => stop === null) || stops.length < MIN_MASTER_GRADIENT_STOPS
      ? null
      : (stops as MasterGradientStop[])
  }
  const linear = css.trim().match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\)$/i)
  if (linear) {
    const stops = parseStops(linear[2])
    return stops
      ? normalizeMasterGradient({ type: 'linear', angle: Number(linear[1]), stops })
      : null
  }
  const radial = css.trim().match(/^radial-gradient\(\s*circle\s+at\s+center\s*,\s*(.+)\)$/i)
  if (!radial) return null
  const stops = parseStops(radial[1])
  return stops
    ? normalizeMasterGradient({ type: 'radial', angle: DEFAULT_MASTER_GRADIENT.angle, stops })
    : null
}

const DEFAULT_MASTER_CONFIG: SessionMasterConfig = {
  backgroundColor: '#ffffff',
  backgroundMode: 'inherit',
  backgroundStyle: 'solid',
  backgroundGradient: createDefaultMasterGradient(),
  backgroundImage: null,
  titleFontPreset: 'inherit',
  bodyFontPreset: 'inherit',
  titleFontFamily: null,
  bodyFontFamily: null,
  titleFontSize: null,
  bodyFontSize: null,
  elements: { ...DEFAULT_MASTER_ELEMENTS }
}

const FONT_STACKS: Record<Exclude<MasterFontPreset, 'inherit'>, string> = {
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
  serif: 'ui-serif, Georgia, "Noto Serif CJK SC", "Songti SC", SimSun, serif',
  mono: 'ui-monospace, "SFMono-Regular", "Cascadia Mono", "Microsoft YaHei UI", Consolas, monospace'
}

const normalizeColor = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_MASTER_CONFIG.backgroundColor
  const normalized = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_MASTER_CONFIG.backgroundColor
}

const normalizePreset = (value: unknown): MasterFontPreset =>
  typeof value === 'string' && MASTER_FONT_PRESETS.includes(value as MasterFontPreset)
    ? (value as MasterFontPreset)
    : 'inherit'

const normalizeFontFamily = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const family = value.replace(/\s+/g, ' ').trim()
  return family.length > 0 && family.length <= 120 ? family : null
}

const normalizeFontSize = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : null

const normalizeBackgroundMode = (value: unknown): MasterBackgroundMode =>
  typeof value === 'string' && MASTER_BACKGROUND_MODES.includes(value as MasterBackgroundMode)
    ? (value as MasterBackgroundMode)
    : 'inherit'

const normalizeBackgroundStyle = (value: unknown): MasterBackgroundStyle =>
  typeof value === 'string' && MASTER_BACKGROUND_STYLES.includes(value as MasterBackgroundStyle)
    ? (value as MasterBackgroundStyle)
    : 'solid'

const normalizeBackgroundImage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const imagePath = value.trim()
  const fileName = imagePath.slice('./images/'.length)
  return imagePath.startsWith('./images/') &&
    fileName.length > 0 &&
    fileName !== '.' &&
    fileName !== '..' &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    !fileName.includes('\0')
    ? imagePath
    : null
}

const normalizeMasterElementText = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

const cloneMasterElementPosition = (position: MasterElementPosition): MasterElementPosition => ({
  ...position
})

const cloneMasterElementSize = (size: MasterElementSize): MasterElementSize => ({ ...size })

const normalizeMasterElementPosition = (
  value: unknown,
  fallback: MasterElementPosition
): MasterElementPosition => {
  const record = isRecord(value) ? value : {}
  const normalizeCoordinate = (coordinate: unknown, fallbackCoordinate: number): number =>
    typeof coordinate === 'number' && Number.isFinite(coordinate)
      ? Math.round(clamp(coordinate, 0, 100) * 100) / 100
      : fallbackCoordinate
  return {
    x: normalizeCoordinate(record.x, fallback.x),
    y: normalizeCoordinate(record.y, fallback.y)
  }
}

const normalizeMasterElementSize = (value: unknown, fallback: MasterElementSize): MasterElementSize => {
  const record = isRecord(value) ? value : {}
  const normalizeDimension = (dimension: unknown, fallbackDimension: number): number =>
    typeof dimension === 'number' && Number.isFinite(dimension)
      ? Math.round(clamp(dimension, 1, 100) * 100) / 100
      : fallbackDimension
  return {
    width: normalizeDimension(record.width, fallback.width),
    height: normalizeDimension(record.height, fallback.height)
  }
}

const normalizeMasterElementFontSize = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(clamp(value, MIN_MASTER_ELEMENT_FONT_SIZE, MAX_MASTER_ELEMENT_FONT_SIZE))
    : fallback

const normalizeMasterElementRotation = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(clamp(value, -180, 180))
    : fallback

const normalizeLegacyMasterElementPosition = (
  value: unknown,
  fallback: MasterElementPosition,
  offset: MasterElementPosition
): MasterElementPosition => {
  const position = normalizeMasterElementPosition(value, fallback)
  return {
    x: Math.round(clamp(position.x - offset.x, 0, 100) * 100) / 100,
    y: Math.round(clamp(position.y - offset.y, 0, 100) * 100) / 100
  }
}

const keepMasterElementInsideCanvas = (
  position: MasterElementPosition,
  size: MasterElementSize
): MasterElementPosition => ({
  x: clamp(position.x, 0, 100 - size.width),
  y: clamp(position.y, 0, 100 - size.height)
})

export function buildDefaultMasterElementsConfig(): MasterElementsConfig {
  return {
    ...DEFAULT_MASTER_ELEMENTS,
    logoPosition: cloneMasterElementPosition(DEFAULT_MASTER_ELEMENTS.logoPosition),
    footerPosition: cloneMasterElementPosition(DEFAULT_MASTER_ELEMENTS.footerPosition),
    pageNumberPosition: cloneMasterElementPosition(DEFAULT_MASTER_ELEMENTS.pageNumberPosition),
    watermarkPosition: cloneMasterElementPosition(DEFAULT_MASTER_ELEMENTS.watermarkPosition),
    logoSize: cloneMasterElementSize(DEFAULT_MASTER_ELEMENTS.logoSize),
    footerSize: cloneMasterElementSize(DEFAULT_MASTER_ELEMENTS.footerSize),
    pageNumberSize: cloneMasterElementSize(DEFAULT_MASTER_ELEMENTS.pageNumberSize),
    watermarkSize: cloneMasterElementSize(DEFAULT_MASTER_ELEMENTS.watermarkSize)
  }
}

export function normalizeMasterElementsConfig(value: unknown): MasterElementsConfig {
  const record = isRecord(value) ? value : {}
  const logoImage = normalizeBackgroundImage(record.logoImage)
  const footerText = normalizeMasterElementText(record.footerText, MAX_MASTER_FOOTER_TEXT_LENGTH)
  const watermarkText = normalizeMasterElementText(
    record.watermarkText,
    MAX_MASTER_WATERMARK_TEXT_LENGTH
  )
  const hasLogoSize = isRecord(record.logoSize)
  const hasFooterSize = isRecord(record.footerSize)
  const hasPageNumberSize = isRecord(record.pageNumberSize)
  const hasWatermarkSize = isRecord(record.watermarkSize)
  const logoSize = normalizeMasterElementSize(record.logoSize, DEFAULT_MASTER_ELEMENTS.logoSize)
  const footerSize = normalizeMasterElementSize(record.footerSize, DEFAULT_MASTER_ELEMENTS.footerSize)
  const pageNumberSize = normalizeMasterElementSize(
    record.pageNumberSize,
    DEFAULT_MASTER_ELEMENTS.pageNumberSize
  )
  const watermarkSize = normalizeMasterElementSize(
    record.watermarkSize,
    DEFAULT_MASTER_ELEMENTS.watermarkSize
  )
  const logoPosition = hasLogoSize
    ? normalizeMasterElementPosition(record.logoPosition, DEFAULT_MASTER_ELEMENTS.logoPosition)
    : normalizeLegacyMasterElementPosition(record.logoPosition, { x: 5, y: 5 }, { x: 0, y: 0 })
  const footerPosition = hasFooterSize
    ? normalizeMasterElementPosition(record.footerPosition, DEFAULT_MASTER_ELEMENTS.footerPosition)
    : normalizeLegacyMasterElementPosition(
        record.footerPosition,
        { x: 5, y: 96 },
        { x: 0, y: DEFAULT_MASTER_ELEMENTS.footerSize.height }
      )
  const pageNumberPosition = hasPageNumberSize
    ? normalizeMasterElementPosition(record.pageNumberPosition, DEFAULT_MASTER_ELEMENTS.pageNumberPosition)
    : normalizeLegacyMasterElementPosition(
        record.pageNumberPosition,
        { x: 96, y: 96 },
        {
          x: DEFAULT_MASTER_ELEMENTS.pageNumberSize.width,
          y: DEFAULT_MASTER_ELEMENTS.pageNumberSize.height
        }
      )
  const watermarkPosition = hasWatermarkSize
    ? normalizeMasterElementPosition(record.watermarkPosition, DEFAULT_MASTER_ELEMENTS.watermarkPosition)
    : normalizeLegacyMasterElementPosition(
        record.watermarkPosition,
        { x: 50, y: 50 },
        {
          x: DEFAULT_MASTER_ELEMENTS.watermarkSize.width / 2,
          y: DEFAULT_MASTER_ELEMENTS.watermarkSize.height / 2
        }
      )
  return {
    logoImage,
    footerText,
    watermarkText,
    showLogo: typeof record.showLogo === 'boolean' ? record.showLogo : Boolean(logoImage),
    showFooter: typeof record.showFooter === 'boolean' ? record.showFooter : Boolean(footerText),
    showPageNumber: record.showPageNumber === true,
    showWatermark:
      typeof record.showWatermark === 'boolean' ? record.showWatermark : Boolean(watermarkText),
    footerFontSize: normalizeMasterElementFontSize(
      record.footerFontSize,
      DEFAULT_MASTER_ELEMENTS.footerFontSize
    ),
    pageNumberFontSize: normalizeMasterElementFontSize(
      record.pageNumberFontSize,
      DEFAULT_MASTER_ELEMENTS.pageNumberFontSize
    ),
    footerColor: normalizeGradientColor(record.footerColor, DEFAULT_MASTER_ELEMENTS.footerColor),
    pageNumberColor: normalizeGradientColor(
      record.pageNumberColor,
      DEFAULT_MASTER_ELEMENTS.pageNumberColor
    ),
    watermarkRotation: normalizeMasterElementRotation(
      record.watermarkRotation,
      DEFAULT_MASTER_ELEMENTS.watermarkRotation
    ),
    watermarkSizeAuto: record.watermarkSizeAuto !== false,
    logoPosition: keepMasterElementInsideCanvas(logoPosition, logoSize),
    footerPosition: keepMasterElementInsideCanvas(footerPosition, footerSize),
    pageNumberPosition: keepMasterElementInsideCanvas(pageNumberPosition, pageNumberSize),
    watermarkPosition: keepMasterElementInsideCanvas(watermarkPosition, watermarkSize),
    logoSize,
    footerSize,
    pageNumberSize,
    watermarkSize
  }
}

export function buildDefaultMasterConfig(): SessionMasterConfig {
  return {
    ...DEFAULT_MASTER_CONFIG,
    backgroundGradient: createDefaultMasterGradient(),
    elements: buildDefaultMasterElementsConfig()
  }
}

export function normalizeMasterConfig(value: unknown): SessionMasterConfig {
  const record = isRecord(value) ? value : {}
  const backgroundImage = normalizeBackgroundImage(record.backgroundImage)
  const backgroundStyle = normalizeBackgroundStyle(record.backgroundStyle)
  return {
    backgroundColor: normalizeColor(record.backgroundColor),
    backgroundMode: normalizeBackgroundMode(record.backgroundMode),
    backgroundStyle: backgroundStyle === 'image' && !backgroundImage ? 'solid' : backgroundStyle,
    backgroundGradient: normalizeMasterGradient(record.backgroundGradient),
    backgroundImage,
    titleFontPreset: normalizePreset(record.titleFontPreset),
    bodyFontPreset: normalizePreset(record.bodyFontPreset),
    titleFontFamily: normalizeFontFamily(record.titleFontFamily),
    bodyFontFamily: normalizeFontFamily(record.bodyFontFamily),
    titleFontSize: normalizeFontSize(
      record.titleFontSize,
      MIN_MASTER_TITLE_FONT_SIZE,
      MAX_MASTER_TITLE_FONT_SIZE
    ),
    bodyFontSize: normalizeFontSize(record.bodyFontSize, MIN_MASTER_BODY_FONT_SIZE, MAX_MASTER_BODY_FONT_SIZE),
    elements: normalizeMasterElementsConfig(record.elements)
  }
}

const normalizeFontStack = (value: string): string => value.replace(/\s+/g, ' ').trim()

const presetFromStack = (value: string | undefined): MasterFontPreset => {
  if (!value) return 'inherit'
  const normalized = normalizeFontStack(value)
  return (
    (Object.entries(FONT_STACKS).find(
      ([, stack]) => normalizeFontStack(stack) === normalized
    )?.[0] as MasterFontPreset | undefined) || 'inherit'
  )
}

const readCssVariable = (css: string, name: string): string | undefined => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escapedName}\\s*:\\s*([^;}]+)`, 'i'))
  return match?.[1]?.trim()
}

const escapeCssString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const fontFamilyFromCssValue = (value: string | undefined): string | null => {
  if (!value) return null
  const match = value.trim().match(/^"((?:\\.|[^"\\])*)"$/)
  if (!match) return null
  return normalizeFontFamily(match[1].replace(/\\(.)/g, '$1'))
}

const fontSizeFromCssValue = (
  value: string | undefined,
  min: number,
  max: number
): number | null => {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)px$/i)
  return normalizeFontSize(match ? Number(match[1]) : null, min, max)
}

const backgroundImageFromCssValue = (value: string | undefined): string | null => {
  const match = value?.trim().match(/^url\(\s*"((?:\\.|[^"\\])*)"\s*\)$/i)
  return normalizeBackgroundImage(match?.[1]?.replace(/\\(.)/g, '$1'))
}

const isValidColor = (value: string | undefined): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())

const MASTER_PAGE_BACKGROUND_SELECTORS = [
  '.ppt-page-content > [data-page-scaffold="1"] > [data-role="content"]',
  '.ppt-page-content > [data-page-scaffold="1"] > [data-role="content"] > :first-child',
  '.ppt-page-content > [data-page-scaffold="1"] > :first-child'
].join(',\n')

const MASTER_TITLE_TEXT_SELECTORS = [
  '.ppt-page-content h1',
  '.ppt-page-content h2',
  '.ppt-page-content h3',
  '.ppt-page-content h4',
  '.ppt-page-content h5',
  '.ppt-page-content h6',
  '.ppt-page-content [data-role="title"]',
  '.ppt-page-content [data-block-id="title"]'
].join(',\n')

const MASTER_BODY_TEXT_SELECTORS = [
  '.ppt-page-content p',
  '.ppt-page-content li',
  '.ppt-page-content [data-role="body"]',
  '.ppt-page-content [data-block-id="body"]'
].join(',\n')

export function getMasterFontFamilies(value: unknown): string[] {
  const config = normalizeMasterConfig(value)
  return Array.from(
    new Set(
      [config.titleFontFamily, config.bodyFontFamily].filter((family): family is string =>
        Boolean(family)
      )
    )
  )
}

export function buildMasterCss(value: unknown, fontFaceCss = ''): string {
  const config = normalizeMasterConfig(value)
  const backgroundImage = config.backgroundImage
    ? `url("${escapeCssString(config.backgroundImage)}")`
    : null
  const background =
    config.backgroundStyle === 'gradient'
      ? buildMasterGradientCss(config.backgroundGradient)
      : config.backgroundStyle === 'image' && backgroundImage
        ? `${backgroundImage} center center / cover no-repeat`
        : config.backgroundColor
  const variables = [
    `  --ppt-page-bg: ${
      config.backgroundMode === 'override' ? background : DEFAULT_MASTER_CONFIG.backgroundColor
    };`
  ]
  if (config.backgroundMode === 'override') {
    variables.push(`  --ppt-master-background-color: ${config.backgroundColor};`)
    variables.push(`  --ppt-master-background-style: ${config.backgroundStyle};`)
    if (config.backgroundStyle === 'image' && backgroundImage) {
      variables.push(`  --ppt-master-background-image: ${backgroundImage};`)
    }
    variables.push(`  --ppt-master-slide-background: ${background};`)
  }
  const titleFont = config.titleFontFamily
    ? `"${escapeCssString(config.titleFontFamily)}"`
    : config.titleFontPreset !== 'inherit'
      ? FONT_STACKS[config.titleFontPreset]
      : null
  const bodyFont = config.bodyFontFamily
    ? `"${escapeCssString(config.bodyFontFamily)}"`
    : config.bodyFontPreset !== 'inherit'
      ? FONT_STACKS[config.bodyFontPreset]
      : null
  if (titleFont) {
    const fontStack = titleFont
    variables.push(`  --ppt-master-title-font: ${fontStack};`)
    variables.push(`  --ppt-title-font: ${fontStack};`)
  }
  if (bodyFont) {
    const fontStack = bodyFont
    variables.push(`  --ppt-master-body-font: ${fontStack};`)
    variables.push(`  --ppt-body-font: ${fontStack};`)
  }
  if (config.titleFontSize !== null) {
    variables.push(`  --ppt-master-title-font-size: ${config.titleFontSize}px;`)
  }
  if (config.bodyFontSize !== null) {
    variables.push(`  --ppt-master-body-font-size: ${config.bodyFontSize}px;`)
  }
  const backgroundRule =
    config.backgroundMode === 'override'
      ? `\n${MASTER_PAGE_BACKGROUND_SELECTORS} {\n  background: var(--ppt-master-slide-background) !important;\n}\n`
      : ''
  const titleFontRule = titleFont
    ? `\n${MASTER_TITLE_TEXT_SELECTORS} {\n  font-family: var(--ppt-master-title-font) !important;\n}\n`
    : ''
  const bodyFontRule = bodyFont
    ? `\n${MASTER_BODY_TEXT_SELECTORS} {\n  font-family: var(--ppt-master-body-font) !important;\n}\n`
    : ''
  const titleFontSizeRule =
    config.titleFontSize !== null
      ? `\n${MASTER_TITLE_TEXT_SELECTORS} {\n  font-size: var(--ppt-master-title-font-size) !important;\n}\n`
      : ''
  const bodyFontSizeRule =
    config.bodyFontSize !== null
      ? `\n${MASTER_BODY_TEXT_SELECTORS} {\n  font-size: var(--ppt-master-body-font-size) !important;\n}\n`
      : ''
  const fontFaces = fontFaceCss.trim()
  return `/* OhMyPPT Slide Master. Managed by the application. */\n${fontFaces ? `${fontFaces}\n` : ''}:root {\n${variables.join(
    '\n'
  )}\n}\n${backgroundRule}${bodyFontRule}${titleFontRule}${bodyFontSizeRule}${titleFontSizeRule}`
}

export function parseMasterCss(css: string): SessionMasterConfig {
  if (typeof css !== 'string' || !/:root\s*\{/i.test(css)) return buildDefaultMasterConfig()
  const masterSlideBackground = readCssVariable(css, '--ppt-master-slide-background')
  const masterBackgroundColor = readCssVariable(css, '--ppt-master-background-color')
  const masterBackgroundImage = backgroundImageFromCssValue(
    readCssVariable(css, '--ppt-master-background-image')
  )
  const pageBackground = readCssVariable(css, '--ppt-page-bg')
  const parsedGradient = parseMasterGradientCss(masterSlideBackground || '')
  const hasMasterSlideBackground = isValidColor(masterSlideBackground)
  const hasMasterBackgroundColor = isValidColor(masterBackgroundColor)
  const hasLegacyOverride =
    isValidColor(pageBackground) &&
    normalizeColor(pageBackground) !== DEFAULT_MASTER_CONFIG.backgroundColor
  const parsed = normalizeMasterConfig({
    backgroundColor: hasMasterBackgroundColor
      ? masterBackgroundColor
      : parsedGradient
        ? parsedGradient.stops[0]?.color
        : hasMasterSlideBackground
          ? masterSlideBackground
          : pageBackground,
    backgroundMode:
      hasMasterBackgroundColor ||
      hasMasterSlideBackground ||
      Boolean(parsedGradient) ||
      hasLegacyOverride
        ? 'override'
        : 'inherit',
    backgroundStyle: masterBackgroundImage ? 'image' : parsedGradient ? 'gradient' : 'solid',
    backgroundGradient: parsedGradient || createDefaultMasterGradient(),
    backgroundImage: masterBackgroundImage,
    titleFontPreset: presetFromStack(readCssVariable(css, '--ppt-master-title-font')),
    bodyFontPreset: presetFromStack(readCssVariable(css, '--ppt-master-body-font')),
    titleFontFamily: fontFamilyFromCssValue(readCssVariable(css, '--ppt-master-title-font')),
    bodyFontFamily: fontFamilyFromCssValue(readCssVariable(css, '--ppt-master-body-font')),
    titleFontSize: fontSizeFromCssValue(
      readCssVariable(css, '--ppt-master-title-font-size'),
      MIN_MASTER_TITLE_FONT_SIZE,
      MAX_MASTER_TITLE_FONT_SIZE
    ),
    bodyFontSize: fontSizeFromCssValue(
      readCssVariable(css, '--ppt-master-body-font-size'),
      MIN_MASTER_BODY_FONT_SIZE,
      MAX_MASTER_BODY_FONT_SIZE
    )
  })
  return { ...parsed, elements: buildDefaultMasterElementsConfig() }
}

const escapeMasterHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeMasterJson = (value: string): string =>
  value.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

/**
 * The runtime clones this inert template into the guarded page root. Keep all
 * user-controlled fields as text or validated session image paths; it is not
 * an arbitrary HTML authoring surface.
 */
export function buildMasterElementsHtml(value: unknown): string {
  const config = normalizeMasterElementsConfig(value)
  const json = escapeMasterJson(JSON.stringify(config))
  const elementStyle = (position: MasterElementPosition, size: MasterElementSize): string =>
    `left:${position.x}%;top:${position.y}%;width:${size.width}%;height:${size.height}%;`
  const logo = config.showLogo && config.logoImage
    ? `<img data-ppt-master-logo-image="1" src="${escapeMasterHtml(config.logoImage)}" alt="" style="${elementStyle(config.logoPosition, config.logoSize)}" />`
    : ''
  const footer = config.showFooter && config.footerText
    ? `<div data-ppt-master-footer="1" style="left:${config.footerPosition.x}%;top:${config.footerPosition.y}%;width:${config.footerSize.width}%;font-size:${config.footerFontSize}px;color:${config.footerColor};">${escapeMasterHtml(config.footerText)}</div>`
    : ''
  const watermark = config.showWatermark && config.watermarkText
    ? `<div data-ppt-master-watermark="1" data-ppt-master-watermark-height="${config.watermarkSize.height}" style="${elementStyle(config.watermarkPosition, config.watermarkSize)}transform:rotate(${config.watermarkRotation}deg);">${escapeMasterHtml(config.watermarkText)}</div>`
    : ''
  const pageNumber = config.showPageNumber
    ? `<div data-ppt-master-page-number="1" aria-hidden="true" style="left:${config.pageNumberPosition.x}%;top:${config.pageNumberPosition.y}%;width:${config.pageNumberSize.width}%;font-size:${config.pageNumberFontSize}px;color:${config.pageNumberColor};"></div>`
    : ''
  const layer = `<div data-ppt-master-elements-layer="1" aria-hidden="true">
  <style data-ppt-master-elements-style="1">
    [data-ppt-master-elements-layer="1"] { position:absolute !important; inset:0 !important; z-index:2147483647 !important; display:block !important; pointer-events:none !important; color:inherit; font-family:inherit; }
    [data-ppt-master-logo-image="1"] { position:absolute; display:block; object-fit:contain; object-position:left top; }
    [data-ppt-master-footer="1"] { position:absolute; display:block; overflow:hidden; line-height:1.25; white-space:nowrap; text-overflow:ellipsis; }
    [data-ppt-master-page-number="1"] { position:absolute; display:block; overflow:hidden; line-height:1.25; text-align:right; font-variant-numeric:tabular-nums; }
    [data-ppt-master-watermark="1"] { position:absolute; display:flex; align-items:center; justify-content:center; overflow:hidden; color:rgba(15,23,42,.1); font-weight:700; line-height:1; white-space:nowrap; text-overflow:ellipsis; text-align:center; transform-origin:center; }
  </style>
  ${logo}
  ${footer}
  ${pageNumber}
  ${watermark}
</div>`
  return `<!-- OhMyPPT Slide Master elements. Managed by the application. -->
<script type="application/json" data-ppt-master-elements-config="1">${json}</script>
<template data-ppt-master-elements="1">
${layer}
</template>
`
}

export function parseMasterElementsHtml(html: string): MasterElementsConfig {
  if (typeof html !== 'string') return buildDefaultMasterElementsConfig()
  const match = html.match(
    /<script\b[^>]*\bdata-ppt-master-elements-config=(?:"1"|'1')[^>]*>([\s\S]*?)<\/script>/i
  )
  if (!match?.[1]) return buildDefaultMasterElementsConfig()
  try {
    return normalizeMasterElementsConfig(JSON.parse(match[1]))
  } catch {
    return buildDefaultMasterElementsConfig()
  }
}
