/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/Tooltip'
import { PageSidebar } from '../../../src/renderer/src/components/session-detail/sidebar/PageSidebar'
import { useEditHistoryStore } from '../../../src/renderer/src/store/editHistoryStore'
import { useEditSessionStore } from '../../../src/renderer/src/store/editSessionStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('../../../src/renderer/src/components/session-detail/hooks/usePreviewWindow', () => ({
  usePreviewWindow: () => ({
    activePreviewIds: new Set<string>(),
    viewportRef: { current: null },
    schedulePreviewWindowUpdate: vi.fn()
  })
}))

vi.mock('../../../src/renderer/src/components/session-detail/sidebar/PageThumbnail', () => ({
  PageThumbnail: ({
    page,
    onSelect
  }: {
    page: { id: string; title: string }
    onSelect?: (pageId: string) => void
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': `page-thumbnail-${page.id}`,
        onClick: () => onSelect?.(page.id)
      },
      page.title
    )
}))

const controllerMock = vi.hoisted(() => ({
  pages: [
    {
      id: 'page-1',
      pageId: 'page-1',
      pageNumber: 1,
      title: 'Page 1',
      contentOutline: 'Outline 1',
      html: '<html></html>',
      sourceUrl: 'session://page-1.html'
    },
    {
      id: 'page-2',
      pageId: 'page-2',
      pageNumber: 2,
      title: 'Page 2',
      contentOutline: 'Outline 2',
      html: '<html></html>',
      sourceUrl: 'session://page-2.html'
    }
  ]
}))

vi.mock('../../../src/renderer/src/components/session-detail/sidebar/usePageSidebarController', () => ({
  usePageSidebarController: () => ({
    pages: controllerMock.pages,
    disabled: false,
    pageManagementDisabled: false,
    collapsed: false,
    onToggleCollapsed: vi.fn()
  })
}))

async function renderSidebar(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(
        TooltipProvider,
        { delayDuration: 0 },
        React.createElement(PageSidebar, { sessionId: 'session-1' })
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

describe('PageSidebar page switching', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionDetailUiStore.setState({
      selectedPageId: 'page-1',
      workspaceTab: 'edit',
      interactionMode: 'edit'
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns to preview workspace when selecting another page', async () => {
    const { container, root } = await renderSidebar()

    try {
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-testid="page-thumbnail-page-2"]')?.click()
      })

      expect(useSessionDetailUiStore.getState()).toMatchObject({
        selectedPageId: 'page-2',
        workspaceTab: 'preview'
      })
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('keeps the current workspace tab when starting outline editing for another page', async () => {
    const { container, root } = await renderSidebar()

    try {
      await act(async () => {
        Array.from(container.querySelectorAll('button')).find(
          (button) => button.textContent === 'sessionDetail.outlineTab'
        )?.click()
      })
      await act(async () => {
        const editButtons = container.querySelectorAll<HTMLButtonElement>(
          '[aria-label="pageManagement.editPageOutline"]'
        )
        editButtons[1]?.click()
      })

      expect(useSessionDetailUiStore.getState()).toMatchObject({
        selectedPageId: 'page-2',
        workspaceTab: 'edit'
      })
    } finally {
      await cleanupRoot(root, container)
    }
  })
})
