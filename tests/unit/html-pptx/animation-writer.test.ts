import * as cheerio from 'cheerio'
import { describe, expect, it } from 'vitest'
import {
  buildSlideTimingXml,
  type PptxTargetAnimation
} from '../../../src/main/utils/html-pptx/animation-writer'

const makeAnim = (overrides: Partial<PptxTargetAnimation> = {}): PptxTargetAnimation => ({
  spid: 2,
  type: 'fade-up',
  trigger: 'load',
  duration: 500,
  delay: 0,
  order: 0,
  ...overrides
})

const parseTimingXml = (xml: string) => {
  if (!xml) return null
  return cheerio.load(xml, { xmlMode: true }, false)
}

describe('OOXML timing tree structure', () => {
  it('has exactly one tmRoot containing one mainSeq', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 7, type: 'fade' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const root = $('p\\:par p\\:cTn[nodeType="tmRoot"]')
    expect(root.length).toBe(1)

    const mainSeq = root.find('p\\:cTn[nodeType="mainSeq"]')
    expect(mainSeq.length).toBe(1)
    expect(mainSeq.parents('p\\:cTn[nodeType="tmRoot"]').length).toBeGreaterThanOrEqual(1)
  })

  it('every effect node has exactly one stCondLst child', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 3, type: 'fade' }),
      makeAnim({ spid: 4, type: 'pulse', trigger: 'click', order: 1 })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    // Find all par-level cTn that contain presetID (effect containers)
    $('p\\:cTn[presetID]').each((_, el) => {
      const ctn = $(el)
      const stCond = ctn.children('p\\:stCondLst')
      expect(stCond.length, `effect node id=${ctn.attr('id')} has stCondLst`).toBe(1)
    })
  })

  it('every effect node has exactly one childTnLst parent wrapping its children', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 3, type: 'fade' }),
      makeAnim({ spid: 4, type: 'scale-in', order: 1 })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    $('p\\:cTn[presetID]').each((_, el) => {
      const ctn = $(el)
      const childList = ctn.children('p\\:childTnLst')
      expect(childList.length, `effect node id=${ctn.attr('id')} has childTnLst`).toBe(1)
    })
  })

  it('starts the main animation sequence immediately so load animations do not wait for a click', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 3, type: 'fade-up', trigger: 'load' }),
      makeAnim({ spid: 4, type: 'exit-fade', trigger: 'click', order: 1 })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    expect(xml).not.toContain('<p:cond delay="indefinite"/>')
    expect($('p\\:cTn[nodeType="withEffect"]').length).toBeGreaterThan(0)
    expect($('p\\:cTn[nodeType="clickEffect"]').length).toBeGreaterThan(0)
  })

  it('emphasis effects contain a p:seq with two child animScale elements', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 3, type: 'pulse' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    // The timing tree has multiple <p:seq> elements:
    // - One for the main sequence wrapper (mainSeq)
    // - One nested inside the effect for emphasis rebound
    // Find the seq that contains animScale (the emphasis rebound seq)
    const reboundSeq = $('p\\:seq').filter((_, el) => $(el).find('p\\:animScale').length > 0)
    expect(reboundSeq.length).toBeGreaterThanOrEqual(1)

    // The rebound seq should contain exactly 2 animScale children
    const scales = reboundSeq.find('p\\:animScale')
    expect(scales.length).toBe(2)
  })

  it('emphasis rebound: first animScale uses fill="hold", second uses fill="remove"', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 5, type: 'pulse', duration: 800 })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const scales = $('p\\:animScale')
    expect(scales.length).toBe(2)

    const first = $(scales[0])
    const firstTn = first.find('p\\:cTn[dur][fill]').first()
    expect(firstTn.attr('fill')).toBe('hold')
    expect(Number(firstTn.attr('dur'))).toBeGreaterThan(0)

    const second = $(scales[1])
    const secondTn = second.find('p\\:cTn[dur][fill]').first()
    expect(secondTn.attr('fill')).toBe('remove')
    expect(Number(secondTn.attr('dur'))).toBeGreaterThan(0)
  })

  it('emphasis rebound: second animScale transitions peak back to identity (x=100000, y=100000)', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 5, type: 'pulse', duration: 600 })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const scales = $('p\\:animScale')
    const second = $(scales[1])
    const toEl = second.find('p\\:to')
    expect(toEl.length).toBe(1)
    expect(toEl.attr('x')).toBe('100000')
    expect(toEl.attr('y')).toBe('100000')
  })

  it('emphasis rebound: second phase duration equals first phase (half total each)', () => {
    const totalDur = 1000
    const xml = buildSlideTimingXml([makeAnim({ spid: 5, type: 'grow-shrink', duration: totalDur })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const scales = $('p\\:animScale')
    const dur1 = Number($(scales[0]).find('p\\:cTn[dur][fill]').first().attr('dur'))
    const dur2 = Number($(scales[1]).find('p\\:cTn[dur][fill]').first().attr('dur'))
    expect(dur1 + dur2).toBeLessThanOrEqual(totalDur)
    // Should be roughly half each (floor division may lose 1ms)
    expect(Math.abs(dur1 - dur2)).toBeLessThanOrEqual(1)
  })

  it('emphasis seq is a child of the effect childTnLst (not top-level)', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 5, type: 'pulse-strong' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    // Find the emphasis rebound seq: a p:seq whose direct children include
    // a p:cTn that directly contains p:childTnLst > p:animScale
    const reboundSeq = $('p\\:seq').filter((_, el) => {
      const $seq = $(el)
      return $seq.children('p\\:cTn').children('p\\:childTnLst').children('p\\:animScale').length > 0
    })
    expect(reboundSeq.length).toBe(1)

    // The seq must be inside a childTnLst that belongs to the effect par
    const parentChildTn = reboundSeq.closest('p\\:childTnLst')
    expect(parentChildTn.length).toBe(1)
    // That childTnLst must be inside a cTn that has presetID
    const parentCtn = parentChildTn.closest('p\\:cTn[presetID]')
    expect(parentCtn.length).toBe(1)
  })

  it('non-emphasis scale animations do not use rebound p:seq', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 3, type: 'scale-in' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    // A rebound seq is a p:seq whose direct children include p:cTn > p:childTnLst > p:animScale
    // Non-emphasis scale animations should NOT have this structure
    const reboundSeq = $('p\\:seq').filter((_, el) => {
      return $(el).children('p\\:cTn').children('p\\:childTnLst').children('p\\:animScale').length > 0
    })
    expect(reboundSeq.length).toBe(0)

    // But there should still be exactly one animScale total
    const allScales = $('p\\:animScale')
    expect(allScales.length).toBe(1)
  })

  it('path animation generates two anim channels (x, y) and no animEffect', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 8, type: 'path', path: 'M 0 0 L 120 30' })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const animNodes = $('p\\:anim[calcmode="lin"]')
    expect(animNodes.length).toBe(2)

    const xAnim = animNodes.filter((_, el) => $(el).find('p\\:attrName').text() === 'ppt_x')
    const yAnim = animNodes.filter((_, el) => $(el).find('p\\:attrName').text() === 'ppt_y')
    expect(xAnim.length).toBe(1)
    expect(yAnim.length).toBe(1)

    // No animEffect for path (P1-4)
    expect($('p\\:animEffect').length).toBe(0)
  })

  it('fade animation generates exactly one animEffect with filter="fade"', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 3, type: 'fade' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const effects = $('p\\:animEffect')
    expect(effects.length).toBe(1)
    expect(effects.attr('filter')).toBe('fade')
  })

  it('entrance animation channels use smooth ease-out timing', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 3, type: 'fade-up', duration: 600 })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const timedNodes = $('p\\:cTn[dur="600"][accel][decel]')
    expect(timedNodes.length).toBeGreaterThanOrEqual(2)
    timedNodes.each((_, el) => {
      expect($(el).attr('accel')).toBe('0')
      expect($(el).attr('decel')).toBe('70000')
    })
  })

  it('exit animation channels use smooth ease-in timing', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 3, type: 'exit-fly', trigger: 'click', duration: 600 })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const timedNodes = $('p\\:cTn[dur="600"][accel][decel]')
    expect(timedNodes.length).toBeGreaterThanOrEqual(2)
    timedNodes.each((_, el) => {
      expect($(el).attr('accel')).toBe('70000')
      expect($(el).attr('decel')).toBe('0')
    })
  })

  it('emphasis rebound uses smooth ease-in-out timing on both phases', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 5, type: 'pulse', duration: 600 })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const scaleTimingNodes = $('p\\:animScale p\\:cTn[dur][accel][decel]')
    expect(scaleTimingNodes.length).toBe(2)
    scaleTimingNodes.each((_, el) => {
      expect($(el).attr('accel')).toBe('20000')
      expect($(el).attr('decel')).toBe('60000')
    })
  })

  it('build list entries match unique target spids exactly', () => {
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 7, type: 'fade-up', delay: 100 }),
      makeAnim({ spid: 7, type: 'pulse', trigger: 'click', order: 1 }),
      makeAnim({ spid: 8, type: 'fade', order: 2 })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const buildEntries = $('p\\:bldP')
    expect(buildEntries.length).toBe(2) // spid 7 and spid 8
    const spids = buildEntries.map((_, el) => $(el).attr('spid')).get()
    expect(spids).toContain('7')
    expect(spids).toContain('8')
  })

  it('tmRoot contains exactly one bldLst', () => {
    const xml = buildSlideTimingXml([makeAnim({ spid: 7, type: 'fade' })])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const bldLst = $('p\\:bldLst')
    expect(bldLst.length).toBe(1)

    // bldLst must be a direct child of timing
    const timingParent = bldLst.closest('p\\:timing')
    expect(timingParent.length).toBe(1)
  })
})

describe('Decimal path precision in timing XML', () => {
  it('emits fractional deltas for decimal path coordinates', () => {
    // delta = end - start: 120.5 - 0.5 = 120 (x), 30.25 - 0 = 30.25 (y)
    const xml = buildSlideTimingXml([
      makeAnim({ spid: 8, type: 'path', path: 'M 0.5 0 L 120.5 30.25' })
    ])
    const $ = parseTimingXml(xml)
    expect($).not.toBeNull()

    const toValues = $('p\\:tav[tm="100000"] p\\:strVal')
    const vals = toValues.map((_, el) => $(el).attr('val') || '').get()
    // x delta = 120.5 - 0.5 = 120 (integer, no fraction)
    expect(vals).toContain('#ppt_x+120')
    // y delta = 30.25 - 0 = 30.25 (fractional)
    expect(vals).toContain('#ppt_y+30.25')
  })
})
