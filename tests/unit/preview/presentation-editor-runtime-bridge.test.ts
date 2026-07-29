import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { buildEditModeInjectScript } from '@arcsin1/presentation-editor-runtime'

type EditorWindow = Window & {
  __pptEditModeInspectElement: (selector: string) => {
    attributes: Record<string, string>
    inlineStyle: Record<string, { value: string; priority: string }>
    computedStyle: Record<string, string>
  } | null
  __pptEditModeApplyOperations: (
    selector: string,
    operations: unknown[]
  ) => Array<{ ok: boolean; errorCode?: string }>
  __pptEditModeRestoreSelection: (selector: string) => boolean
  __pptEditModeClearSelection: () => void
}

describe('presentation editor runtime bridge', () => {
  it('keeps legacy edit-mode selection while exposing full inspection and controlled generic edits', () => {
    const window = new Window({ url: 'http://localhost/page.html' }) as EditorWindow & {
      ResizeObserver: typeof ResizeObserver
      eval: (code: string) => void
    }
    const { document } = window
    document.body.setAttribute('data-page-id', 'page')
    document.body.innerHTML = `
      <main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="1000" data-ppt-height="600">
        <main data-block-id="content" data-role="content">
          <p id="title" data-block-id="title" aria-label="Original" style="letter-spacing: 0.02em">Hello</p>
        </main>
      </main>
    `
    const title = document.querySelector('#title') as HTMLElement
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return this === title
        ? ({ left: 20, top: 30, width: 240, height: 60, right: 260, bottom: 90 } as DOMRect)
        : ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 } as DOMRect)
    }
    window.HTMLElement.prototype.getClientRects = function () {
      return [this.getBoundingClientRect()]
    }
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    window.eval(buildEditModeInjectScript())
    const selector = 'body[data-page-id="page"] [data-block-id="title"]'

    const inspector = window.__pptEditModeInspectElement(selector)
    expect(inspector?.attributes).toMatchObject({
      id: 'title',
      'data-block-id': 'title',
      'aria-label': 'Original'
    })
    expect(inspector?.inlineStyle['letter-spacing']).toEqual({ value: '0.02em', priority: '' })
    expect(inspector?.computedStyle.display).toBeTruthy()

    expect(
      window.__pptEditModeApplyOperations(selector, [
        { type: 'set-attribute', name: 'data-theme', value: 'dark' },
        { type: 'set-style', property: 'letter-spacing', value: '0.08em', priority: 'important' },
        { type: 'set-attribute', name: 'onclick', value: 'alert(1)' }
      ])
    ).toMatchObject([
      { ok: true },
      { ok: true },
      { ok: false, errorCode: 'PROTECTED_ATTRIBUTE' }
    ])
    expect(title.getAttribute('data-theme')).toBe('dark')
    expect(title.style.getPropertyValue('letter-spacing')).toBe('0.08em')
    expect(title.style.getPropertyPriority('letter-spacing')).toBe('important')

    expect(window.__pptEditModeRestoreSelection(selector)).toBe(true)
    expect(title.classList.contains('arcsin1-presentation-editor-selected')).toBe(true)
    expect(title.getAttribute('data-arcsin1-presentation-editor-selected')).toBe('true')

    window.__pptEditModeClearSelection()
    expect(title.hasAttribute('data-arcsin1-presentation-editor-selected')).toBe(false)
  })
})
