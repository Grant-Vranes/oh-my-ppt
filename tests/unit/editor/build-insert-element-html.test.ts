import { describe, expect, it } from 'vitest'
import {
  buildIconElementHtml,
  buildShapeElementHtml,
  isValidBlockId,
  isValidColor,
  type InsertShapeType
} from '../../../src/renderer/src/components/session-detail/workspace/insert-shapes'

const VALID_BLOCK_ID = 'select-arcsin1-abcd1234'
const LAYOUT = { left: 100, top: 200, width: 240, height: 120, zIndex: 12 }

describe('buildShapeElementHtml', () => {
  const types: InsertShapeType[] = [
    'rect',
    'rounded-rect',
    'ellipse',
    'triangle',
    'diamond',
    'pentagon',
    'hexagon',
    'parallelogram',
    'trapezoid',
    'star-5',
    'line',
    'arrow-right',
    'chevron-right'
  ]

  types.forEach((type) => {
    it(`produces a selectable shape fragment for "${type}"`, () => {
      const html = buildShapeElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, type })
      expect(html).toContain(`data-block-id="${VALID_BLOCK_ID}"`)
      expect(html).toContain('data-ppt-edit-kind="shape"')
      expect(html).toContain(`data-ppt-shape-type="${type}"`)
      expect(html).toContain('position:absolute')
      expect(html).toContain('left:100px')
      expect(html).toContain('top:200px')
      expect(html).toContain('width:240px')
      expect(html).toContain('height:120px')
      expect(html).toContain('z-index:12')
      expect(html).toContain('<svg')
      expect(html).toContain('</svg>')
    })
  })

  it('line uses non-scaling-stroke so stroke width stays stable when stretched', () => {
    const line = buildShapeElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, type: 'line' })
    expect(line).toContain('vector-effect="non-scaling-stroke"')
  })

  it('arrow-right is a solid filled block arrow (not a thin stroked path)', () => {
    const arrow = buildShapeElementHtml({
      ...LAYOUT,
      blockId: VALID_BLOCK_ID,
      type: 'arrow-right'
    })
    expect(arrow).toContain('<polygon')
    // filled block arrow must not be stroke-only
    expect(arrow).toMatch(/fill="#[0-9a-fA-F]+"/)
  })

  it('polygon-based shapes render a <polygon> element', () => {
    const polygonShapes: InsertShapeType[] = [
      'triangle',
      'diamond',
      'pentagon',
      'hexagon',
      'parallelogram',
      'trapezoid',
      'star-5',
      'chevron-right'
    ]
    polygonShapes.forEach((type) => {
      const html = buildShapeElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, type })
      expect(html).toContain('<polygon')
    })
  })

  it('rejects an invalid blockId', () => {
    expect(() =>
      buildShapeElementHtml({ ...LAYOUT, blockId: 'evil"><script>', type: 'rect' })
    ).toThrow(/invalid blockId/)
  })

  it('rejects an unknown shape type', () => {
    expect(() =>
      buildShapeElementHtml({
        ...LAYOUT,
        blockId: VALID_BLOCK_ID,
        type: 'definitely-not-real' as InsertShapeType
      })
    ).toThrow(/unknown shape type/)
  })

  it('rejects a color that would break out of the attribute', () => {
    expect(() =>
      buildShapeElementHtml({
        ...LAYOUT,
        blockId: VALID_BLOCK_ID,
        type: 'rect',
        fill: 'red"/><script>alert(1)</script><rect x="'
      })
    ).toThrow(/invalid color/)
  })

  it('never emits script tags or inline event handlers', () => {
    const html = buildShapeElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, type: 'rect' })
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/on\w+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
  })
})

describe('buildIconElementHtml', () => {
  it('produces a selectable icon fragment with currentColor stroke', () => {
    const html = buildIconElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, iconId: 'lightbulb' })
    expect(html).toContain(`data-block-id="${VALID_BLOCK_ID}"`)
    expect(html).toContain('data-ppt-edit-kind="icon"')
    expect(html).toContain('data-ppt-icon-id="lightbulb"')
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain('color:#3f4b35')
    expect(html).toContain('<svg')
  })

  it('numbered badge renders a solid filled circle with the number', () => {
    const html = buildIconElementHtml({
      ...LAYOUT,
      blockId: VALID_BLOCK_ID,
      iconId: 'number-3'
    })
    expect(html).toContain('data-ppt-icon-id="number-3"')
    expect(html).toContain('<circle')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('>3</')
    // badge must not carry the stroke-icon attrs on the outer svg
    expect(html).not.toMatch(/svg[^>]*stroke="currentColor"/)
  })

  it('rejects an unknown iconId', () => {
    expect(() =>
      buildIconElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, iconId: 'definitely-not-real' })
    ).toThrow(/unknown iconId/)
  })

  it('serializes circle/line/rect nodes correctly', () => {
    const html = buildIconElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, iconId: 'target' })
    // target icon has 3 nested circles
    const circleMatches = html.match(/<circle /g)
    expect(circleMatches).not.toBeNull()
    expect(circleMatches!.length).toBe(3)
  })

  it('never emits script tags or inline event handlers', () => {
    const html = buildIconElementHtml({ ...LAYOUT, blockId: VALID_BLOCK_ID, iconId: 'star' })
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/on\w+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
    expect(html).not.toMatch(/<foreignObject/i)
  })
})

describe('isValidBlockId / isValidColor', () => {
  it('accepts the canonical generated id shape', () => {
    expect(isValidBlockId('select-arcsin1-abcd1234')).toBe(true)
    expect(isValidBlockId('select-arcsin1-Xy_9-AB12')).toBe(true)
  })

  it('rejects anything that is not the generated id shape', () => {
    expect(isValidBlockId('')).toBe(false)
    expect(isValidBlockId('foo')).toBe(false)
    expect(isValidBlockId('"><script>')).toBe(false)
  })

  it('accepts hex and named colors, rejects expressions', () => {
    expect(isValidColor('#abc')).toBe(true)
    expect(isValidColor('#aabbcc')).toBe(true)
    expect(isValidColor('red')).toBe(true)
    expect(isValidColor('transparent')).toBe(true)
    expect(isValidColor('currentColor')).toBe(true)
    expect(isValidColor('url(foo)')).toBe(false)
    expect(isValidColor('expression(alert(1))')).toBe(false)
  })
})
