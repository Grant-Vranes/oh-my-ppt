import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import {
  EDIT_MODE_CONSOLE_PREFIX,
  buildEditModeInjectScript
} from '../../../src/renderer/src/components/preview/edit-mode-script'
import {
  INSPECTOR_CONSOLE_PREFIX,
  buildInspectorInjectScript
} from '../../../src/renderer/src/components/preview/inspector-script'

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>

function setupInlineTextPage(script: string) {
  const window = new Window({ url: 'http://localhost/page.html' }) as unknown as Window & {
    ResizeObserver: typeof ResizeObserver
    eval: (code: string) => void
  }
  const { document } = window
  const logs: string[] = []

  document.body.setAttribute('data-page-id', 'page')
  document.body.innerHTML = `
    <main class="ppt-page-root" data-ppt-guard-root="1">
      <main data-block-id="content" data-role="content">
        <p data-block-id="text">Alpha <span style="color:#FB4526" data-block-id="text-6">red text</span> omega</p>
      </main>
    </main>
  `

  const root = document.querySelector('.ppt-page-root') as HTMLElement
  const content = document.querySelector('[data-block-id="content"]') as HTMLElement
  const paragraph = document.querySelector('[data-block-id="text"]') as HTMLElement
  const redSpan = document.querySelector('[data-block-id="text-6"]') as HTMLElement
  const rects = new Map<Element, Rect>([
    [root, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [content, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [paragraph, { left: 100, top: 100, right: 520, bottom: 130, width: 420, height: 30 }],
    [redSpan, { left: 180, top: 100, right: 260, bottom: 130, width: 80, height: 30 }]
  ])

  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rects.get(this) || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
  window.HTMLElement.prototype.getClientRects = function () {
    return [this.getBoundingClientRect()]
  }

  const mockedDocument = document as Document & {
    caretRangeFromPoint: () => { startContainer: ChildNode | null }
  }
  mockedDocument.elementFromPoint = () => paragraph
  mockedDocument.elementsFromPoint = () => [paragraph, content, root]
  mockedDocument.caretRangeFromPoint = () => ({ startContainer: redSpan.firstChild })
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.console.log = (value?: unknown) => logs.push(String(value))

  window.eval(script)

  return { window, paragraph, logs }
}

function setupOverlappingPage(script: string) {
  const window = new Window({ url: 'http://localhost/page.html' }) as unknown as Window & {
    ResizeObserver: typeof ResizeObserver
    eval: (code: string) => void
  }
  const { document } = window
  const logs: string[] = []

  document.body.setAttribute('data-page-id', 'page')
  document.body.innerHTML = `
    <main class="ppt-page-root" data-ppt-guard-root="1">
      <main data-block-id="content" data-role="content">
        <div style="pointer-events:none" data-block-id="top">top visual layer</div>
        <span data-block-id="behind">small behind layer</span>
      </main>
    </main>
  `

  const root = document.querySelector('.ppt-page-root') as HTMLElement
  const content = document.querySelector('[data-block-id="content"]') as HTMLElement
  const top = document.querySelector('[data-block-id="top"]') as HTMLElement
  const behind = document.querySelector('[data-block-id="behind"]') as HTMLElement
  const rects = new Map<Element, Rect>([
    [root, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [content, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [top, { left: 100, top: 100, right: 420, bottom: 260, width: 320, height: 160 }],
    [behind, { left: 150, top: 120, right: 180, bottom: 145, width: 30, height: 25 }]
  ])

  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rects.get(this) || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
  window.HTMLElement.prototype.getClientRects = function () {
    return [this.getBoundingClientRect()]
  }

  const mockedDocument = document as Document & {
    caretRangeFromPoint: () => null
  }
  mockedDocument.elementFromPoint = () => behind
  mockedDocument.elementsFromPoint = () =>
    Array.from(document.head.querySelectorAll('style')).some((style) =>
      style.textContent?.includes('pointer-events: auto')
    )
      ? [top, behind, content, root]
      : [behind, content, root]
  mockedDocument.caretRangeFromPoint = () => null
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.console.log = (value?: unknown) => logs.push(String(value))

  window.eval(script)

  return { window, eventTarget: behind, logs }
}

function setupMixedInlineParagraphPage(script: string) {
  const window = new Window({ url: 'http://localhost/page.html' }) as unknown as Window & {
    ResizeObserver: typeof ResizeObserver
    eval: (code: string) => void
  }
  const { document } = window
  const logs: string[] = []

  document.body.setAttribute('data-page-id', 'page')
  document.body.innerHTML = `
    <main class="ppt-page-root" data-ppt-guard-root="1">
      <main data-block-id="content" data-role="content">
        <p data-block-id="text"><span data-block-id="text-1">南欧</span>（意、西、希）TFR在1.1-1.2区间徘徊超20年</p>
      </main>
    </main>
  `

  const root = document.querySelector('.ppt-page-root') as HTMLElement
  const content = document.querySelector('[data-block-id="content"]') as HTMLElement
  const paragraph = document.querySelector('[data-block-id="text"]') as HTMLElement
  const span = document.querySelector('[data-block-id="text-1"]') as HTMLElement
  const rects = new Map<Element, Rect>([
    [root, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [content, { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }],
    [paragraph, { left: 100, top: 100, right: 520, bottom: 130, width: 420, height: 30 }],
    [span, { left: 100, top: 100, right: 140, bottom: 130, width: 40, height: 30 }]
  ])

  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rects.get(this) || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  }
  window.HTMLElement.prototype.getClientRects = function () {
    return [this.getBoundingClientRect()]
  }

  const mockedDocument = document as Document & {
    caretRangeFromPoint: () => { startContainer: ChildNode | null }
  }
  mockedDocument.elementFromPoint = () => paragraph
  mockedDocument.elementsFromPoint = () => [paragraph, content, root]
  mockedDocument.caretRangeFromPoint = () => ({ startContainer: paragraph.lastChild })
  window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.console.log = (value?: unknown) => logs.push(String(value))

  window.eval(script)

  return { window, paragraph, logs }
}

function readPayload(logs: string[], prefix: string) {
  const log = logs.findLast((item) => item.startsWith(prefix))
  expect(log).toBeTruthy()
  return JSON.parse(String(log).slice(prefix.length)) as { selector?: string; elementTag?: string }
}

describe('preview text hit selection', () => {
  it('inspector selects the inline span under the text caret point', () => {
    const { window, paragraph, logs } = setupInlineTextPage(buildInspectorInjectScript())

    paragraph.dispatchEvent(
      new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 190,
        clientY: 115
      })
    )

    const payload = readPayload(logs, INSPECTOR_CONSOLE_PREFIX)
    expect(payload.elementTag).toBe('span')
    expect(payload.selector).toBe('body[data-page-id="page"] [data-block-id="text-6"]')
  })

  it('edit mode selects the inline span under the text caret point', () => {
    const { window, paragraph, logs } = setupInlineTextPage(buildEditModeInjectScript())

    paragraph.dispatchEvent(
      new window.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 190,
        clientY: 115,
        pointerId: 1
      })
    )
    paragraph.dispatchEvent(
      new window.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 190,
        clientY: 115,
        pointerId: 1
      })
    )

    const payload = readPayload(logs, EDIT_MODE_CONSOLE_PREFIX)
    expect(payload.elementTag).toBe('span')
    expect(payload.selector).toBe('body[data-page-id="page"] [data-block-id="text-6"]')
  })

  it('edit mode does not treat a long pointer release as a selection click', () => {
    const { window, paragraph, logs } = setupInlineTextPage(buildEditModeInjectScript())

    paragraph.dispatchEvent(
      new window.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 190,
        clientY: 115,
        pointerId: 1
      })
    )
    paragraph.dispatchEvent(
      new window.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 240,
        clientY: 115,
        pointerId: 1
      })
    )

    expect(logs.some((item) => item.startsWith(EDIT_MODE_CONSOLE_PREFIX))).toBe(false)
  })

  it('inspector follows the browser hit-test stack before geometry size', () => {
    const { window, eventTarget, logs } = setupOverlappingPage(buildInspectorInjectScript())

    eventTarget.dispatchEvent(
      new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 160,
        clientY: 130
      })
    )

    const payload = readPayload(logs, INSPECTOR_CONSOLE_PREFIX)
    expect(payload.selector).toBe('body[data-page-id="page"] [data-block-id="top"]')
  })

  it('edit mode follows the browser hit-test stack before geometry size', () => {
    const { window, eventTarget, logs } = setupOverlappingPage(buildEditModeInjectScript())

    eventTarget.dispatchEvent(
      new window.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 160,
        clientY: 130,
        pointerId: 1
      })
    )
    eventTarget.dispatchEvent(
      new window.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 160,
        clientY: 130,
        pointerId: 1
      })
    )

    const payload = readPayload(logs, EDIT_MODE_CONSOLE_PREFIX)
    expect(payload.selector).toBe('body[data-page-id="page"] [data-block-id="top"]')
  })

  it('edit mode treats mixed inline paragraphs as editable text', () => {
    const { window, paragraph, logs } = setupMixedInlineParagraphPage(buildEditModeInjectScript())

    paragraph.dispatchEvent(
      new window.PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 180,
        clientY: 115,
        pointerId: 1
      })
    )
    paragraph.dispatchEvent(
      new window.PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 180,
        clientY: 115,
        pointerId: 1
      })
    )

    const payload = readPayload(logs, EDIT_MODE_CONSOLE_PREFIX) as {
      isText?: boolean
      selector?: string
      text?: string
      html?: string
      textTarget?: {
        parentSelector?: string
        textNodeIndex?: number
        text?: string
      }
    }
    expect(payload.selector).toBe('body[data-page-id="page"] [data-block-id="text"]')
    expect(payload.isText).toBe(true)
    expect(payload.text).toBe('南欧（意、西、希）TFR在1.1-1.2区间徘徊超20年')
    expect(payload.html).toBe(
      '<span data-block-id="text-1">南欧</span>（意、西、希）TFR在1.1-1.2区间徘徊超20年'
    )
    expect(payload.textTarget).toMatchObject({
      parentSelector: 'body[data-page-id="page"] [data-block-id="text"]',
      textNodeIndex: 1,
      text: '（意、西、希）TFR在1.1-1.2区间徘徊超20年'
    })
  })
})
