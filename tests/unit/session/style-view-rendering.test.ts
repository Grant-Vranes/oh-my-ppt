/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { StyleView } from '../../../src/renderer/src/components/session-detail/style/StyleView'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useGenerationActivityStore } from '../../../src/renderer/src/store/generationActivityStore'
import { useSessionStore } from '../../../src/renderer/src/store/sessionStore'

const ipcMocks = vi.hoisted(() => ({
  listStyles: vi.fn(),
  switchSessionStyle: vi.fn(),
  onHtmlThumbnailChanged: vi.fn(() => () => undefined)
}))
const translate = vi.hoisted(() => vi.fn((key: string) => key))

type ObserverEntry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
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

  emit(entries: ObserverEntry[]): void {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

function getObservedCard(observer: MockIntersectionObserver, styleId: string): Element {
  const card = Array.from(observer.observed).find(
    (element) => (element as HTMLElement).dataset.styleCardId === styleId
  )
  if (!card) throw new Error(`Expected observed style card ${styleId}`)
  return card
}

vi.mock('@renderer/lib/ipc', () => ({ ipc: ipcMocks }))
vi.mock('@renderer/i18n', () => ({ useT: () => translate }))
vi.mock('@renderer/hooks/useModelAction', () => ({
  useModelAction: () => ({ selectedModelConfigId: 'model-1', ensureModelActive: vi.fn() })
}))

describe('StyleView preview rendering', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    ipcMocks.listStyles.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `style-${index + 1}`,
        label: `Style ${index + 1}`,
        description: `Description ${index + 1}`,
        category: 'test',
        previewPath: `/styles/style-${index + 1}/preview.html`,
        thumbnailPath: index === 0 ? '/thumbnails/style-1.png' : null,
        updatedAt: 10 - index
      }))
    })
    useGenerateStore.getState().reset()
    useGenerationActivityStore.getState().reset()
    useSessionStore.getState().setCurrentSession({
      id: 'session-1',
      title: 'Session',
      topic: null,
      styleId: 'style-1',
      page_count: null,
      status: 'completed',
      provider: '',
      model: '',
      created_at: 0,
      updated_at: 0,
      metadata: null
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useSessionStore.getState().resetRuntimeState()
    useGenerationActivityStore.getState().reset()
    document.body.innerHTML = ''
  })

  it('prefers PNG thumbnails and caps visible iframe placeholders at eight', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(StyleView, { sessionId: 'session-1' }))
      await Promise.resolve()
    })

    try {
      expect(ipcMocks.listStyles).toHaveBeenCalledWith({ sessionId: 'session-1' })
      expect(container.querySelectorAll('img')).toHaveLength(1)
      expect(container.querySelectorAll('iframe')).toHaveLength(0)

      const observer = MockIntersectionObserver.instances[0]
      await act(async () => {
        observer.emit(
          Array.from({ length: 9 }, (_, index) => ({
            target: getObservedCard(observer, `style-${index + 2}`),
            isIntersecting: true
          }))
        )
      })
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(8)
      for (const iframe of container.querySelectorAll('[data-testid="style-preview-iframe"]')) {
        expect(iframe.getAttribute('sandbox')).toBe('')
      }
      expect(
        container.querySelector('[data-style-card-id="style-2"] iframe')
      ).toBeNull()
      const checkedBox = container.querySelector(
        '[data-testid="style-selection-checkbox"][data-state="checked"]'
      )
      expect(
        (checkedBox?.closest('[data-style-card-id]') as HTMLElement | null)?.dataset.styleCardId
      ).toBe('style-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
