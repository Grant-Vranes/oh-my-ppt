/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { StylesPage } from '../../../src/renderer/src/pages/styles'
import { useStylePreviewStore } from '../../../src/renderer/src/store/stylePreviewStore'

const ipcMocks = vi.hoisted(() => ({
  listStyles: vi.fn(),
  generateStylePreview: vi.fn(),
  exportStylePackageZip: vi.fn(),
  deleteStyle: vi.fn(),
  importStylePackageZip: vi.fn()
}))
const translate = vi.hoisted(() => vi.fn((key: string) => key))

vi.mock('@renderer/lib/ipc', () => ({ ipc: ipcMocks }))

vi.mock('@renderer/i18n', () => ({
  useT: () => translate
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

function getObservedCard(observer: MockIntersectionObserver, styleId: string): Element {
  const element = Array.from(observer.observed).find(
    (node) => (node as HTMLElement).dataset.styleCardId === styleId
  )
  if (!element) throw new Error(`Expected observed style card ${styleId}`)
  return element
}

async function renderStylesPage(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      React.createElement(MemoryRouter, null, React.createElement(StylesPage))
    )
  })

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 5))
    await Promise.resolve()
  })

  return { container, root }
}

describe('StylesPage rendering', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    useStylePreviewStore.setState({
      generatingStyleId: '',
      completionVersion: 0
    })
    ipcMocks.listStyles.mockResolvedValue({
      items: [
        {
          id: 'style-with-preview',
          label: 'Preview Style',
          description: 'Has a generated preview',
          category: 'deck',
          source: 'custom',
          styleCase: 'Pitch, Report',
          previewPath: '/styles/preview/index.html',
          updatedAt: 2
        },
        {
          id: 'style-without-preview',
          label: 'Fresh Style',
          description: 'Needs a generated preview',
          category: 'deck',
          source: 'builtin',
          updatedAt: 1
        }
      ]
    })
    ipcMocks.generateStylePreview.mockResolvedValue({ previewPath: '/styles/fresh/index.html' })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders StyleView-like cards and keeps preview generation available', async () => {
    const { container, root } = await renderStylesPage()

    try {
      expect(ipcMocks.listStyles).toHaveBeenCalledWith()
      expect(container.querySelectorAll('[data-style-card-id]')).toHaveLength(2)
      expect(container.textContent).toContain('Preview Style')
      expect(container.textContent).toContain('Pitch')
      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(0)

      const observer = MockIntersectionObserver.instances[0]
      await act(async () => {
        observer.emit([
          {
            target: getObservedCard(observer, 'style-with-preview'),
            isIntersecting: true
          }
        ])
      })

      expect(container.querySelectorAll('[data-testid="style-preview-iframe"]')).toHaveLength(1)
      expect(
        container.querySelector('[data-testid="style-preview-iframe"]')?.getAttribute('title')
      ).toBe('Preview Style preview')

      const generateButton = container.querySelector(
        'button[aria-label="styles.generatePreview"]'
      ) as HTMLButtonElement | null
      expect(generateButton).toBeTruthy()

      await act(async () => {
        generateButton?.click()
        await Promise.resolve()
      })

      expect(ipcMocks.generateStylePreview).toHaveBeenCalledWith({
        styleId: 'style-without-preview'
      })
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })
})
