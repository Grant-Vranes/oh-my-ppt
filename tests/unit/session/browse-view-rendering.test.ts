/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { BrowseView } from '../../../src/renderer/src/components/session-detail/browse/BrowseView'
import { TooltipProvider } from '../../../src/renderer/src/components/ui/Tooltip'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'
import { useSessionStore } from '../../../src/renderer/src/store/sessionStore'

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
    root.render(
      React.createElement(
        TooltipProvider,
        { delayDuration: 0 },
        React.createElement(BrowseView, { sessionId: 'session-1' })
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

describe('BrowseView preview rendering', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    useGenerateStore.getState().reset()
    useSessionDetailUiStore.getState().resetForSessionChange()
    useSessionStore.setState({
      currentSession: {
        slideSizeId: 'wide-16-9',
        slideWidth: 1600,
        slideHeight: 900
      } as never
    })
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

  it('reserves two lines for every card title so short titles do not shrink the card', async () => {
    const pages = [
      {
        id: 'page-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Short one-line title',
        html: '<html></html>',
        sourceUrl: 'session://page-1.html'
      },
      {
        id: 'page-2',
        pageId: 'page-2',
        pageNumber: 2,
        title: 'A '.repeat(80).trim(),
        html: '<html></html>',
        sourceUrl: 'session://page-2.html'
      }
    ]
    useGenerateStore.getState().setPages(pages)
    const { container, root } = await renderBrowseView()

    try {
      const titles = container.querySelectorAll('p')
      expect(titles).toHaveLength(2)
      // Every title reserves 2 lines (leading-4 = 1rem/line), so a 1-line
      // title cannot shrink its card below a 2-line title's card.
      for (const title of titles) {
        expect((title as HTMLElement).style.minHeight).toBe('calc(2 * 1rem)')
      }
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('renders a drag handle for each browse card', async () => {
    useGenerateStore.getState().setPages(makePages(3))
    const { container, root } = await renderBrowseView()

    try {
      const handles = container.querySelectorAll('button[aria-label="pageManagement.dragHandle"]')
      expect(handles).toHaveLength(3)
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('renders browse card hover actions for export, rename, and delete', async () => {
    useGenerateStore.getState().setPages(makePages(3))
    const { container, root } = await renderBrowseView()

    try {
      expect(
        container.querySelectorAll('button[aria-label="sessionDetail.exportSinglePagePptx"]')
      ).toHaveLength(3)
      expect(container.querySelectorAll('button[aria-label="pageManagement.editPageTitle"]'))
        .toHaveLength(3)
      expect(container.querySelectorAll('button[aria-label="pageManagement.deletePage"]'))
        .toHaveLength(3)
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('hides browse card export actions when the deck is not 16:9', async () => {
    useSessionStore.setState({
      currentSession: {
        slideSizeId: 'standard-4-3',
        slideWidth: 1600,
        slideHeight: 1200
      } as never
    })
    useGenerateStore.getState().setPages(makePages(3))
    const { container, root } = await renderBrowseView()

    try {
      expect(
        container.querySelectorAll('button[aria-label="sessionDetail.exportSinglePagePptx"]')
      ).toHaveLength(0)
      expect(container.querySelectorAll('button[aria-label="pageManagement.editPageTitle"]'))
        .toHaveLength(3)
      expect(container.querySelectorAll('button[aria-label="pageManagement.deletePage"]'))
        .toHaveLength(3)
    } finally {
      await cleanupRoot(root, container)
    }
  })

  it('wires browse card rename and delete actions to page management state', async () => {
    useGenerateStore.getState().setPages(makePages(2))
    const { container, root } = await renderBrowseView()

    try {
      const renameButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="pageManagement.editPageTitle"]'
      )
      const deleteButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="pageManagement.deletePage"]'
      )

      await act(async () => {
        renameButton?.click()
      })
      expect(useSessionDetailUiStore.getState().pageTitleEditPageId).toBe('page-1')
      expect(useSessionDetailUiStore.getState().pageTitleEditDraft).toBe('Page 1')

      await act(async () => {
        deleteButton?.click()
      })
      expect(useSessionDetailUiStore.getState().deleteConfirmPageId).toBe('page-1')
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
