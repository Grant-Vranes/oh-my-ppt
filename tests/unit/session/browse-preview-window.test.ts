import { describe, expect, it } from 'vitest'
import { limitBrowsePreviewIds } from '../../../src/renderer/src/components/session-detail/browse/browse-preview-utils'

describe('limitBrowsePreviewIds', () => {
  it('keeps all visible preview ids within the browse cache limit', () => {
    const ids = new Set(['page-1', 'page-2', 'page-3'])

    expect(Array.from(limitBrowsePreviewIds(ids, 20))).toEqual(['page-1', 'page-2', 'page-3'])
  })

  it('keeps the first visible preview ids when the cache is full', () => {
    const ids = new Set(Array.from({ length: 24 }, (_, index) => `page-${index + 1}`))

    expect(Array.from(limitBrowsePreviewIds(ids, 20))).toEqual(
      Array.from({ length: 20 }, (_, index) => `page-${index + 1}`)
    )
  })

  it('supports disabling browse previews', () => {
    expect(Array.from(limitBrowsePreviewIds(new Set(['page-1']), 0))).toEqual([])
  })
})
