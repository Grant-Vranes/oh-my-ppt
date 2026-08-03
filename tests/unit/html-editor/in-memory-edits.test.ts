import * as cheerio from 'cheerio'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/main/html-editor/html-editor-thumbnail', () => ({
  refreshHtmlEditorCoverThumbnail: vi.fn(),
  warmHtmlEditorCoverThumbnails: vi.fn(async () => new Map())
}))

import { applyEditsToHtml } from '../../../src/main/html-editor/html-editor-handlers'
import { resolveHtmlEditorDocumentPath } from '../../../src/main/html-editor/html-editor-handlers'
import { ensureElementAnchorInHtml } from '../../../src/main/element-editor/shared'

const PAGE_ID = 'd1'

const sampleHtml = (inner = '<div id="el1" class="box">Hello</div>'): string =>
  `<html><body data-page-id="${PAGE_ID}"><main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1280"><div class="ppt-page-fit-scope">${inner}</div></main></body></html>`

const load = (html: string) => cheerio.load(html, { scriptingEnabled: false })

describe('applyEditsToHtml', () => {
  it('applies a text edit via patchElementProperties (anchored element)', () => {
    const anchor = ensureElementAnchorInHtml(sampleHtml(), {
      pageId: PAGE_ID,
      selector: '#el1'
    })
    const { html } = applyEditsToHtml(anchor.html, PAGE_ID, {
      textEdits: [{ selector: '#el1', patch: { text: 'World', style: { color: '#ff0000' } } }]
    })
    expect(load(html)('#el1').text()).toBe('World')
  })

  it('replaces an element class through a property edit', () => {
    const { html } = applyEditsToHtml(
      sampleHtml('<div id="el1" class="text-gray-800 font-bold">Hello</div>'),
      PAGE_ID,
      {
        propertyEdits: [
          {
            selector: '#el1',
            patch: { attrs: { className: 'text-red-500 font-bold' } }
          }
        ]
      }
    )
    expect(load(html)('#el1').attr('class')).toBe('text-red-500 font-bold')
  })

  it('adds an element into the fit-scope parent', () => {
    const { html } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      addElements: [
        {
          parentSelector: '.ppt-page-fit-scope',
          htmlFragment: '<div id="el2">New</div>',
          insertIndex: -1
        }
      ]
    })
    expect(load(html)('#el2').text()).toBe('New')
    expect(load(html)('#el2').attr('style')).toMatch(/position:\s*relative/)
    expect(load(html)('#el2').attr('style')).toMatch(/z-index:\s*20/)
    expect(load(html)('#el1').text()).toBe('Hello') // 原元素仍在
  })

  it('preserves an explicit z-index on an added element', () => {
    const { html } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      addElements: [
        {
          parentSelector: '.ppt-page-fit-scope',
          htmlFragment: '<div id="el2" style="z-index: 99">New</div>',
          insertIndex: -1
        }
      ]
    })
    expect(load(html)('#el2').attr('style')).toMatch(/z-index:\s*99/)
    expect(load(html)('#el2').attr('style')).not.toMatch(/z-index:\s*20/)
  })

  it('deletes an element by selector', () => {
    const { html } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      deletes: [{ selector: '#el1' }]
    })
    expect(load(html)('#el1').length).toBe(0)
  })

  it('applies a drag edit without removing the element (sets inline style)', () => {
    const { html } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      dragEdits: [
        {
          selector: '#el1',
          x: 100,
          y: 50,
          width: 200,
          height: 80,
          childUpdates: [],
          isAbsoluteMode: true
        }
      ]
    })
    const el = load(html)('#el1')
    expect(el.length).toBe(1)
    expect(el.attr('style')).toMatch(/position:\s*absolute/)
    expect(el.attr('style')).toMatch(/left:\s*100px/)
    expect(el.attr('style')).toMatch(/top:\s*50px/)
    expect(el.attr('style')).toMatch(/width:\s*200px/)
    expect(el.attr('style')).toMatch(/height:\s*80px/)
  })

  it('persists a flow resize as translate and actual dimensions', () => {
    const { html } = applyEditsToHtml(
      sampleHtml('<div id="el1" style="width: 240px; height: 100px">Hello</div>'),
      PAGE_ID,
      {
        dragEdits: [
          {
            selector: '#el1',
            x: 20,
            y: -8,
            width: 360,
            height: 75,
            childUpdates: [],
            isAbsoluteMode: false
          }
        ]
      }
    )

    const el = load(html)('#el1')
    expect(el.attr('style')).toMatch(/width:\s*360px/)
    expect(el.attr('style')).toMatch(/height:\s*75px/)
    expect(el.attr('style')).toMatch(/translate:\s*var\(--ppt-drag-x, 0px\) var\(--ppt-drag-y, 0px\)/)
  })

  it('freezes a flex layout island before persisting the resized element geometry', () => {
    const { html } = applyEditsToHtml(
      sampleHtml(`
        <section id="island" style="display: flex">
          <article id="item-a"><p style="font-size: 24px">Text</p></article>
          <article id="item-b"><img alt="Visual"></article>
        </section>
      `),
      PAGE_ID,
      {
        dragEdits: [
          {
            selector: '#item-a',
            x: 20,
            y: 30,
            width: 260,
            height: 120,
            childUpdates: [],
            isAbsoluteMode: true,
            layoutIsland: {
              selector: '#island',
              width: 640,
              height: 360,
              children: [
                { index: 0, x: 20, y: 30, width: 220, height: 120 },
                { index: 1, x: 300, y: 30, width: 300, height: 180 }
              ]
            }
          }
        ]
      }
    )

    const $ = load(html)
    expect($('#island').attr('data-ppt-layout-frozen')).toBe('1')
    expect($('#island').attr('style')).toMatch(/display:\s*block/)
    expect($('#item-a').attr('style')).toMatch(/position:\s*absolute/)
    expect($('#item-a').attr('style')).toMatch(/width:\s*260px/)
    expect($('#item-b').attr('style')).toMatch(/left:\s*300px/)
    expect($('#item-a p').attr('style')).toContain('font-size: 24px')
    expect($('#item-a').attr('style')).not.toContain('scale:')
  })

  it('resolves a property edit by blockId after anchoring', () => {
    const anchor = ensureElementAnchorInHtml(sampleHtml(), {
      pageId: PAGE_ID,
      selector: '#el1'
    })
    expect(anchor.changed).toBe(true)
    expect(anchor.blockId).toBeTruthy()
    const { html, warnings } = applyEditsToHtml(anchor.html, PAGE_ID, {
      propertyEdits: [
        {
          selector: '#el1',
          blockId: anchor.blockId,
          patch: { style: { opacity: 0.5 } }
        }
      ]
    })
    expect(warnings).toEqual([])
    expect(load(html)('#el1').attr('style')).toContain('0.5')
  })

  it('records a warning when a property edit target does not exist', () => {
    const { warnings } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      propertyEdits: [{ selector: '#nope', patch: { style: { opacity: 0.5 } } }]
    })
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('#nope')
  })

  it('applies deletes before adds (no conflict)', () => {
    const { html } = applyEditsToHtml(sampleHtml(), PAGE_ID, {
      deletes: [{ selector: '#el1' }],
      addElements: [
        {
          parentSelector: '.ppt-page-fit-scope',
          htmlFragment: '<div id="el2">New</div>',
          insertIndex: -1
        }
      ]
    })
    const $ = load(html)
    expect($('#el1').length).toBe(0)
    expect($('#el2').length).toBe(1)
  })

  it('is pure: does not mutate the input string and needs no filesystem', () => {
    const original = sampleHtml()
    applyEditsToHtml(original, PAGE_ID, {
      deletes: [{ selector: '#el1' }]
    })
    expect(load(original)('#el1').length).toBe(1) // 输入未变
  })
})

describe('resolveHtmlEditorDocumentPath', () => {
  it('accepts only the registered current.html path for a document', () => {
    expect(
      resolveHtmlEditorDocumentPath({
        storagePath: '/tmp/storage',
        docId: 'hedit-1',
        storedHtmlPath: '/tmp/storage/html-editor/hedit-1/current.html'
      })
    ).toBe('/tmp/storage/html-editor/hedit-1/current.html')
  })

  it('rejects a path outside the document directory', () => {
    expect(() =>
      resolveHtmlEditorDocumentPath({
        storagePath: '/tmp/storage',
        docId: 'hedit-1',
        storedHtmlPath: '/tmp/storage/other.html'
      })
    ).toThrow('HTML 编辑文档路径无效')
  })
})
