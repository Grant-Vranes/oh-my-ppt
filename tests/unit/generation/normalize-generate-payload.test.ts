import { describe, expect, it } from 'vitest'
import { normalizeSelectPageIds } from '../../../src/shared/generation'

describe('normalizeSelectPageIds', () => {
  it('normalizes explicit main-session selected page ids', () => {
    expect(normalizeSelectPageIds([' page-13 ', 'page-14', 'page-13', '../bad', 'page_15'])).toEqual([
      'page-13',
      'page-14',
      'page_15'
    ])
  })
})
