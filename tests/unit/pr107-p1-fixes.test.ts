import { describe, expect, it } from 'vitest'
import { validateHtmlContent } from '../../src/main/tools/html-utils'
import { buildSlideTimingXml } from '../../src/main/utils/html-pptx/animation-writer'
import type { PptxTargetAnimation } from '../../src/main/utils/html-pptx/animation-writer'

describe('PR#107 P1 Fixes', () => {
  describe('P1-1: Emphasis animations rebound to scale=100000', () => {
    it('generates two-phase rebound for pulse animation', () => {
      const animations: PptxTargetAnimation[] = [
        {
          spid: 1,
          type: 'pulse',
          trigger: 'click',
          duration: 500,
          delay: 0,
          order: 1
        }
      ]

      const xml = buildSlideTimingXml(animations)

      // Should contain two animScale blocks
      const scaleMatches = xml.match(/<p:animScale>/g)
      expect(scaleMatches).not.toBeNull()
      expect(scaleMatches!.length).toBeGreaterThanOrEqual(2)

      // First phase: 100000 → 106000
      expect(xml).toContain('<p:from x="100000" y="100000"/>')
      expect(xml).toContain('<p:to x="106000" y="106000"/>')

      // Second phase: 106000 → 100000 (rebound back)
      expect(xml).toContain('<p:from x="106000" y="106000"/>')
      expect(xml).toContain('<p:to x="100000" y="100000"/>')

      // Second phase should have fill="remove" to return to normal
      expect(xml).toContain('fill="remove"')
    })

    it('generates two-phase rebound for grow-shrink animation', () => {
      const animations: PptxTargetAnimation[] = [
        {
          spid: 2,
          type: 'grow-shrink',
          trigger: 'click',
          duration: 600,
          delay: 0,
          order: 1
        }
      ]

      const xml = buildSlideTimingXml(animations)

      // Should contain rebound sequence
      expect(xml).toContain('<p:from x="90000" y="90000"/>')
      expect(xml).toContain('<p:to x="108000" y="108000"/>')
      expect(xml).toContain('<p:from x="108000" y="108000"/>')
      expect(xml).toContain('<p:to x="100000" y="100000"/>')
    })

    it('generates two-phase rebound for all emphasis variants', () => {
      const emphasisTypes = [
        'pulse-soft',
        'pulse',
        'pulse-strong',
        'grow-shrink-soft',
        'grow-shrink',
        'grow-shrink-strong'
      ] as const

      emphasisTypes.forEach((type) => {
        const animations: PptxTargetAnimation[] = [
          {
            spid: 1,
            type,
            trigger: 'click',
            duration: 500,
            delay: 0,
            order: 1
          }
        ]

        const xml = buildSlideTimingXml(animations)

        // All emphasis animations should rebound to 100000
        expect(xml).toContain('<p:to x="100000" y="100000"/>'),
          `${type} should rebound to scale=100000`
      })
    })
  })

  describe('P1-2: Validator rejects center + incompatible motion types', () => {
    it('rejects center with fly-in', () => {
      const html = '<div data-anim="fly-in" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(false)
      expect(result.errors.join('\n')).toContain('center')
      expect(result.errors.join('\n')).toContain('fly-in')
      expect(result.errors.join('\n')).toContain('不兼容')
    })

    it('rejects center with wipe', () => {
      const html = '<div data-anim="wipe" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(false)
      expect(result.errors.join('\n')).toContain('wipe')
    })

    it('rejects center with exit-fly', () => {
      const html = '<div data-anim="exit-fly" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(false)
      expect(result.errors.join('\n')).toContain('exit-fly')
    })

    it('rejects center with exit-wipe', () => {
      const html = '<div data-anim="exit-wipe" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(false)
      expect(result.errors.join('\n')).toContain('exit-wipe')
    })

    it('accepts center with fade (compatible)', () => {
      const html = '<div data-anim="fade" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(true)
    })

    it('accepts center with zoom-in (compatible)', () => {
      const html = '<div data-anim="zoom-in" data-anim-from="center">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(true)
    })

    it('accepts center with path (compatible)', () => {
      const html = '<div data-anim="path" data-anim-from="center" data-anim-path="M 0 0 L 100 50">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(true)
    })
  })

  describe('P1-3: Decimal path validation and export', () => {
    it('accepts decimal path coordinates', () => {
      const html = '<div data-anim="path" data-anim-path="M 0.5 0 L 120.5 30.25">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts complex decimal path', () => {
      const html = '<div data-anim="path" data-anim-path="M 10.123 20.456 L 150.789 80.012">Test</div>'
      const result = validateHtmlContent(html)

      expect(result.valid).toBe(true)
    })

    it('exports decimal path motion correctly', () => {
      const animations: PptxTargetAnimation[] = [
        {
          spid: 1,
          type: 'path',
          trigger: 'click',
          path: 'M 0.5 0 L 120.5 30.25',
          duration: 500,
          delay: 0,
          order: 1
        }
      ]

      const xml = buildSlideTimingXml(animations)

      // Should contain motion with decimal deltas: x=120, y=30.25
      expect(xml).toContain('ppt_x')
      expect(xml).toContain('ppt_y')
      expect(xml).toContain('+120')
      expect(xml).toContain('+30.25')
    })
  })

  describe('P1-4: Pure path animation without implicit fade', () => {
    it('path preset does not include fade', () => {
      const animations: PptxTargetAnimation[] = [
        {
          spid: 1,
          type: 'path',
          trigger: 'click',
          path: 'M 0 0 L 100 50',
          duration: 500,
          delay: 0,
          order: 1
        }
      ]

      const xml = buildSlideTimingXml(animations)

      // Should NOT contain animEffect with fade filter
      expect(xml).not.toContain('<p:animEffect')
      expect(xml).not.toContain('filter="fade"')

      // Should only contain motion (ppt_x, ppt_y)
      expect(xml).toContain('ppt_x')
      expect(xml).toContain('ppt_y')
    })

    it('path animation contains only visibility set and motion', () => {
      const animations: PptxTargetAnimation[] = [
        {
          spid: 2,
          type: 'path',
          trigger: 'click',
          path: 'M 10 20 L 150 80',
          duration: 600,
          delay: 0,
          order: 1
        }
      ]

      const xml = buildSlideTimingXml(animations)

      // Should contain visibility set
      expect(xml).toContain('style.visibility')

      // Should contain motion channels
      expect(xml).toContain('<p:anim calcmode="lin" valueType="num">')

      // Should NOT contain scale, rotation, or fade effects
      expect(xml).not.toContain('<p:animScale>')
      expect(xml).not.toContain('<p:animRot>')
      expect(xml).not.toContain('<p:animEffect')
    })
  })
})
