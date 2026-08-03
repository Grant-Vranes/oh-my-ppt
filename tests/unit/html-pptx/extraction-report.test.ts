import { describe, expect, it } from 'vitest'
import { buildExtractionReportWarning } from '../../../src/main/io/html-pptx/extraction-report'

describe('PPTX extraction report warning', () => {
  it('reports editable-export fallbacks without claiming that content was dropped', () => {
    expect(
      buildExtractionReportWarning('page-1', {
        textLimitReached: true,
        shapeLimitReached: false,
        imageLimitReached: true,
        unsupportedTransformCount: 2,
        imageRasterFallbackCount: 1
      })
    ).toBe(
      '页面 page-1：可编辑文本达到上限，剩余文本已保留在背景图；可编辑图片达到上限，剩余图片已保留在背景图；2 个复杂变换元素已保留在背景图；1 个图片或图表无法安全转换，已保留在背景图'
    )
  })

  it('omits the warning when extraction has no fallback report', () => {
    expect(buildExtractionReportWarning('page-1', undefined)).toBeUndefined()
  })
})
