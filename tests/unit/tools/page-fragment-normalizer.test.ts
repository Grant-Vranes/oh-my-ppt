import { describe, expect, it } from 'vitest'

import { normalizeCreativePageFragment } from '../../../src/main/tools/page-fragment-normalizer'

describe('normalizeCreativePageFragment block ids', () => {
  it('adds stable block ids to nested inline text runs', () => {
    const html = normalizeCreativePageFragment(`
      <p>Normal <span class="accent"><strong>red text</strong></span> normal</p>
    `)

    expect(html).toContain('<p data-block-id="text">')
    expect(html).toMatch(/<span class="accent" data-block-id="text-\d+">/)
    expect(html).toMatch(/<strong data-block-id="text-\d+">red text<\/strong>/)
  })

  it('marks generated fragments for semantic font-floor enforcement', () => {
    const html = normalizeCreativePageFragment('<div><h2>Title</h2><p>Body</p></div>')

    expect(html).toContain('data-ppt-readable-fonts="1"')
  })
})
