/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { ElementAnimationPicker } from '../../../src/renderer/src/components/session-detail/workspace/toolbar/tool-rows/ElementAnimationPicker'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const ipcMocks = vi.hoisted(() => ({
  getElementAnimation: vi.fn(),
  setElementAnimation: vi.fn()
}))
const refreshCurrentPreview = vi.hoisted(() => vi.fn())
const translate = vi.hoisted(() => vi.fn((key: string) => key))

vi.mock('@renderer/lib/ipc', () => ({ ipc: ipcMocks }))
vi.mock('@renderer/i18n', () => ({
  useT: () => translate
}))
vi.mock('@renderer/store', async () => {
  const actual = await vi.importActual<typeof import('@renderer/store')>('@renderer/store')
  return {
    ...actual,
    useSessionDetailRuntimeStore: Object.assign(
      (selector: unknown) => {
        if (typeof selector === 'function') {
          return selector({
            refreshCurrentPreview
          })
        }
        return actual.useSessionDetailRuntimeStore.getState()
      },
      actual.useSessionDetailRuntimeStore
    )
  }
})
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useParams: () => ({ id: 'session-1' }) }
})
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

async function renderPicker(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ElementAnimationPicker))
    await Promise.resolve()
  })
  return { root, container }
}

describe('ElementAnimationPicker', () => {
  beforeEach(() => {
    ipcMocks.getElementAnimation.mockReset()
    ipcMocks.setElementAnimation.mockReset()
    refreshCurrentPreview.mockReset()
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
      workspaceTab: 'animation',
      selectedPageId: 'page-record-1',
      interactionMode: 'preview'
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('owns animation selection mode and loads the selected element config', async () => {
    ipcMocks.getElementAnimation.mockResolvedValue({
      animation: {
        type: 'fade-up',
        trigger: 'load',
        durationMs: 450
      }
    })
    const { root, container } = await renderPicker()

    try {
      expect(useSessionDetailUiStore.getState().interactionMode).toBe('animation-select')
      expect(container.textContent).toContain('sessionDetail.elementAnimationSelectTarget')

      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(ipcMocks.getElementAnimation).toHaveBeenCalledWith({
        sessionId: 'session-1',
        htmlPath: '/tmp/page-1.html',
        pageId: 'page-1',
        selector: '[data-block-id="metric"]'
      })
      expect(container.textContent).toContain('home.animationPreferenceOptions.fade-up')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('disables the trigger until an element is selected', async () => {
    const { root, container } = await renderPicker()
    try {
      expect(container.querySelector('button')?.disabled).toBe(true)

      ipcMocks.getElementAnimation.mockResolvedValue({ animation: null })
      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(container.querySelector('button')?.disabled).toBe(false)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('locks type cards until the existing animation is cleared', async () => {
    ipcMocks.getElementAnimation.mockResolvedValue({
      animation: { type: 'pulse', trigger: 'load', durationMs: 600 }
    })
    const { root, container } = await renderPicker()
    try {
      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      // Popover content is portaled to document.body.
      const cards = Array.from(document.querySelectorAll('[data-element-animation]'))
      expect(cards.length).toBeGreaterThan(0)
      expect(cards.every((card) => (card as HTMLButtonElement).disabled)).toBe(true)
      expect(document.body.textContent).toContain('sessionDetail.elementAnimationClearFirstHint')

      ipcMocks.setElementAnimation.mockResolvedValue({ animation: null, changed: true })
      const noneButton = Array.from(document.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('sessionDetail.indexTransitionNone')
      )
      expect(noneButton).toBeTruthy()
      await act(async () => {
        noneButton!.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      const cardsAfterClear = Array.from(document.querySelectorAll('[data-element-animation]'))
      expect(cardsAfterClear.length).toBeGreaterThan(0)
      expect(
        cardsAfterClear.every((card) => (card as HTMLButtonElement).disabled)
      ).toBe(false)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('refreshes the page preview after a successful save', async () => {
    ipcMocks.getElementAnimation.mockResolvedValue({ animation: null })
    const { root, container } = await renderPicker()
    try {
      const previewKeyBefore = useSessionDetailUiStore.getState().previewKey

      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      ipcMocks.setElementAnimation.mockResolvedValue({
        animation: { type: 'fade-up', trigger: 'load', durationMs: 600 },
        changed: true
      })
      const card = document.querySelector('[data-element-animation="fade-up"]') as HTMLButtonElement
      expect(card).toBeTruthy()
      await act(async () => {
        card.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(useSessionDetailUiStore.getState().previewKey).toBe(previewKeyBefore)
      expect(refreshCurrentPreview).toHaveBeenCalledTimes(1)
      expect(document.querySelector('[data-element-animation="fade-up"]')).toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('does not show selected element text inside the animation popover', async () => {
    ipcMocks.getElementAnimation.mockResolvedValue({ animation: null })
    const { root, container } = await renderPicker()
    try {
      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(document.querySelector('[data-element-animation="fade"]')).toBeTruthy()
      expect(document.body.textContent).not.toContain('Revenue')
      expect(document.body.textContent).not.toContain('[data-block-id="metric"]')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('keeps animation mode active and preserves the selected element after clearing animation', async () => {
    ipcMocks.getElementAnimation.mockResolvedValue({
      animation: { type: 'pulse', trigger: 'load', durationMs: 600 }
    })
    const { root, container } = await renderPicker()
    try {
      await act(async () => {
        useSessionDetailUiStore
          .getState()
          .setSelectedElement('[data-block-id="metric"]', 'metric', 'div', 'Revenue')
        await Promise.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        container.querySelector('button')?.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      const noneButton = Array.from(document.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('sessionDetail.indexTransitionNone')
      ) as HTMLButtonElement | undefined
      expect(noneButton).toBeTruthy()

      ipcMocks.setElementAnimation.mockResolvedValue({
        animation: null,
        changed: true
      })
      await act(async () => {
        noneButton!.click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(useSessionDetailUiStore.getState().workspaceTab).toBe('animation')
      expect(useSessionDetailUiStore.getState().interactionMode).toBe('animation-select')
      expect(useSessionDetailUiStore.getState().selectedSelector).toBe(
        '[data-block-id="metric"]'
      )
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
