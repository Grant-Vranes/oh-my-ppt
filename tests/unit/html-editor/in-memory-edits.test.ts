import * as cheerio from 'cheerio'
import { describe, expect, it } from 'vitest'
import { applyEditsToHtml } from '../../../src/main/ipc/html-editor/html-editor-handlers'
import { resolveHtmlEditorDocumentPath } from '../../../src/main/ipc/html-editor/html-editor-handlers'
import { ensureElementAnchorInHtml } from '../../../src/main/ipc/editor/shared'

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
