/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { BrowseView } from '../../../src/renderer/src/components/session-detail/browse/BrowseView'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'

vi.mock('../../../src/renderer/src/i18n', () => ({
  useT: () => (key: string) => key
}))

vi.mock('../../../src/renderer/src/components/preview/PreviewIframe', () => ({
  PreviewIframe: ({ title }: { title: string }) =>
    React.createElement('div', {
      'data-testid': 'preview-iframe',
      'data-title': title
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

function makePages(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const pageNumber = index + 1
    return {
      id: `page-${pageNumber}`,
      pageId: `page-${pageNumber}`,
      pageNumber,
      title: `Page ${pageNumber}`,
      html: '<html></html>',
      sourceUrl: `session://page-${pageNumber}.html`
    }
  })
}

function getObservedCard(observer: MockIntersectionObserver, pageId: string): Element {
  const element = Array.from(observer.observed).find(
    (node) => (node as HTMLElement).dataset.browseCardId === pageId
  )
  if (!element) throw new Error(`Expected observed card ${pageId}`)
  return element
}

async function renderBrowseView(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(BrowseView, { sessionId: 'session-1' }))
  })

  return { container, root }
}

async function cleanupRoot(root: Root, container: HTMLDivElement): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('BrowseView preview rendering', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    useGenerateStore.getState().reset()
    useSessionDetailUiStore.getState().resetForSessionChange()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders every intersecting grid card instead of only the nearest eight', async () => {
    useGenerateStore.getState().setPages(makePages(12))
    const { container, root } = await renderBrowseView()

    try {
      const observer = MockIntersectionObserver.instances[0]
      expect(observer.options?.rootMargin).toBe('200px 100px')
      expect(observer.options?.root).toBeTruthy()
      expect(observer.observed.size).toBe(12)

      await act(async () => {
        observer.emit(
          Array.from({ length: 12 }, (_, index) => ({
            target: getObservedCard(observer, `page-${index + 1}`),
            isIntersecting: true
          }))
        )
      })

      expect(container.querySelectorAll('[data-testid="preview-iframe"]')).toHaveLength(12)

      await act(async () => {
        observer.emit([{ target: getObservedCard(observer, 'page-2'), isIntersecting: false }])
      })

      const titles = Array.from(container.querySelectorAll('[data-testid="preview-iframe"]')).map(
        (node) => (node as HTMLElement).dataset.title
      )
      expect(titles).toHaveLength(11)
      expect(titles).not.toContain('browse-page-2')
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('keeps browse previews independent from the merge pages dialog state', async () => {
    useGenerateStore.getState().setPages(makePages(12))
    useSessionDetailUiStore.getState().setMergeSessionPagesDialogOpen(true)
    const { container, root } = await renderBrowseView()

    try {
      const observer = MockIntersectionObserver.instances[0]

      await act(async () => {
        observer.emit(
          Array.from({ length: 12 }, (_, index) => ({
            target: getObservedCard(observer, `page-${index + 1}`),
            isIntersecting: true
          }))
        )
      })

      expect(container.querySelectorAll('[data-testid="preview-iframe"]')).toHaveLength(12)
    } finally {
      await cleanupRoot(root, container)
    }
  })
})
