/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useChatPanelController } from '../../../src/renderer/src/components/session-detail/hooks/useChatPanelController'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'
import { useToastStore } from '../../../src/renderer/src/store/toastStore'
import type { ChatPanelController } from '../../../src/renderer/src/types/session-detail'

const {
  assessPageEditMock,
  cancelDeckEditMock,
  cancelGenerateMock,
  cancelPageEditMock,
  getDeckEditStateMock,
  getPageEditStateMock,
  startPageEditMock,
  toastWarningMock
} = vi.hoisted(() => ({
  assessPageEditMock: vi.fn(),
  cancelDeckEditMock: vi.fn().mockResolvedValue({ success: true }),
  cancelGenerateMock: vi.fn().mockResolvedValue({ success: true }),
  cancelPageEditMock: vi.fn().mockResolvedValue({ success: true }),
  getDeckEditStateMock: vi.fn(),
  getPageEditStateMock: vi.fn(),
  startPageEditMock: vi.fn(),
  toastWarningMock: vi.fn()
}))

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    assessPageEdit: assessPageEditMock,
    cancelDeckEdit: cancelDeckEditMock,
    cancelPageEdit: cancelPageEditMock,
    cancelGenerate: cancelGenerateMock,
    getDeckEditState: getDeckEditStateMock,
    getPageEditState: getPageEditStateMock,
    startPageEdit: startPageEditMock
  }
}))

type Controller = ReturnType<typeof useChatPanelController>

let latest: Controller | null = null

function Harness(): null {
  latest = useChatPanelController('session-1')
  return null
}

async function renderHarness(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Harness))
  })
  return { root, container }
}

async function cleanup(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('useChatPanelController page edit scope', () => {
  beforeEach(() => {
    latest = null
    assessPageEditMock.mockReset()
    cancelDeckEditMock.mockClear()
    cancelPageEditMock.mockClear()
    cancelGenerateMock.mockClear()
    getDeckEditStateMock.mockReset()
    getPageEditStateMock.mockReset()
    startPageEditMock.mockReset()
    toastWarningMock.mockClear()
    useToastStore.setState({ warning: toastWarningMock })
    useGenerateStore.getState().reset()
    useGenerateStore.getState().setPages([
      {
        id: 'page-record-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Page 1',
        html: '<div>Page 1</div>',
        htmlPath: '/tmp/page-1.html'
      },
      {
        id: 'page-record-2',
        pageId: 'page-2',
        pageNumber: 2,
        title: 'Page 2',
        html: '<div>Page 2</div>',
        htmlPath: '/tmp/page-2.html'
      }
    ])
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionDetailUiStore.setState({
      selectedPageId: 'page-record-1',
      chatType: 'page'
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('leaves the other page AI panel available after switching away from an active page edit', async () => {
    const { root, container } = await renderHarness()

    try {
      await act(async () => {
        useGenerateStore.getState().startPageEditPlanning('session-1', 'page-1')
        useGenerateStore.getState().setPendingPageEditPlan('session-1', {
          targetPageId: 'page-1',
          targetPageNumber: 1,
          payload: {
            sessionId: 'session-1',
            userMessage: 'Improve the page title',
            type: 'page',
            chatType: 'page',
            selectedPageId: 'page-1'
          },
          plan: {
            intent: 'content',
            target: 'Page title',
            summary: 'Make the title more concise.',
            changes: ['Shorten the title'],
            confirmationQuestion: 'Apply this change?'
          }
        })
        useGenerateStore.getState().finishPageEditPlanning('session-1')
        useGenerateStore.getState().startPageEdit('session-1', { pageId: 'page-1', pageNumber: 1 })
        useSessionDetailUiStore.getState().setSelectedPageId('page-record-2')
      })

      expect(latest).toMatchObject<Partial<ChatPanelController>>({
        isGenerating: false,
        isPageEditing: false,
        isPlanningPageEdit: false,
        pendingPageEditPlan: null,
        progress: null
      })
    } finally {
      await cleanup(root, container)
    }
  })

  it('clears a pending plan without cancelling an unrelated generation', async () => {
    const { root, container } = await renderHarness()

    try {
      await act(async () => {
        useGenerateStore.getState().setPendingPageEditPlan('session-1', {
          targetPageId: 'page-1',
          targetPageNumber: 1,
          payload: {
            sessionId: 'session-1',
            userMessage: 'Update the title',
            type: 'page',
            chatType: 'page',
            selectedPageId: 'page-1'
          },
          plan: {
            intent: 'content',
            target: 'Title',
            summary: 'Update the title copy.',
            changes: ['Replace the title'],
            confirmationQuestion: 'Apply this change?'
          }
        })
      })

      await act(async () => {
        await latest?.cancel()
      })

      expect(useGenerateStore.getState().pageEditPlanning['session-1']?.pendingPlan).toBeNull()
      expect(cancelGenerateMock).not.toHaveBeenCalled()
      expect(cancelPageEditMock).not.toHaveBeenCalled()
    } finally {
      await cleanup(root, container)
    }
  })

  it('keeps the other page input intact and explains why its AI edit cannot start yet', async () => {
    const { root, container } = await renderHarness()

    try {
      await act(async () => {
        useGenerateStore.getState().startPageEdit('session-1', { pageId: 'page-1', pageNumber: 1 })
        useSessionDetailUiStore.setState({
          selectedPageId: 'page-record-2',
          chatType: 'page',
          input: 'Update the second page title'
        })
      })

      await expect(latest?.send('model-1')).resolves.toBe(false)
      expect(assessPageEditMock).not.toHaveBeenCalled()
      expect(useSessionDetailUiStore.getState().input).toBe('Update the second page title')
      expect(toastWarningMock).toHaveBeenCalledWith('sessionDetail.pageEditOtherPageBusy')
    } finally {
      await cleanup(root, container)
    }
  })

  it('does not clear a request when another job starts while page intent is being assessed', async () => {
    const { root, container } = await renderHarness()
    let resolveAssessment: ((value: Record<string, unknown>) => void) | undefined

    assessPageEditMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAssessment = resolve
        })
    )

    try {
      await act(async () => {
        useSessionDetailUiStore.setState({ input: 'Make this title concise' })
      })
      const sendPromise = latest?.send('model-1')
      await act(async () => {
        await Promise.resolve()
        useGenerateStore.setState({ isGenerating: true })
        resolveAssessment?.({
          requiresConfirmation: false,
          plan: {
            intent: 'content',
            target: 'Title',
            summary: 'Shorten the title',
            changes: ['Shorten title copy'],
            confirmationQuestion: 'Apply this edit?'
          },
          reply: 'Ready',
          targetPageId: 'page-1',
          targetPageNumber: 1
        })
      })

      await expect(sendPromise).resolves.toBe(false)
      expect(startPageEditMock).not.toHaveBeenCalled()
      expect(useSessionDetailUiStore.getState().input).toBe('Make this title concise')
      expect(toastWarningMock).toHaveBeenCalledWith('sessionDetail.pageEditPlanWaitForJob')
    } finally {
      await cleanup(root, container)
    }
  })
})
