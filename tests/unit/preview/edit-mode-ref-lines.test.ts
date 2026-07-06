import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import {
  EDIT_MODE_CONSOLE_PREFIX,
  buildEditModeInjectScript
} from '../../../src/renderer/src/components/preview/edit-mode-script'

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
})

describe('preview edit mode reference lines', () => {
  it('supports element, permanent-guide, and grid snapping inside the webview guest', () => {
    const window = new Window({ url: 'http://localhost/page.html' }) as unknown as Window & {
      ResizeObserver: typeof ResizeObserver
      eval: (code: string) => void
    }
    const { document } = window
    const logs: string[] = []

    document.body.setAttribute('data-page-id', 'page')
    document.body.innerHTML = `
      <main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1000" data-ppt-height="600">
        <main data-block-id="content" data-role="content">
          <div data-block-id="drag">Drag</div>
          <div data-block-id="target">Target</div>
        </main>
      </main>
    `

    const root = document.querySelector('.ppt-page-root') as HTMLElement
    const content = document.querySelector('[data-block-id="content"]') as HTMLElement
    const drag = document.querySelector('[data-block-id="drag"]') as HTMLElement
    const target = document.querySelector('[data-block-id="target"]') as HTMLElement

    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this === root || this === content) return rect(0, 0, 1000, 600)
      if (this === target) return rect(300, 100, 100, 100)
      if (this === drag) {
        const x = Number.parseFloat(drag.style.getPropertyValue('--ppt-drag-x')) || 0
        const y = Number.parseFloat(drag.style.getPropertyValue('--ppt-drag-y')) || 0
        return rect(100 + x, 100 + y, 100, 100)
      }
      return rect(0, 0, 0, 0)
    }
    window.HTMLElement.prototype.getClientRects = function () {
      return [this.getBoundingClientRect()]
    }

    document.elementFromPoint = () => drag
    document.elementsFromPoint = () => [drag, content, root]
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    window.console.log = (value?: unknown) => logs.push(String(value))

    window.eval(buildEditModeInjectScript())
    const editWindow = window as unknown as Window & {
      __pptEditModeReadSnapPoints: () => { x: number[]; y: number[] }
      __pptEditModeSetSnapSettings: (settings: unknown) => void
    }
    const dragFromTo = (startX: number, endX: number): void => {
      drag.dispatchEvent(
        new window.PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: startX,
          clientY: 110,
          pointerId: 1
        })
      )
      for (let index = 0; index < 2; index += 1) {
        drag.dispatchEvent(
          new window.PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            clientX: endX,
            clientY: 110,
            pointerId: 1
          })
        )
      }
      drag.dispatchEvent(
        new window.PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: endX,
          clientY: 110,
          pointerId: 1
        })
      )
    }

    expect(editWindow.__pptEditModeReadSnapPoints().x).toEqual(
      expect.arrayContaining([300, 350, 400])
    )
    dragFromTo(110, 306)

    expect(drag.style.getPropertyValue('--ppt-drag-x')).toBe('200.0px')
    expect(drag.classList.contains('ppt-edit-mode-selected')).toBe(false)
    expect(document.querySelector('[data-ppt-edit-guide="vertical"]')).not.toBeNull()
    expect(
      (document.querySelector('[data-ppt-edit-guide="vertical"]') as HTMLElement).style.display
    ).toBe('none')

    const movedLog = logs.findLast((item) =>
      item.startsWith(`${EDIT_MODE_CONSOLE_PREFIX}{"type":"moved"`)
    )
    expect(movedLog).toBeTruthy()
    expect(JSON.parse(String(movedLog).slice(EDIT_MODE_CONSOLE_PREFIX.length))).toMatchObject({
      selector: 'body[data-page-id="page"] [data-block-id="drag"]',
      x: 200,
      deltaX: 200,
      visualX: 300
    })

    editWindow.__pptEditModeSetSnapSettings({
      enabled: true,
      guides: { vertical: [500], horizontal: [] },
      grid: { enabled: false, size: 20 }
    })
    dragFromTo(310, 506)
    expect(drag.style.getPropertyValue('--ppt-drag-x')).toBe('400.0px')

    editWindow.__pptEditModeSetSnapSettings({
      enabled: true,
      guides: { vertical: [], horizontal: [] },
      grid: { enabled: true, size: 100 }
    })
    dragFromTo(510, 607)
    expect(drag.style.getPropertyValue('--ppt-drag-x')).toBe('500.0px')
  })

  it('fails loudly when the page root is missing slide size metadata', () => {
    const window = new Window({ url: 'http://localhost/page.html' }) as unknown as Window & {
      ResizeObserver: typeof ResizeObserver
      eval: (code: string) => void
    }
    const { document } = window

    document.body.setAttribute('data-page-id', 'page')
    document.body.innerHTML = `
      <main class="ppt-page-root" data-ppt-guard-root="1">
        <main data-block-id="content" data-role="content">
          <div data-block-id="target">Target</div>
        </main>
      </main>
    `

    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return rect(0, 0, 1000, 600)
    }
    window.HTMLElement.prototype.getClientRects = function () {
      return [this.getBoundingClientRect()]
    }
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    window.eval(buildEditModeInjectScript())
    const editWindow = window as unknown as Window & {
      __pptEditModeReadSnapPoints: () => { x: number[]; y: number[] }
    }

    expect(() => editWindow.__pptEditModeReadSnapPoints()).toThrow(
      'missing page root slide size metadata'
    )
  })
})
