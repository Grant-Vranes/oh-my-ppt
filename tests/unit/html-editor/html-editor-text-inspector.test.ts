/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { HtmlEditorTextInspector } from '../../../src/renderer/src/components/html-editor/HtmlEditorInspectorPanel'
import { EMPTY_ELEMENT_DRAFT } from '../../../src/renderer/src/components/session-detail/element-inspector/elementEditUtils'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/Tooltip'

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('../../../src/renderer/src/components/ui/RichTextBox', () => ({
  RichTextBox: () => null
}))

describe('HtmlEditorTextInspector', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps the rich text editor focused while applying text alignment', async () => {
    const onDraftChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const draft = { ...EMPTY_ELEMENT_DRAFT, text: 'Aligned text', html: 'Aligned text' }

    try {
      await act(async () => {
        root.render(
          React.createElement(
            TooltipProvider,
            { delayDuration: 0 },
            React.createElement(HtmlEditorTextInspector, { draft, onDraftChange })
          )
        )
      })

      const centerButton = container.querySelector<HTMLButtonElement>(
        '[aria-label="sessionDetail.alignCenter"]'
      )
      expect(centerButton).toBeTruthy()

      const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
      centerButton?.dispatchEvent(pointerDown)
      expect(pointerDown.defaultPrevented).toBe(true)

      await act(async () => {
        centerButton?.click()
      })

      expect(onDraftChange).toHaveBeenCalledWith(
        { ...draft, textAlign: 'center' },
        { commit: true, fields: ['textAlign'] }
      )
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
