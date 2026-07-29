import { describe, expect, it } from 'vitest'
import { isPptxStaticBackgroundShape } from '../../../src/main/io/html-pptx/static-background'

describe('PPTX static background shape classification', () => {
  it('keeps full-page and full-height column fills in the screenshot base', () => {
    expect(isPptxStaticBackgroundShape({ x: 0, y: 0, w: 13.333, h: 7.5 })).toBe(true)
    expect(isPptxStaticBackgroundShape({ x: 0, y: 0, w: 6.133, h: 7.5 })).toBe(true)
  })

  it('keeps regular cards and centered large content shapes editable', () => {
    expect(isPptxStaticBackgroundShape({ x: 6.6, y: 4.3, w: 6.2, h: 0.8 })).toBe(false)
    expect(isPptxStaticBackgroundShape({ x: 1, y: 1, w: 10, h: 5 })).toBe(false)
  })

  it('does not classify near-full-width header bands as slide backgrounds', () => {
    expect(isPptxStaticBackgroundShape({ x: 0, y: 0, w: 13.3, h: 2.5 })).toBe(false)
  })
})
