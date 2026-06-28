import { describe, expect, it } from 'vitest'
import {
  MAX_SELECTED_PAGES,
  MAX_STYLE_SWITCH_PAGES,
  normalizeAnimationPreferences,
  normalizeSelectPageIds
} from '../../../src/shared/generation'

describe('normalizeSelectPageIds', () => {
  it('normalizes explicit main-session selected page ids', () => {
    expect(
      normalizeSelectPageIds([' page-13 ', 'page-14', 'page-13', '../bad', 'page_15'])
    ).toEqual(['page-13', 'page-14', 'page_15'])
  })

  it('rejects more than the shared selected-page limit without truncating', () => {
    const pageIds = Array.from(
      { length: MAX_SELECTED_PAGES + 1 },
      (_, index) => `page-${index + 1}`
    )

    expect(() => normalizeSelectPageIds(pageIds)).toThrow(`一次最多选择 ${MAX_SELECTED_PAGES} 页`)
  })

  it('allows exactly the shared selected-page limit', () => {
    const pageIds = Array.from({ length: MAX_SELECTED_PAGES }, (_, index) => `page-${index + 1}`)

    expect(normalizeSelectPageIds(pageIds)).toHaveLength(MAX_SELECTED_PAGES)
  })

  it('supports the larger explicit limit used by style-switch retries', () => {
    const pageIds = Array.from(
      { length: MAX_STYLE_SWITCH_PAGES },
      (_, index) => `page-${index + 1}`
    )

    expect(normalizeSelectPageIds(pageIds, MAX_STYLE_SWITCH_PAGES)).toHaveLength(
      MAX_STYLE_SWITCH_PAGES
    )
  })
})

describe('normalizeAnimationPreferences', () => {
  it('deduplicates known animation preference ids and limits to three', () => {
    expect(
      normalizeAnimationPreferences({
        ids: ['fade-up', 'wipe', 'fade-up', 'pulse-soft', 'zoom-in']
      })
    ).toEqual({ ids: ['fade-up', 'wipe', 'pulse-soft'] })
  })

  it('drops unknown ids and returns null when no known preference remains', () => {
    expect(
      normalizeAnimationPreferences({
        ids: ['unknown', 'default', 'fade-up']
      })
    ).toEqual({ ids: ['fade-up'] })
    expect(normalizeAnimationPreferences({ ids: ['unknown'] })).toBeNull()
  })

  it('accepts raw id arrays for UI state normalization', () => {
    expect(normalizeAnimationPreferences(['slide-right', 'zoom-in', 'pulse'])).toEqual({
      ids: ['slide-right', 'zoom-in', 'pulse']
    })
  })
})
