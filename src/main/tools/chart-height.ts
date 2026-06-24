import type * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

/**
 * Shared chart-frame height helpers.
 *
 * Two consumers cooperate on chart frame heights:
 * - page-writer preprocesses the model's HTML and, when a chart frame has no
 *   explicit height, reads the model's intended height from an adjacent
 *   `@ppt-chart-height=N` comment marker.
 * - html-utils validates that, when the marker is present, the frame's actual
 *   `h-[Npx]` class matches it (catches "comment says 420, class says 240").
 *
 * Both need the same comment-marker parsing + sibling walk, so it lives here
 * once. Heights are returned as normalized numbers; page-writer wraps the
 * number into an `h-[Npx]` class string.
 */

export const CHART_FRAME_HEIGHT_MIN = 120
export const CHART_FRAME_HEIGHT_MAX = 760
export const CHART_FRAME_HEIGHT_COMMENT_MARKER = '@ppt-chart-height'

export type CheerioSiblingNode = {
  type?: string
  data?: string
  prev?: CheerioSiblingNode
}

const CHART_HEIGHT_COMMENT_RE = /<!--([\s\S]*?@ppt-chart-height[\s\S]*?)-->/gi

const scanPreviousSiblingHeightMarker = (
  element: cheerio.Cheerio<AnyNode>
): number | null => {
  let previous = (element.get(0) as CheerioSiblingNode | undefined)?.prev
  let scanned = 0
  while (previous && scanned < 8) {
    scanned += 1
    if (previous.type === 'comment') {
      const height = extractChartHeightFromComment(previous.data || '')
      if (height) return height
    }
    if (previous.type !== 'text' || (previous.data || '').trim().length > 0) break
    previous = previous.prev
  }
  return null
}

const resolveOnlyPageMarkerForSingleChart = (
  parent: cheerio.Cheerio<AnyNode>
): number | null => {
  let root = parent
  let guard = 0
  while (root.parent().length && guard < 12) {
    guard += 1
    root = root.parent()
  }

  if (root.find('canvas').length !== 1) return null

  const matches = [...(root.html() || '').matchAll(CHART_HEIGHT_COMMENT_RE)]
  if (matches.length !== 1) return null

  return extractChartHeightFromComment(matches[0]?.[1] || '')
}

/**
 * Parse a single Tailwind arbitrary-height utility (e.g. `h-[400px]`) into its
 * pixel value. Returns null for anything that is not a positive `h-[Npx]`
 * class — variant prefixes must be stripped by the caller. Case-insensitive.
 */
export const parseChartHeightClass = (cls: string): number | null => {
  const match = /^h-\[\s*(\d+(?:\.\d+)?)px\s*\]$/i.exec(cls)
  if (!match) return null
  const value = Number(match[1])
  return value > 0 ? value : null
}

/**
 * Clamp a raw pixel value into the valid chart-frame range. Returns null when
 * the value is missing, non-numeric, or outside [MIN, MAX].
 */
export const normalizeChartHeight = (value: number | string): number | null => {
  const height = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(height)) return null
  if (height < CHART_FRAME_HEIGHT_MIN || height > CHART_FRAME_HEIGHT_MAX) return null
  return Math.round(height)
}

/**
 * Read the intended chart height from a `@ppt-chart-height=N` marker embedded
 * in an HTML comment. Returns the clamped value, or null if absent/invalid.
 */
export const extractChartHeightFromComment = (comment: string): number | null => {
  const escapedMarker = CHART_FRAME_HEIGHT_COMMENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const markerPattern = new RegExp(`${escapedMarker}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*(?:px)?\\b`, 'i')
  const match = markerPattern.exec(comment)
  if (!match?.[1]) return null
  return normalizeChartHeight(match[1])
}

/**
 * Walk the previous siblings of a chart frame looking for an adjacent HTML
 * comment carrying the `@ppt-chart-height` marker.
 *
 * Match order:
 * 1. direct previous siblings of the chart frame;
 * 2. previous siblings of nearby one-chart ancestors (common when the model
 *    comments the whole "chart area");
 * 3. whole-page fallback only when the page has exactly one chart and one marker.
 *
 * Scanning stops after 8 siblings or at the first non-whitespace node, so
 * unrelated comments elsewhere are ignored for multi-chart pages.
 */
export const resolveChartHeightFromNearbyComment = (
  parent: cheerio.Cheerio<AnyNode>
): number | null => {
  const direct = scanPreviousSiblingHeightMarker(parent)
  if (direct) return direct

  let ancestor = parent.parent()
  let depth = 0
  while (ancestor.length && depth < 3) {
    depth += 1
    if (ancestor.find('canvas').length === 1) {
      const height = scanPreviousSiblingHeightMarker(ancestor)
      if (height) return height
    }
    ancestor = ancestor.parent()
  }

  return resolveOnlyPageMarkerForSingleChart(parent)
}
