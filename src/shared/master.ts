export const MASTER_CSS_FILENAME = 'master.css'
export const MASTER_CSS_HREF = './master.css'
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
}

export type SessionMasterStatus = {
  css: string
  config: SessionMasterConfig
  exists: boolean
  revision: string
  linkedPageCount: number
  unlinkedPageCount: number
  missingPageCount: number
  totalPageCount: number
}

const DEFAULT_MASTER_GRADIENT: MasterGradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#c7d2fe', position: 0 },
    { color: '#4f46e5', position: 100 }
  ]
}

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
  bodyFontSize: null
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

export function buildDefaultMasterConfig(): SessionMasterConfig {
  return { ...DEFAULT_MASTER_CONFIG, backgroundGradient: createDefaultMasterGradient() }
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
    bodyFontSize: normalizeFontSize(
      record.bodyFontSize,
      MIN_MASTER_BODY_FONT_SIZE,
      MAX_MASTER_BODY_FONT_SIZE
    )
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
  return normalizeMasterConfig({
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
}
