/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useWorkspaceRibbonController } from '../../../src/renderer/src/components/session-detail/hooks/useWorkspaceRibbonController'
import {
  useEditHistoryStore,
  useEditSessionStore,
  useGenerateStore,
  useSessionDetailUiStore
} from '@renderer/store'

const toastInfo = vi.hoisted(() => vi.fn())

vi.mock('@renderer/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('@renderer/store', async () => {
  const actual = await vi.importActual<typeof import('@renderer/store')>('@renderer/store')
  return {
    ...actual,
    useToastStore: Object.assign(
      (selector: unknown) => {
        if (typeof selector === 'function') {
          return selector({
            info: toastInfo
          })
        }
        return actual.useToastStore.getState()
      },
      actual.useToastStore
    )
  }
})

type Controller = ReturnType<typeof useWorkspaceRibbonController>

let latest: Controller | null = null

function Harness(): null {
  latest = useWorkspaceRibbonController(false)
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

describe('useWorkspaceRibbonController', () => {
  beforeEach(() => {
    latest = null
    toastInfo.mockReset()
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
    useGenerateStore.getState().reset()
    useGenerateStore.getState().setPages([
      {
        id: 'page-record-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Page 1',
        html: '<div>Page</div>',
        htmlPath: '/tmp/page-1.html'
      }
    ])
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionDetailUiStore.setState({
      selectedPageId: 'page-record-1',
      workspaceTab: 'preview',
      interactionMode: 'preview'
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows a guidance toast when switching to animation mode', async () => {
    const { root, container } = await renderHarness()

    try {
      await act(async () => {
        latest?.activateTab('animation')
      })

      expect(useSessionDetailUiStore.getState()).toMatchObject({
        workspaceTab: 'animation',
        interactionMode: 'animation-select'
      })
      expect(toastInfo).toHaveBeenCalledWith('sessionDetail.animationModeToast')
    } finally {
      await cleanup(root, container)
    }
  })
})
