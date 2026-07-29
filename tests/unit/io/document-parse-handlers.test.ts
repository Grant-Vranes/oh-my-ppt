import { describe, expect, it } from 'vitest'

import {
  extractImpliedPageCount,
  normalizeGeneratedPlan
} from '../../../src/main/io/document-plan-normalizer'

describe('document parse plan page count normalization', () => {
  it('uses English per-page entries when the model collapses pageCount to one', () => {
    const result = normalizeGeneratedPlan(
      JSON.stringify({
        topic: 'Product Launch Readiness Review',
        pageCount: 1,
        briefText: [
          'Presentation goal: Review launch readiness.',
          'Recommended outline:',
          '1. Context',
          '2. Market signal',
          '3. Product readiness',
          '4. GTM risks',
          '5. Timeline',
          '6. Decision points',
          'Per-page points:',
          'Page 1: Context',
          'Page 2: Market signal',
          'Page 3: Product readiness',
          'Page 4: GTM risks',
          'Page 5: Timeline',
          'Page 6: Decision points'
        ].join('\n')
      }),
      { topic: '', pageCount: null, briefText: '' }
    )

    expect(result.pageCount).toBe(6)
  })

  it('keeps an explicit user page count even when the outline has more entries', () => {
    const result = normalizeGeneratedPlan(
      JSON.stringify({
        topic: 'Product Launch Readiness Review',
        pageCount: 1,
        briefText: ['Recommended outline:', '1. Context', '2. Market signal'].join('\n')
      }),
      { topic: '', pageCount: 1, briefText: '' }
    )

    expect(result.pageCount).toBe(1)
  })

  it('counts English Page N labels in per-page sections', () => {
    expect(
      extractImpliedPageCount(['Per-page points:', 'Page 1: A', 'Page 2: B', 'Page 3: C'].join('\n'))
    ).toBe(3)
  })
})
