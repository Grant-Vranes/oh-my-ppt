import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { buildEditModeInjectScript } from '../../../src/renderer/src/components/preview/edit-mode-script'
import {
  buildIconElementHtml,
  buildShapeElementHtml
} from '../../../src/renderer/src/components/session-detail/workspace/insert-shapes'

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
})

interface EditWindow extends Window {
  __pptEditModeReadSnapshot: (selector: string) => {
    kind: string
    capabilities: string[]
    blockId?: string
    computed: {
      svgPaintColor?: string
    }
  } | null
  __pptEditModeApplyProperties: (
    selector: string,
    patch: { style?: { backgroundColor?: string } }
  ) => void
}

function setupEditWindow(innerHtml: string): EditWindow {
  const window = new Window({ url: 'http://localhost/page.html' }) as unknown as EditWindow & {
    ResizeObserver: typeof ResizeObserver
    eval: (code: string) => void
  }
  const { document } = window

  document.body.setAttribute('data-page-id', 'page')
  document.body.innerHTML = innerHtml

  const root = document.querySelector('.ppt-page-root') as HTMLElement
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === root) return rect(0, 0, 1000, 600)
    // any child element gets a non-zero rect so it passes the >=2px gate
    return rect(100, 100, 240, 120)
  }
  window.HTMLElement.prototype.getClientRects = function () {
    return [this.getBoundingClientRect()]
  }
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  window.eval(buildEditModeInjectScript())
  return window
}

const PAGE_SHELL = `
  <main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1000" data-ppt-height="600">
    <main data-block-id="content" data-role="content"></main>
  </main>
`

describe('edit-mode classify for inserted shape/icon elements', () => {
  it('classifies a shape div as kind=shape with appearance capabilities', () => {
    const fragment = buildShapeElementHtml({
      blockId: 'select-arcsin1-shape0001',
      left: 100,
      top: 100,
      width: 240,
      height: 120,
      zIndex: 12,
      type: 'rounded-rect'
    })
    const window = setupEditWindow(PAGE_SHELL.replace('</main>', `${fragment}</main>`))
    const snapshot = window.__pptEditModeReadSnapshot(
      'body[data-page-id="page"] [data-block-id="select-arcsin1-shape0001"]'
    )
    expect(snapshot).not.toBeNull()
    expect(snapshot!.kind).toBe('shape')
    expect(snapshot!.capabilities).toEqual(expect.arrayContaining(['appearance', 'border']))
    expect(snapshot!.computed.svgPaintColor).toBe('#d4e4c1')
  })

  it('classifies an icon div as kind=shape (visual element) with appearance capabilities', () => {
    const fragment = buildIconElementHtml({
      blockId: 'select-arcsin1-icon00001',
      iconId: 'lightbulb',
      left: 100,
      top: 100,
      width: 96,
      height: 96,
      zIndex: 12
    })
    const window = setupEditWindow(PAGE_SHELL.replace('</main>', `${fragment}</main>`))
    const snapshot = window.__pptEditModeReadSnapshot(
      'body[data-page-id="page"] [data-block-id="select-arcsin1-icon00001"]'
    )
    expect(snapshot).not.toBeNull()
    // icon is also a painted visual element; it must not fall back to "unknown"
    expect(snapshot!.kind).not.toBe('unknown')
    expect(snapshot!.capabilities).toEqual(expect.arrayContaining(['appearance']))
  })

  it('applies appearance color changes to inserted shape svg paint', () => {
    const fragment = buildShapeElementHtml({
      blockId: 'select-arcsin1-shape0002',
      left: 100,
      top: 100,
      width: 240,
      height: 120,
      zIndex: 12,
      type: 'rect'
    })
    const selector = 'body[data-page-id="page"] [data-block-id="select-arcsin1-shape0002"]'
    const window = setupEditWindow(PAGE_SHELL.replace('</main>', `${fragment}</main>`))

    window.__pptEditModeApplyProperties(selector, { style: { backgroundColor: '#ff3366' } })

    const rect = window.document.querySelector(`${selector} svg rect`)
    expect(rect?.getAttribute('fill')).toBe('#ff3366')
    expect(rect?.getAttribute('stroke')).toBe('#ff3366')
  })

  it('applies appearance color changes to inserted icon currentColor', () => {
    const fragment = buildIconElementHtml({
      blockId: 'select-arcsin1-icon00002',
      iconId: 'lightbulb',
      left: 100,
      top: 100,
      width: 96,
      height: 96,
      zIndex: 12
    })
    const selector = 'body[data-page-id="page"] [data-block-id="select-arcsin1-icon00002"]'
    const window = setupEditWindow(PAGE_SHELL.replace('</main>', `${fragment}</main>`))

    window.__pptEditModeApplyProperties(selector, { style: { backgroundColor: '#3366ff' } })

    const icon = window.document.querySelector(selector) as HTMLElement | null
    expect(icon?.style.color).toBe('#3366ff')
  })
})
