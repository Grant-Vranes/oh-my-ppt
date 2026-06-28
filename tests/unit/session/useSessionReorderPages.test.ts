/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useSessionReorderPages } from '../../../src/renderer/src/components/session-detail/hooks/useSessionReorderPages'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'

const ipcMocks = vi.hoisted(() => ({
  reorderSessionPages: vi.fn(),
  clearSpeechScript: vi.fn()
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    reorderSessionPages: ipcMocks.reorderSessionPages,
    clearSpeechScript: ipcMocks.clearSpeechScript
  }
}))

vi.mock('@renderer/i18n', () => ({
  useT: () => (key: string) => key
}))

type ReorderHook = ReturnType<typeof useSessionReorderPages>

let latest: ReorderHook | null = null

function Harness({ sessionId }: { sessionId: string }): null {
  latest = useSessionReorderPages(sessionId)
  return null
}

async function renderHarness(sessionId = 'session-1'): Promise<{
  root: Root
  container: HTMLDivElement
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Harness, { sessionId }))
  })
  return { root, container }
}

async function unmount(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('useSessionReorderPages', () => {
  beforeEach(() => {
    latest = null
    ipcMocks.reorderSessionPages.mockReset()
    ipcMocks.clearSpeechScript.mockReset()
    ipcMocks.clearSpeechScript.mockResolvedValue(undefined)
    useGenerateStore.getState().reset()
    useSessionDetailUiStore.getState().resetForSessionChange()
  })

  it('commits a reordered page list and keeps the selected page', async () => {
    ipcMocks.reorderSessionPages.mockResolvedValue({
      ok: true,
      generatedPages: [
        {
          id: 'page-b',
          pageId: 'page-b',
          pageNumber: 1,
          title: 'Page B',
          html: '',
          htmlPath: '/page-b.html'
        },
        {
          id: 'page-a',
          pageId: 'page-a',
          pageNumber: 2,
          title: 'Page A',
          html: '',
          htmlPath: '/page-a.html'
        }
      ],
      selectedPageId: 'page-b'
    })

    const { root, container } = await renderHarness()
    try {
      let ok = false
      await act(async () => {
        ok = (await latest?.reorder(['page-b', 'page-a'], 'page-b')) ?? false
      })

      expect(ok).toBe(true)
      expect(ipcMocks.reorderSessionPages).toHaveBeenCalledWith({
        sessionId: 'session-1',
        orderedPageIds: ['page-b', 'page-a'],
        selectedPageId: 'page-b'
      })
      expect(useGenerateStore.getState().currentPages.map((page) => page.id)).toEqual([
        'page-b',
        'page-a'
      ])
      expect(useSessionDetailUiStore.getState().selectedPageId).toBe('page-b')
      expect(useSessionDetailUiStore.getState().previewKey).toBe(0)
      expect(ipcMocks.clearSpeechScript).toHaveBeenCalledWith('session-1')
    } finally {
      await unmount(root, container)
    }
  })
})
