/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { StyleView } from '../../../src/renderer/src/components/session-detail/style/StyleView'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useGenerationActivityStore } from '../../../src/renderer/src/store/generationActivityStore'
import { useSessionStore } from '../../../src/renderer/src/store/sessionStore'

const ipcMocks = vi.hoisted(() => ({
  listStyles: vi.fn(),
  switchSessionStyle: vi.fn()
}))
const translate = vi.hoisted(() => vi.fn((key: string) => key))

vi.mock('@renderer/lib/ipc', () => ({ ipc: ipcMocks }))

vi.mock('@renderer/i18n', () => ({
  useT: () => translate
}))

vi.mock('@renderer/hooks/useModelAction', () => ({
  useModelAction: () => ({
    selectedModelConfigId: 'model-1',
    ensureModelActive: vi.fn()
  })
}))

type ObserverEntry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly observed = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit
  ) {
    MockIntersectionObserver.instances.push(this)
  }

  observe = (element: Element): void => {
    this.observed.add(element)
  }

  unobserve = (element: Element): void => {
    this.observed.delete(element)
  }

  disconnect = (): void => {
    this.observed.clear()
  }

  takeRecords = (): IntersectionObserverEntry[] => []

  emit(entries: ObserverEntry[]): void {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

function makeStyles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `style-${index + 1}`,
    label: `Style ${index + 1}`,
    description: `Description ${index + 1}`,
    category: 'test',
    previewPath: `/styles/style-${index + 1}/preview.html`,
    updatedAt: count - index
  }))
}

function getObservedCard(observer: MockIntersectionObserver, styleId: string): Element {
  const element = Array.from(observer.observed).find(
    (node) => (node as HTMLElement).dataset.styleCardId === styleId
  )
  if (!element) throw new Error(`Expected observed style card ${styleId}`)
  return element
}

async function renderStyleView(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(StyleView, { sessionId: 'session-1' }))
    await Promise.resolve()
  })

  return { container, root }
}

describe('StyleView preview rendering', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    ipcMocks.listStyles.mockResolvedValue({ items: makeStyles(24) })
    useGenerateStore.getState().reset()
    useGenerationActivityStore.getState().reset()
    useSessionStore.getState().setCurrentSession({
      id: 'session-1',
      title: 'Session',
      topic: null,
      styleId: null,
      page_count: null,
      status: 'completed',
      provider: '',
      model: '',
      created_at: 0,
      updated_at: 0,
      metadata: null
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useSessionStore.getState().resetRuntimeState()
    useGenerationActivityStore.getState().reset()
    document.body.innerHTML = ''
  })

  it('mounts preview iframes only near the scroll viewport and caps them at twenty', async () => {
    useSessionStore.setState((state) => ({
      currentSession: state.currentSession ? { ...state.currentSession, styleId: 'style-1' } : null
    }))
    const { container, root } = await renderStyleView()

    try {
      expect(ipcMocks.listStyles).toHaveBeenCalledWith({ sessionId: 'session-1' })
      const observer = MockIntersectionObserver.instances[0]
      expect(observer.options?.rootMargin).toBe('200px 100px')
      expect(observer.options?.root).toBeTruthy()
      expect(observer.observed.size).toBe(24)
      expect(container.querySelectorAll('[data-testid="style-selection-checkbox"]')).toHaveLength(
        24
      )
      const checkedBox = container.querySelector(
        '[data-testid="style-selection-checkbox"][data-state="checked"]'
      )
      expect(
        (checkedBox?.closest('[data-style-card-id]') as HTMLElement | null)?.dataset.styleCardId
      ).toBe('style-1')
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(0)

      await act(async () => {
        observer.emit(
          Array.from({ length: 24 }, (_, index) => ({
            target: getObservedCard(observer, `style-${index + 1}`),
            isIntersecting: true
          }))
        )
      })

      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(20)
      const previewTitles = Array.from(
        container.querySelectorAll('[data-testid="style-preview-iframe"]')
      ).map((node) => node.getAttribute('title'))
      expect(previewTitles).not.toContain('Style 1 preview')
      expect(previewTitles).toContain('Style 24 preview')
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('delays preview removal and cancels it when the card re-enters', async () => {
    ipcMocks.listStyles.mockResolvedValue({ items: makeStyles(1) })
    const { container, root } = await renderStyleView()
    vi.useFakeTimers()

    try {
      const observer = MockIntersectionObserver.instances[0]
      const card = getObservedCard(observer, 'style-1')

      await act(async () => {
        observer.emit([{ target: card, isIntersecting: true }])
      })
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(1)

      await act(async () => {
        observer.emit([{ target: card, isIntersecting: false }])
        vi.advanceTimersByTime(200)
      })
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(1)

      await act(async () => {
        observer.emit([{ target: card, isIntersecting: true }])
        vi.advanceTimersByTime(250)
      })
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(1)

      await act(async () => {
        observer.emit([{ target: card, isIntersecting: false }])
        vi.advanceTimersByTime(250)
      })
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
