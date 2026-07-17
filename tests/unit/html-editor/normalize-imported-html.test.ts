import os from 'os'
import path from 'path'
import { pathToFileURL } from 'node:url'
import * as cheerio from 'cheerio'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN_WIDTH,
  hasSlideScaffold,
  normalizeImportedHtml,
  rewriteRelativeAssetsToSource
} from '../../../src/main/ipc/html-editor/html-editor-import'

const SOURCE_DIR = path.join(os.tmpdir(), 'html-editor-src-test')
const fileUrl = (rel: string): string => pathToFileURL(path.resolve(SOURCE_DIR, rel)).href

describe('hasSlideScaffold', () => {
  it('detects existing ppt-page-root scaffold', () => {
    const html = `<html><body data-page-id="p1"><main class="ppt-page-root" data-ppt-guard-root="1"></main></body></html>`
    expect(hasSlideScaffold(html)).toBe(true)
  })

  it('returns false for plain html', () => {
    const html = `<html><body><h1>hello</h1></body></html>`
    expect(hasSlideScaffold(html)).toBe(false)
  })
})

describe('normalizeImportedHtml', () => {
  const docId = 'hedit-abc'

  it('wraps plain html into scaffold with designWidth, keeps head, sets body[data-page-id]', () => {
    const html = `<!DOCTYPE html><html><head><title>Hi</title><style>.a{color:red}</style></head><body><h1>Hello</h1></body></html>`
    const {
      html: out,
      designWidth,
      title
    } = normalizeImportedHtml({
      html,
      sourceDir: SOURCE_DIR,
      docId
    })
    expect(title).toBe('Hi')
    expect(designWidth).toBe(DEFAULT_DESIGN_WIDTH)
    const $ = cheerio.load(out)
    expect($('main.ppt-page-root[data-ppt-guard-root]').length).toBe(1)
    expect($('.ppt-page-fit-scope').length).toBe(1)
    expect($('main.ppt-page-root').attr('data-ppt-width')).toBe(String(DEFAULT_DESIGN_WIDTH))
    expect($('main.ppt-page-root').attr('data-ppt-height')).toBeUndefined()
    expect($('body').attr('data-page-id')).toBe(docId)
    expect($('head style').text()).toContain('.a{color:red}')
    expect($('.ppt-page-fit-scope h1').text()).toBe('Hello')
  })

  it('reuses existing scaffold: drops height, keeps width as designWidth', () => {
    const html = `<html><body><main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1920" data-ppt-height="1080"><div class="ppt-page-fit-scope"><p>x</p></div></main></body></html>`
    const { html: out, designWidth } = normalizeImportedHtml({
      html,
      sourceDir: SOURCE_DIR,
      docId
    })
    expect(designWidth).toBe(1920)
    const $ = cheerio.load(out)
    expect($('main.ppt-page-root').attr('data-ppt-width')).toBe('1920')
    expect($('main.ppt-page-root').attr('data-ppt-height')).toBeUndefined()
    expect($('body').attr('data-page-id')).toBe(docId)
    expect($('.ppt-page-fit-scope p').text()).toBe('x')
  })

  it('sets body[data-page-id] when missing on existing scaffold', () => {
    const html = `<html><body><main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1280"><div class="ppt-page-fit-scope"></div></main></body></html>`
    const { html: out } = normalizeImportedHtml({ html, sourceDir: SOURCE_DIR, docId })
    expect(cheerio.load(out)('body').attr('data-page-id')).toBe(docId)
  })

  it('replaces an existing page id when importing an existing scaffold', () => {
    const html = `<html><body data-page-id="old-page"><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"></div></main></body></html>`
    const { html: out } = normalizeImportedHtml({ html, sourceDir: SOURCE_DIR, docId })
    expect(cheerio.load(out)('body').attr('data-page-id')).toBe(docId)
  })

  it('injects chart and PPT runtime scripts once', () => {
    const html = `<html><head><script src="https://cdn.example.com/chart.v4.js"></script></head><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"></div></main></body></html>`
    const { html: out } = normalizeImportedHtml({
      html,
      sourceDir: SOURCE_DIR,
      docId,
      runtimeScriptHrefs: ['file:///app/chart.v4.js', 'file:///app/ppt-runtime.js']
    })
    const $ = cheerio.load(out)
    expect($('script[src$="chart.v4.js"]').length).toBe(2)
    expect($('script[src$="ppt-runtime.js"]').length).toBe(1)
    expect($('head script').eq(1).attr('src')).toBe('file:///app/chart.v4.js')
  })
})

describe('rewriteRelativeAssetsToSource', () => {
  it('rewrites img/script/link/video src & href & poster to file://', () => {
    const html = `<html><body>
      <img src="./images/a.png">
      <script src="./assets/b.js"></script>
      <link rel="stylesheet" href="./assets/c.css">
      <video src="./videos/v.mp4" poster="./images/p.jpg"></video>
    </body></html>`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    const $ = cheerio.load(out)
    expect($('img').attr('src')).toBe(fileUrl('images/a.png'))
    expect($('script').attr('src')).toBe(fileUrl('assets/b.js'))
    expect($('link').attr('href')).toBe(fileUrl('assets/c.css'))
    expect($('video').attr('src')).toBe(fileUrl('videos/v.mp4'))
    expect($('video').attr('poster')).toBe(fileUrl('images/p.jpg'))
  })

  it('rewrites srcset preserving descriptors', () => {
    const html = `<img srcset="./images/a.png 1x, ./images/b.png 2x">`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    const $ = cheerio.load(out)
    expect($('img').attr('srcset')).toBe(
      `${fileUrl('images/a.png')} 1x, ${fileUrl('images/b.png')} 2x`
    )
  })

  it('rewrites svg use href with fragment preserved', () => {
    const html = `<svg><use href="./icons/x.svg#i"></use></svg>`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    const $ = cheerio.load(out)
    expect($('use').attr('href')).toBe(`${fileUrl('icons/x.svg')}#i`)
  })

  it('rewrites inline style url() and <style> url()', () => {
    const html = `<html><head><style>.bg{background:url("./images/bg.png")}</style></head>
      <body><div style="background:url('./images/inline.png')"></div></body></html>`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    const $ = cheerio.load(out)
    expect($('style').text()).toContain(fileUrl('images/bg.png'))
    expect($('div').attr('style')).toContain(fileUrl('images/inline.png'))
  })

  it('keeps http(s)/data/blob/file/fragment as-is', () => {
    const html = `<html><body>
      <img src="https://x.com/a.png">
      <img src="data:image/png;base64,AAAA">
      <img src="blob:abc">
      <a href="#section">x</a>
    </body></html>`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    const $ = cheerio.load(out)
    expect($('img').eq(0).attr('src')).toBe('https://x.com/a.png')
    expect($('img').eq(1).attr('src')).toBe('data:image/png;base64,AAAA')
    expect($('img').eq(2).attr('src')).toBe('blob:abc')
    expect($('a').attr('href')).toBe('#section')
  })

  it('does not rewrite ../ escape paths', () => {
    const html = `<img src="../secret.png">`
    const out = rewriteRelativeAssetsToSource({ html, sourceDir: SOURCE_DIR })
    expect(cheerio.load(out)('img').attr('src')).toBe('../secret.png')
  })
})
