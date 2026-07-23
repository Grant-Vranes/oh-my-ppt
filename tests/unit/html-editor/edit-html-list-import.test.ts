/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  importHtmlFile: vi.fn(),
  listHtmlDocuments: vi.fn(),
  documents: [] as Array<{
    id: string
    title: string
    sourcePath: string | null
    htmlPath: string
    designWidth: number
    updatedAt: number
    thumbnailPath: string | null
  }>
}))

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    importHtmlFile: state.importHtmlFile,
    listHtmlDocuments: state.listHtmlDocuments,
    onHtmlThumbnailChanged: vi.fn(() => () => {})
  }
}))
vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

import { EditHtmlListPage } from '../../../src/renderer/src/pages/edit-html-list'
import { useHtmlEditorStore } from '../../../src/renderer/src/store/htmlEditorStore'

function LocationProbe(): React.JSX.Element {
  const location = useLocation()
  return React.createElement('output', { 'data-current-path': location.pathname })
}

async function renderPage(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/edit-html'] },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(LocationProbe),
          React.createElement(EditHtmlListPage)
        )
      )
    )
  })
  return { container, root }
}

describe('EditHtmlListPage import', () => {
  beforeEach(() => {
    state.documents = []
    state.importHtmlFile.mockReset()
    state.listHtmlDocuments.mockReset()
    state.listHtmlDocuments.mockImplementation(async () => ({ documents: state.documents }))
    useHtmlEditorStore.setState({
      docId: null,
      title: '',
      htmlPath: null,
      sourcePath: null,
      designWidth: 1280,
      html: '',
      importing: false,
      exporting: false,
      error: null,
      documents: []
    })
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    useHtmlEditorStore.getState().reset()
  })

  it('keeps the user on the document list after importing and refreshes the new card', async () => {
    const imported = {
      docId: 'hedit-1',
      title: 'Imported page',
      htmlPath: '/tmp/html-editor/hedit-1/current.html',
      sourcePath: '/tmp/source.html',
      designWidth: 1280,
      html: '<html></html>'
    }
    state.importHtmlFile.mockImplementation(async () => {
      state.documents = [
        {
          id: imported.docId,
          title: imported.title,
          sourcePath: imported.sourcePath,
          htmlPath: imported.htmlPath,
          designWidth: imported.designWidth,
          updatedAt: Date.now(),
          thumbnailPath: null
        }
      ]
      return { cancelled: false, ...imported }
    })

    const { container, root } = await renderPage()
    try {
      await act(async () => {
        await Promise.resolve()
      })
      const importButton = [...container.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('htmlEditor.import')
      )
      expect(importButton).toBeTruthy()

      await act(async () => {
        importButton?.click()
      })

      expect(state.importHtmlFile).toHaveBeenCalledOnce()
      expect(state.listHtmlDocuments).toHaveBeenCalledTimes(2)
      expect(container.textContent).toContain('Imported page')
      expect(
        container.querySelector('[data-current-path]')?.getAttribute('data-current-path')
      ).toBe('/edit-html')
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
