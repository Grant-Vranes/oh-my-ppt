export type SlideSizePresetId =
  | 'wide-16-9'
  | 'vertical-9-16'
  | 'standard-4-3'
  | 'square-1-1'
  | 'vertical-3-4'
  | 'xiaohongshu-note'

export interface SlideSizePreset {
  id: SlideSizePresetId
  label: string
  width: number
  height: number
}

export const DEFAULT_SLIDE_SIZE_ID: SlideSizePresetId = 'wide-16-9'

export const SLIDE_SIZE_PRESETS: readonly SlideSizePreset[] = [
  { id: 'wide-16-9', label: '宽屏 16:9', width: 1600, height: 900 },
  { id: 'vertical-9-16', label: '竖屏 9:16', width: 900, height: 1600 },
  { id: 'standard-4-3', label: '标准 4:3', width: 1600, height: 1200 },
  { id: 'square-1-1', label: '方图 1:1', width: 1200, height: 1200 },
  { id: 'vertical-3-4', label: '竖版 3:4', width: 1200, height: 1600 },
  { id: 'xiaohongshu-note', label: '小红书', width: 1242, height: 1660 }
] as const

const PRESET_BY_ID = new Map(SLIDE_SIZE_PRESETS.map((preset) => [preset.id, preset]))

const toPositiveInteger = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
}

const isSlideSizePresetId = (value: unknown): value is SlideSizePresetId =>
  typeof value === 'string' && PRESET_BY_ID.has(value as SlideSizePresetId)

export function resolveSlideSize(input?: {
  id?: unknown
  width?: unknown
  height?: unknown
}): SlideSizePreset {
  const id = isSlideSizePresetId(input?.id) ? input.id : DEFAULT_SLIDE_SIZE_ID
  const preset = PRESET_BY_ID.get(id) ?? PRESET_BY_ID.get(DEFAULT_SLIDE_SIZE_ID)!
  const width = toPositiveInteger(input?.width)
  const height = toPositiveInteger(input?.height)

  return {
    ...preset,
    width: width ?? preset.width,
    height: height ?? preset.height
  }
}

export function requireSlideSize(input: {
  id?: unknown
  width?: unknown
  height?: unknown
}): SlideSizePreset {
  if (!isSlideSizePresetId(input.id)) {
    throw new Error(`Invalid slide size id: ${String(input.id ?? '')}`)
  }
  const preset = PRESET_BY_ID.get(input.id)!
  const width = input.width === undefined || input.width === null ? preset.width : toPositiveInteger(input.width)
  const height =
    input.height === undefined || input.height === null ? preset.height : toPositiveInteger(input.height)
  if (!width || !height) {
    throw new Error(`Invalid slide size dimensions for ${input.id}`)
  }
  return { ...preset, width, height }
}

export const requireSlideSizePreset = (id: unknown): SlideSizePreset => requireSlideSize({ id })

export function requirePersistedSlideSize(input: {
  id?: unknown
  width?: unknown
  height?: unknown
}): SlideSizePreset {
  if (!isSlideSizePresetId(input.id)) {
    throw new Error(`Invalid slide size id: ${String(input.id ?? '')}`)
  }
  if (input.width === undefined || input.width === null || input.height === undefined || input.height === null) {
    throw new Error(`Invalid slide size dimensions for ${String(input.id ?? '')}`)
  }
  return requireSlideSize(input)
}

export function resolveSessionSlideSize(session?: unknown): SlideSizePreset {
  return requireSessionSlideSize(session)
}

export function trySessionSlideSize(session?: unknown): SlideSizePreset | null {
  if (!session) return null
  try {
    return requireSessionSlideSize(session)
  } catch {
    return null
  }
}

export function requireSessionSlideSize(session: unknown): SlideSizePreset {
  const record =
    session && typeof session === 'object' && !Array.isArray(session)
      ? (session as Record<string, unknown>)
      : {}
  return requirePersistedSlideSize({
    id: record.slideSizeId ?? record.slide_size_id,
    width: record.slideWidth ?? record.slide_width,
    height: record.slideHeight ?? record.slide_height
  })
}

export function resolveSlideSizeFromHtml(html: string): SlideSizePreset {
  return requireSlideSizeFromHtml(html)
}

export function requireSlideSizeFromHtml(html: string): SlideSizePreset {
  const metadataMatch = html.match(
    /<script[^>]+id=["']deck-metadata["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (metadataMatch?.[1]) {
    const metadata = JSON.parse(metadataMatch[1]) as Record<string, unknown>
    return requirePersistedSlideSize({
      id: metadata.slideSizeId,
      width: metadata.width,
      height: metadata.height
    })
  }
  return requirePersistedSlideSize({
    id: html.match(/\bdata-ppt-slide-size-id=["']([^"']+)["']/i)?.[1],
    width: html.match(/\bdata-ppt-width=["'](\d+)["']/i)?.[1],
    height: html.match(/\bdata-ppt-height=["'](\d+)["']/i)?.[1]
  })
}

export const isDefaultSlideSize = (slideSize: SlideSizePreset): boolean =>
  slideSize.id === DEFAULT_SLIDE_SIZE_ID &&
  slideSize.width === 1600 &&
  slideSize.height === 900

export const PPTX_SLIDE_SIZE_ERROR =
  '当前 PPTX 导出仅支持 16:9。请使用 16:9 演示，或导出 PNG/PDF/视频。'

export function assertPptxExportSupported(slideSize: SlideSizePreset): void {
  if (!isDefaultSlideSize(slideSize)) throw new Error(PPTX_SLIDE_SIZE_ERROR)
}
