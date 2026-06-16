import { describe, expect, it } from 'vitest'
import { selectPreviewWindowIds } from '../../../src/renderer/src/components/session-detail/hooks/preview-window-utils'

describe('selectPreviewWindowIds', () => {
  it('keeps only the nearest previews within the hard limit', () => {
    const result = selectPreviewWindowIds(
      [
        { id: 'page-4', distance: 400 },
        { id: 'page-2', distance: 20 },
        { id: 'page-1', distance: 10 },
        { id: 'page-3', distance: 30 }
      ],
      3
    )

    expect(Array.from(result)).toEqual(['page-1', 'page-2', 'page-3'])
  })

  it('drops invalid candidates', () => {
    expect(
      Array.from(
        selectPreviewWindowIds(
          [
            { id: 'page-1', distance: Number.NaN },
            { id: '', distance: 0 },
            { id: 'page-2', distance: 1 }
          ],
          2
        )
      )
    ).toEqual(['page-2'])
  })

  it('supports closing the preview window completely', () => {
    expect(Array.from(selectPreviewWindowIds([{ id: 'page-1', distance: 0 }], 0))).toEqual([])
  })
})
