/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useSessionPageActions } from '../../../src/renderer/src/components/session-detail/hooks/useSessionPageActions'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'
import { useSessionStore } from '../../../src/renderer/src/store/sessionStore'
import type { SessionPreviewPage } from '../../../src/renderer/src/components/session-detail/shared/types'

vi.mock('sonner', () => {
  const fn = (() => '') as unknown as {
    success: () => string
    error: () => string
    info: () => string
    warning: () => string
    loading: () => string
    promise: () => void
    dismiss: () => void
  }
  fn.success = fn
  fn.error = fn
  fn.info = fn
  fn.warning = fn
  fn.loading = fn
  fn.promise = () => {}
  fn.dismiss = () => {}
  return { toast: fn }
})

const ipcMocks = vi.hoisted(() => ({
  exportPptx: vi.fn(),
  onExportProgress: vi.fn()
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    exportPptx: ipcMocks.exportPptx,
    onExportProgress: ipcMocks.onExportProgress
  }
}))

vi.mock('@renderer/i18n', () => ({
  useT: () => (key: string) => key
}))

type PageActions = ReturnType<typeof useSessionPageActions>

let latest: PageActions | null = null

function Harness({ sessionId }: { sessionId: string }): null {
  latest = useSessionPageActions(sessionId)
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

async function cleanup(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('useSessionPageActions', () => {
  beforeEach(() => {
    latest = null
    ipcMocks.exportPptx.mockReset()
    ipcMocks.exportPptx.mockResolvedValue({
      success: true,
      cancelled: false,
      path: '/tmp/page.pptx',
      pageCount: 1,
      warnings: []
    })
    ipcMocks.onExportProgress.mockReset()
    ipcMocks.onExportProgress.mockReturnValue(() => undefined)
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionStore.setState({
      currentSession: {
        slideSizeId: 'wide-16-9',
        slideWidth: 1600,
        slideHeight: 900
      } as never
    })
  })

  it('exports the requested page as PPTX', async () => {
    const page = { id: 'page-2', title: 'Page 2' } as SessionPreviewPage
    const { root, container } = await renderHarness()

    try {
      await act(async () => {
        latest?.exportPagePptx(page, { imageOnly: true })
      })

      expect(ipcMocks.exportPptx).toHaveBeenCalledWith('session-1', {
        pageId: 'page-2',
        imageOnly: true
      })
    } finally {
      await cleanup(root, container)
    }
  })
})
