/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/Tooltip'
import { SessionToolbar } from '../../../src/renderer/src/components/session-detail/toolbar/SessionToolbar'
import { useSessionDetailRuntimeStore } from '../../../src/renderer/src/store'

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('../../../src/renderer/src/components/session-detail/toolbar/useSessionToolbarController', () => ({
  useSessionToolbarController: () => ({
    hasPages: true,
    isGenerating: false,
    historyDisabled: false,
    selectedPageHasPendingEdits: false,
    canPreview: true,
    canRevealFile: true,
    sessionTitle: 'Quarterly Plan',
    saveTemplateOpen: false,
    savingTemplate: false,
    saveAsNewSessionOpen: false,
    savingAsNewSession: false,
    saveAsNewSessionDisabled: false,
    defaultTemplateName: 'Quarterly Plan',
    defaultSaveAsNewSessionName: 'Quarterly Plan copy',
    setSaveTemplateOpen: vi.fn(),
    setSaveAsNewSessionOpen: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleSaveAsNewSession: vi.fn(),
    exportActions: {
      canExportPptx: true,
      exportPptx: vi.fn(),
      exportPng: vi.fn(),
      exportVideo: vi.fn(),
      exportPdf: vi.fn(),
      exportSlidePack: vi.fn(),
      exportSessionZip: vi.fn(),
      openProjectPreview: vi.fn(),
      openPresentation: vi.fn(),
      revealSelectedPageFile: vi.fn()
    },
    openHistory: vi.fn()
  })
}))

async function renderToolbar(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      React.createElement(
        TooltipProvider,
        { delayDuration: 0 },
        React.createElement(
          'header',
          { className: 'app-drag-region app-titlebar' },
          React.createElement(
            'div',
            { className: 'flex-1' },
            React.createElement(SessionToolbar, { sessionId: 'session-1' })
          )
        )
      )
    )
  })

  return { container, root }
}

async function cleanupRoot(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('SessionToolbar titlebar drag region', () => {
  afterEach(() => {
    useSessionDetailRuntimeStore.getState().setWorkspaceRibbonActions(null)
    document.body.innerHTML = ''
  })

  it('keeps title and empty toolbar space draggable while controls opt out', async () => {
    useSessionDetailRuntimeStore.getState().setWorkspaceRibbonActions({
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onSaveCurrentPage: vi.fn(),
      onDiscardAllEdits: vi.fn(),
      onBackToSessions: vi.fn(),
      onAddFromLibrary: vi.fn(),
      onAddFromLocal: vi.fn(),
      onAddText: vi.fn(),
      onAddArtText: vi.fn()
    })
    const { container, root } = await renderToolbar()

    try {
      const title = container.querySelector('.truncate')
      expect(title?.textContent).toBe('Quarterly Plan')
      expect(title?.closest('.app-no-drag')).toBeNull()

      const toolbarHost = title?.closest('.flex-1')
      expect(toolbarHost).toBeTruthy()
      expect(toolbarHost?.classList.contains('app-no-drag')).toBe(false)

      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
      for (const button of buttons) {
        expect(button.classList.contains('app-no-drag')).toBe(true)
      }
    } finally {
      await cleanupRoot(root, container)
    }
  })
})
