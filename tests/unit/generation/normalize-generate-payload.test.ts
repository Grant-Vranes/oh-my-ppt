import { describe, expect, it } from 'vitest'
import { MAX_SELECTED_PAGES, normalizeSelectPageIds } from '../../../src/shared/generation'

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
})
