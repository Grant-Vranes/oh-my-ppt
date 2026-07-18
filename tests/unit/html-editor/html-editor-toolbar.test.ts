/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

const state = vi.hoisted(() => ({
  revealHtmlFile: vi.fn(async () => ({ ok: true })),
  saveHtmlEdits: vi.fn(async () => ({ saved: false })),
  navigate: vi.fn()
}))

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    revealHtmlFile: state.revealHtmlFile,
    openHtmlInBrowser: vi.fn(async () => ({ ok: true }))
  }
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate
}))

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

import { TooltipProvider } from '../../../src/renderer/src/components/ui/Tooltip'
import { HtmlEditorToolbar } from '../../../src/renderer/src/components/html-editor/HtmlEditorToolbar'
import { useHtmlEditorStore } from '../../../src/renderer/src/store/htmlEditorStore'
import { useHtmlEditStore } from '../../../src/renderer/src/store/htmlEditStore'

const originalSaveHtmlEdits = useHtmlEditStore.getState().save

async function renderToolbar(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(
        TooltipProvider,
        { delayDuration: 0 },
        React.createElement(HtmlEditorToolbar, { onOpenHistory: vi.fn() })
      )
    )
  })
  return { container, root }
}

describe('HtmlEditorToolbar', () => {
  beforeEach(() => {
    state.revealHtmlFile.mockClear()
    state.saveHtmlEdits.mockClear()
    state.navigate.mockClear()
    useHtmlEditStore.getState().reset()
    useHtmlEditStore.setState({ save: state.saveHtmlEdits })
    useHtmlEditorStore.setState({
      docId: 'hedit-1',
      title: 'Landing page',
      sourcePath: '/tmp/landing.html',
      exporting: false
    })
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    useHtmlEditStore.getState().reset()
    useHtmlEditStore.setState({ save: originalSaveHtmlEdits })
    useHtmlEditorStore.getState().reset()
  })

  it('reveals the current HTML working file from the toolbar', async () => {
    const { container, root } = await renderToolbar()
    try {
      const revealButton = container.querySelector<HTMLButtonElement>(
        '[aria-label="htmlEditor.revealFile"]'
      )
      expect(revealButton).toBeTruthy()

      await act(async () => {
        revealButton?.click()
      })

      expect(state.revealHtmlFile).toHaveBeenCalledWith({ docId: 'hedit-1' })
      expect(state.saveHtmlEdits).not.toHaveBeenCalled()
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
