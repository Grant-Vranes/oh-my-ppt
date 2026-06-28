import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  CHART_FRAME_HEIGHT_COMMENT_MARKER,
  CHART_FRAME_HEIGHT_MAX,
  CHART_FRAME_HEIGHT_MIN,
  extractChartHeightFromComment,
  normalizeChartHeight,
  parseChartHeightClass
} from '../../../src/main/tools/chart-height'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

describe('chart-height shared helper — pure functions', () => {
  it('parses Tailwind h-[Npx] classes and rejects non-height / zero classes', () => {
    expect(parseChartHeightClass('h-[400px]')).toBe(400)
    expect(parseChartHeightClass('h-[400.5px]')).toBe(400.5)
    // variant prefix must be stripped by the caller, not here
    expect(parseChartHeightClass('md:h-[400px]')).toBeNull()
    expect(parseChartHeightClass('h-full')).toBeNull()
    expect(parseChartHeightClass('flex-1')).toBeNull()
    expect(parseChartHeightClass('h-[0px]')).toBeNull()
    expect(parseChartHeightClass('relative')).toBeNull()
  })

  it('clamps heights into the valid chart-frame range', () => {
    expect(normalizeChartHeight(400)).toBe(400)
    expect(normalizeChartHeight('560')).toBe(560)
    expect(normalizeChartHeight(CHART_FRAME_HEIGHT_MIN)).toBe(CHART_FRAME_HEIGHT_MIN)
    expect(normalizeChartHeight(CHART_FRAME_HEIGHT_MAX)).toBe(CHART_FRAME_HEIGHT_MAX)
    expect(normalizeChartHeight(CHART_FRAME_HEIGHT_MIN - 1)).toBeNull()
    expect(normalizeChartHeight(CHART_FRAME_HEIGHT_MAX + 1)).toBeNull()
    expect(normalizeChartHeight('not-a-number')).toBeNull()
  })

  it('reads the intended height from a @ppt-chart-height marker comment', () => {
    expect(
      extractChartHeightFromComment(
        `height calc ${CHART_FRAME_HEIGHT_COMMENT_MARKER}=560: chart height = hero/main = 560`
      )
    ).toBe(560)
    // out-of-range marker values are dropped (cannot be trusted as a height)
    expect(extractChartHeightFromComment(`${CHART_FRAME_HEIGHT_COMMENT_MARKER}=1200`)).toBeNull()
    // natural-language "chart height = 560" without the marker is ignored
    expect(extractChartHeightFromComment('chart height = 560')).toBeNull()
  })
})

describe('chart-height helpers are shared, not duplicated', () => {
  const pageWriter = readSource('src/main/tools/page-writer.ts')
  const htmlUtils = readSource('src/main/tools/html-utils.ts')

  it('both tool modules import the shared helpers', () => {
    expect(pageWriter).toContain("from './chart-height'")
    expect(htmlUtils).toContain("from './chart-height'")
  })

  it('the duplicated local definitions were removed', () => {
    // The comment-marker parsing + clamping now live in chart-height.ts only;
    // page-writer keeps just a thin wrapper that turns the number into h-[Npx].
    expect(pageWriter).not.toContain('function normalizeChartFrameHeight')
    expect(pageWriter).not.toContain('function extractChartHeightClassFromComment')
    expect(htmlUtils).not.toContain('const normalizeChartFrameHeight')
    expect(htmlUtils).not.toContain('const extractChartHeightFromComment')
    expect(htmlUtils).not.toContain('CHART_HEIGHT_CLASS_RE')
  })

  it('the drifted h-[Npx] regexes are gone — both files use parseChartHeightClass', () => {
    // page-writer previously used a case-sensitive, 0px-excluding regex while
    // html-utils used a case-insensitive one; they had drifted. The 0px
    // negative-lookahead fragment is distinctive of the old page-writer regex.
    expect(pageWriter).not.toContain('(?!0+(?:')
    expect(pageWriter).toContain('parseChartHeightClass')
    expect(htmlUtils).toContain('parseChartHeightClass')
  })
})
