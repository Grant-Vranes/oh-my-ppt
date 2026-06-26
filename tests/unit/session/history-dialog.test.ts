/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { HistoryDialog } from '../../../src/renderer/src/components/session-detail/modal/HistoryDialog'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionStore } from '../../../src/renderer/src/store/sessionStore'

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
  listHistoryVersions: vi.fn(),
  rollbackToHistoryVersion: vi.fn()
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    listHistoryVersions: ipcMocks.listHistoryVersions,
    rollbackToHistoryVersion: ipcMocks.rollbackToHistoryVersion
  }
}))

vi.mock('@renderer/i18n', () => ({
  useT: () => (key: string) => key
}))

async function renderDialog(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(HistoryDialog, { sessionId: 'session-1' }))
    await Promise.resolve()
  })
  return { root, container }
}

async function cleanup(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('HistoryDialog', () => {
  beforeEach(() => {
    ipcMocks.listHistoryVersions.mockReset()
    ipcMocks.rollbackToHistoryVersion.mockReset()
    useGenerateStore.getState().reset()
    useSessionStore.getState().resetRuntimeState()
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionDetailUiStore.getState().setHistoryDialogOpen(true)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uses a max-height scrolling panel and shows at most 20 history versions', async () => {
    ipcMocks.listHistoryVersions.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        id: `history-${index + 1}`,
        title: `Version ${index + 1}`,
        description: `Change ${index + 1}`,
        createdAt: 1_700_000_000 + index,
        operation: 'edit',
        changedPages: [],
        isCurrent: index === 0,
        isRestorable: index !== 0
      }))
    )

    const { root, container } = await renderDialog()

    try {
      expect(ipcMocks.listHistoryVersions).toHaveBeenCalledWith({
        sessionId: 'session-1',
        limit: 20
      })

      const panel = container.querySelector('.fixed')?.firstElementChild as HTMLElement | null
      expect(panel?.className).toContain('max-h-[min(640px,78vh)]')
      expect(panel?.className).not.toContain(' h-[min(640px,78vh)]')
      expect(panel?.querySelector('.overflow-y-auto')).toBeTruthy()

      const renderedTitles = Array.from(container.querySelectorAll('p'))
        .map((node) => node.textContent || '')
        .filter((text) => /^Version \d+$/.test(text))
      expect(renderedTitles).toHaveLength(20)
      expect(renderedTitles).toContain('Version 20')
      expect(renderedTitles).not.toContain('Version 21')
    } finally {
      await cleanup(root, container)
    }
  })
})
