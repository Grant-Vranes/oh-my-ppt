import { describe, expect, it } from 'vitest'

import {
  ensureElementAnchorInHtml,
  patchDraggedElementStyle,
  patchGenericElementProperties
} from '../../../src/main/ipc/editor/shared'

describe('ensureElementAnchorInHtml', () => {
  it('keeps an existing block id only when it is unique', () => {
    const html = `
      <html><body data-page-id="page">
        <main data-block-id="content" data-role="content">
          <p data-block-id="text">first</p>
          <p data-block-id="text">second</p>
        </main>
      </body></html>
    `

    const result = ensureElementAnchorInHtml(html, {
      pageId: 'page',
      selector: 'body[data-page-id="page"] main > p:nth-child(2)',
      elementTag: 'p'
    })

    expect(result.changed).toBe(true)
    expect(result.blockId).not.toBe('text')
    expect(result.selector).toBe(`body[data-page-id="page"] [data-block-id="${result.blockId}"]`)
    expect(result.html).toContain(`<p data-block-id="${result.blockId}">second</p>`)
  })

  it('anchors rendered KaTeX itself instead of the surrounding formula block', () => {
    const html = `
      <html><body data-page-id="page">
        <main data-block-id="content" data-role="content">
          <div data-block-id="formula-card">
            <span class="katex">
              <span class="katex-mathml">
                <math><semantics><mrow></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math>
              </span>
              <span class="katex-html">x2</span>
            </span>
          </div>
        </main>
      </body></html>
    `

    const result = ensureElementAnchorInHtml(html, {
      pageId: 'page',
      selector: 'body[data-page-id="page"] .katex',
      elementTag: 'span'
    })

    expect(result.selector).toBe(`body[data-page-id="page"] [data-block-id="${result.blockId}"]`)
    expect(result.html).toContain(`<span class="katex" data-block-id="${result.blockId}">`)
    expect(result.html).toContain('<div data-block-id="formula-card">')
  })

  it('materializes a runtime KaTeX formula when the source only has LaTeX delimiters', () => {
    const html = `
      <html><body data-page-id="page">
        <main data-block-id="content" data-role="content">
          <div data-block-id="formula-card">\\( a^2 + b^2 = c^2 \\)</div>
        </main>
      </body></html>
    `

    const result = ensureElementAnchorInHtml(html, {
      pageId: 'page',
      selector: 'body[data-page-id="page"] .ppt-page-root .katex',
      elementTag: 'span',
      formula: {
        latex: 'a^2 + b^2 = c^2',
        html: '<span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">a^2 + b^2 = c^2</annotation></semantics></math></span><span class="katex-html">a2+b2=c2</span></span>',
        displayMode: false
      }
    })

    expect(result.selector).toBe(`body[data-page-id="page"] [data-block-id="${result.blockId}"]`)
    expect(result.html).toContain(`<span class="katex" data-ppt-formula-latex="a^2 + b^2 = c^2"`)
    expect(result.html).toContain(`data-block-id="${result.blockId}"`)
    expect(result.html).not.toContain('\\( a^2 + b^2 = c^2 \\)')
  })

})

describe('patchDraggedElementStyle chart sizing', () => {
  it('does not persist canvas child width or height when resizing a chart frame', () => {
    const html = `
      <html><body data-page-id="page">
        <div data-block-id="chart" class="ppt-chart-frame">
          <canvas id="chart-canvas" class="h-full w-full"></canvas>
        </div>
      </body></html>
    `

    const result = patchDraggedElementStyle(
      html,
      'body[data-page-id="page"] [data-block-id="chart"]',
      0,
      0,
      500,
      320,
      [{ path: [0], width: 500, height: 300 }],
      false
    )

    expect(result).toContain('width: 500px; height: 320px')
    expect(result).toContain('<canvas id="chart-canvas" class="h-full w-full"></canvas>')
    expect(result).not.toContain('height: 300px')
  })
})

describe('patchGenericElementProperties rich text', () => {
  it('updates inline rich text without flattening spans', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text"><span style="color:#FB4526" data-block-id="text-1">南欧</span>旧文字</p>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="text"]',
      {
        html: '<span style="color:#FB4526" data-block-id="text-1">南欧</span>新文字'
      }
    )

    expect(result).toContain(
      '<span style="color:#FB4526" data-block-id="text-1">南欧</span>新文字'
    )
  })

  it('strips editor-only zoom from rich text before writing html', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text">旧文字</p>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="text"]',
      {
        html: '<span style="zoom: 0.5; color: #FB4526; font-size: 60px">新文字</span>'
      }
    )

    expect(result).toContain('<span style="color: #FB4526; font-size: 60px">新文字</span>')
    expect(result).not.toContain('zoom')
  })

  it('can update a bare text node by parent selector and child node index', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text"><span data-block-id="text-1">南欧</span>旧文字</p>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="text"]',
      {
        text: '新文字',
        textTarget: {
          type: 'text-node',
          parentSelector: 'body[data-page-id="page"] [data-block-id="text"]',
          textNodeIndex: 1
        }
      }
    )

    expect(result).toContain('<span data-block-id="text-1">南欧</span>新文字')
  })
})

describe('patchGenericElementProperties formula', () => {
  const formulaHtml =
    '<span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span>'

  it('updates an inline source formula without replacing surrounding text', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text">函数 \\(x^2\\) 的导数</p>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="text"]',
      {
        formula: {
          latex: 'x^3',
          html: formulaHtml,
          displayMode: false,
          originalLatex: 'x^2'
        }
      }
    )

    expect(result).toContain('函数 \\(x^3\\) 的导数')
  })

  it('persists display mode changes by rewriting formula delimiters', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text">函数 \\(x^2\\) 的导数</p>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="text"]',
      {
        formula: {
          latex: 'x^2',
          html: formulaHtml,
          displayMode: true,
          originalLatex: 'x^2'
        }
      }
    )

    expect(result).toContain('函数 \\[x^2\\] 的导数')
    expect(result).not.toContain('\\(x^2\\)')
  })

  it('does not clear surrounding text when source formula matching fails', () => {
    const html = `
      <html><body data-page-id="page">
        <p data-block-id="text">函数 \\(x^2\\) 与 \\(y^2\\) 的导数</p>
      </body></html>
    `

    expect(() =>
      patchGenericElementProperties(html, 'body[data-page-id="page"] [data-block-id="text"]', {
        formula: {
          latex: 'z^2',
          html: formulaHtml,
          displayMode: false,
          originalLatex: 'missing'
        }
      })
    ).toThrow('公式定位失败')
  })

  it('writes rendered KaTeX into an empty formula host', () => {
    const html = `
      <html><body data-page-id="page">
        <div data-block-id="formula"></div>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="formula"]',
      {
        formula: {
          latex: 'x^2',
          html: formulaHtml,
          displayMode: true,
          originalLatex: ''
        }
      }
    )

    expect(result).toContain('class="katex"')
    expect(result).toContain('data-ppt-formula-latex="x^2"')
    expect(result).toContain('data-ppt-formula-display="true"')
  })

  it('strips unsafe markup from rendered formula html', () => {
    const html = `
      <html><body data-page-id="page">
        <div data-block-id="formula"></div>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="formula"]',
      {
        formula: {
          latex: 'x^2',
          html: '<span class="katex" onclick="alert(1)"><script>alert(1)</script><span style="background:url(javascript:alert(1))">x2</span></span>',
          displayMode: false,
          originalLatex: ''
        }
      }
    )

    expect(result).toContain('class="katex"')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('javascript:')
  })

  it('does not persist transient editor classes in formula html', () => {
    const html = `
      <html><body data-page-id="page">
        <div data-block-id="formula"></div>
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="formula"]',
      {
        formula: {
          latex: 'x^2',
          html: '<span class="katex ppt-edit-mode-selected ppt-inspector-highlight"><span class="katex-html">x2</span></span>',
          displayMode: false,
          originalLatex: ''
        }
      }
    )

    expect(result).toContain('class="katex"')
    expect(result).not.toContain('ppt-edit-mode-selected')
    expect(result).not.toContain('ppt-inspector-highlight')
  })
})

describe('patchGenericElementProperties layer', () => {
  it('persists negative z-index and makes static media positionable', () => {
    const html = `
      <html><body data-page-id="page">
        <img data-block-id="media" src="./images/a.png" style="width: 100px">
      </body></html>
    `

    const result = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="media"]',
      {
        style: { zIndex: -1 }
      }
    )

    expect(result).toContain('width: 100px; position: relative; z-index: -1')
  })
})
