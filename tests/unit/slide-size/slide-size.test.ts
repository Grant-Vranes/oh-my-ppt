import { describe, expect, it } from 'vitest'
import {
  assertPptxExportSupported,
  requireSessionSlideSize,
  requireSlideSize,
  requireSlideSizeFromHtml,
  resolveSessionSlideSize,
  resolveSlideSize,
  resolveSlideSizeFromHtml,
  trySessionSlideSize
} from '../../../src/shared/slide-size'

describe('slide size presets', () => {
  it('keeps explicit new-session default only in the base resolver', () => {
    expect(resolveSlideSize()).toMatchObject({
      id: 'wide-16-9',
      width: 1600,
      height: 900
    })
    expect(() => resolveSessionSlideSize({ slide_size_id: 'invalid' })).toThrow(
      'Invalid slide size id'
    )
    expect(trySessionSlideSize({ slide_size_id: 'invalid' })).toBeNull()
  })

  it('strict resolver rejects missing or invalid slide sizes', () => {
    expect(() => requireSlideSize({})).toThrow('Invalid slide size id')
    expect(() => requireSlideSize({ id: 'invalid' })).toThrow('Invalid slide size id')
    expect(() => requireSlideSize({ id: 'vertical-9-16', width: -1 })).toThrow(
      'Invalid slide size dimensions'
    )
    expect(() => requireSessionSlideSize({ slide_size_id: 'vertical-9-16' })).toThrow(
      'Invalid slide size dimensions'
    )
    expect(() => requireSessionSlideSize({ slide_size_id: 'invalid' })).toThrow(
      'Invalid slide size id'
    )
    expect(() => requireSlideSizeFromHtml('<html></html>')).toThrow('Invalid slide size id')
    expect(() => resolveSlideSizeFromHtml('<html></html>')).toThrow('Invalid slide size id')
  })

  it.each([
    ['vertical-9-16', 900, 1600],
    ['standard-4-3', 1600, 1200],
    ['square-1-1', 1200, 1200],
    ['vertical-3-4', 1200, 1600],
    ['xiaohongshu-note', 1242, 1660]
  ] as const)('resolves %s to %sx%s', (id, width, height) => {
    expect(resolveSlideSize({ id })).toMatchObject({ id, width, height })
  })

  it('preserves persisted dimensions and restores them from HTML metadata', () => {
    expect(
      resolveSessionSlideSize({
        slideSizeId: 'vertical-3-4',
        slideWidth: 1201,
        slideHeight: 1601
      })
    ).toMatchObject({ id: 'vertical-3-4', width: 1201, height: 1601 })

    expect(
      resolveSlideSizeFromHtml(
        '<script id="deck-metadata" type="application/json">{"slideSizeId":"vertical-9-16","width":900,"height":1600}</script>'
      )
    ).toMatchObject({ id: 'vertical-9-16', width: 900, height: 1600 })
    expect(
      requireSlideSizeFromHtml(
        '<script id="deck-metadata" type="application/json">{"slideSizeId":"vertical-9-16","width":900,"height":1600}</script>'
      )
    ).toMatchObject({ id: 'vertical-9-16', width: 900, height: 1600 })
  })

  it('allows PPTX only for the default 16:9 canvas', () => {
    expect(() => assertPptxExportSupported(resolveSlideSize())).not.toThrow()
    expect(() =>
      assertPptxExportSupported(resolveSlideSize({ id: 'vertical-9-16' }))
    ).toThrow('当前 PPTX 导出仅支持 16:9')
  })
})
