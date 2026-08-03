import { describe, expect, it } from 'vitest'
import {
  buildDefaultSessionLayoutLibrary,
  formatLayoutMasterPrompt,
  getLayoutMasterTemplates,
  isValidSessionLayoutLibrary,
  normalizeSessionLayoutLibrary,
  resolveLayoutMasterTemplate
} from '../../../src/shared/layout-master'
import { LAYOUT_INTENTS } from '../../../src/shared/layout-intent'

describe('layout master library', () => {
  it('provides at least two compatible visual variants for every layout intent', () => {
    const templates = getLayoutMasterTemplates()

    for (const intent of LAYOUT_INTENTS) {
      expect(
        templates.filter((template) => template.intent === intent).length
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps only compatible mappings and falls back safely for unknown values', () => {
    const library = normalizeSessionLayoutLibrary({
      version: 1,
      mappings: {
        cover: 'cover-split',
        'data-focus': 'comparison-versus',
        comparison: 'missing-layout'
      }
    })

    expect(library.mappings.cover).toBe('cover-split')
    expect(library.mappings['data-focus']).toBe('data-metrics')
    expect(library.mappings.comparison).toBe('comparison-versus')
    expect(resolveLayoutMasterTemplate(library, 'cover')).toMatchObject({ id: 'cover-split' })
  })

  it('requires a complete, versioned mapping before accepting an IPC save', () => {
    const valid = buildDefaultSessionLayoutLibrary()
    expect(isValidSessionLayoutLibrary(valid)).toBe(true)
    expect(
      isValidSessionLayoutLibrary({
        version: 1,
        mappings: { ...valid.mappings, cover: 'image-spotlight' }
      })
    ).toBe(false)
    expect(isValidSessionLayoutLibrary({ version: 2, mappings: valid.mappings })).toBe(false)
  })

  it('states that a selected layout remains a flexible style-aware composition', () => {
    const prompt = formatLayoutMasterPrompt(resolveLayoutMasterTemplate({}, 'data-focus'))

    expect(prompt).toContain('Selected layout master: Metric focus')
    expect(prompt).toContain('flexible information architecture')
    expect(prompt).toContain('current style contract authoritative')
  })
})
