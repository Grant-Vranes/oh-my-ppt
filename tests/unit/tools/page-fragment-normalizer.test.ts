import { describe, expect, it } from 'vitest'

import { normalizeCreativePageFragment } from '../../../src/main/presentation/html/page-fragment-normalizer'

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

  it('reallocates duplicate model-authored data-block-id values so persisted-page validation passes', () => {
    const html = normalizeCreativePageFragment(`
      <section data-block-id="select-arcsin1-5kQfdkFj">First</section>
      <section data-block-id="select-arcsin1-5kQfdkFj">Second</section>
      <section data-block-id="select-arcsin1-5kQfdkFj">Third</section>
    `)

    const ids = Array.from(html.matchAll(/data-block-id="([^"]+)"/g)).map((m) => m[1])
    // The content main always gets id="content"; the three duplicate sections must each
    // end up with a distinct id built from the model's chosen base.
    expect(ids.filter((id) => id.startsWith('select-arcsin1-5')).length).toBe(3)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('strips model-authored block ids without removing semantic page structure when requested', () => {
    const html = normalizeCreativePageFragment(
      '<section data-block-id="outer"><h2 data-block-id="title">Title</h2><p>Body</p></section>',
      { blockIdMode: 'strip' }
    )

    expect(html).not.toContain('data-block-id=')
    expect(html).toContain('data-page-scaffold="1"')
    expect(html).toContain('data-role="content"')
    expect(html).toContain('<h2 data-role="title">Title</h2>')
  })
})
