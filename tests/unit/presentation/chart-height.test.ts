import { describe, expect, it } from 'vitest'
import {
  extractChartHeightFromComment,
  normalizeChartHeight,
  parseChartHeightClass
} from '../../../src/main/presentation/html/chart-height'

describe('presentation chart-height helpers', () => {
  it('keeps chart marker parsing and bounds in the presentation domain', () => {
    expect(extractChartHeightFromComment('layout @ppt-chart-height=420')).toBe(420)
    expect(parseChartHeightClass('h-[420px]')).toBe(420)
    expect(normalizeChartHeight(761)).toBeNull()
  })
})
