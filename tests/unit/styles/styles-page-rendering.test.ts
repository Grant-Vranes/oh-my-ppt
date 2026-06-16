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
  importStylePackageDirectory: vi.fn(),
  importStylePackageZip: vi.fn(),
  onHtmlThumbnailChanged: vi.fn(() => () => undefined)
}))
let thumbnailListener: ((task: {
  resourceType: string
  resourceId: string
  variant: string
  status: 'completed'
  thumbnailPath: string
}) => void) | null = null
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

async function renderStylesPage(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(MemoryRouter, null, React.createElement(StylesPage)))
  })
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 5))
  })
  return { container, root }
}

describe('StylesPage rendering', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    useStylePreviewStore.setState({ generatingStyleId: '', completionVersion: 0 })
    ipcMocks.listStyles.mockResolvedValue({
      items: [
        {
          id: 'style-with-preview',
          label: 'Preview Style',
          description: 'Has a generated preview',
          category: 'deck',
          source: 'custom',
          styleCase: 'Pitch, Report',
          previewPath: '/styles/preview/preview.html',
          thumbnailPath: '/thumbnail-cache/style-with-preview.png',
          updatedAt: 2
        },
        {
          id: 'style-pending-thumbnail',
          label: 'Pending Thumbnail',
          description: 'Uses iframe while visible',
          category: 'deck',
          source: 'custom',
          previewPath: '/styles/pending/preview.html',
          updatedAt: 1
        },
        {
          id: 'style-without-preview',
          label: 'Fresh Style',
          description: 'Needs a generated preview',
          category: 'deck',
          source: 'builtin',
          updatedAt: 0
        }
      ]
    })
    ipcMocks.generateStylePreview.mockResolvedValue({ previewPath: '/styles/fresh/preview.html' })
    ipcMocks.importStylePackageDirectory.mockResolvedValue({
      success: true,
      id: 'folder-style',
      source: 'custom'
    })
    ipcMocks.onHtmlThumbnailChanged.mockImplementation((listener) => {
      thumbnailListener = listener
      return () => {
        thumbnailListener = null
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('uses a visible iframe until the PNG thumbnail arrives', async () => {
    const { container, root } = await renderStylesPage()
    try {
      expect(container.querySelectorAll('[data-style-card-id]')).toHaveLength(3)
      const importMenuButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.includes('styles.importMenu')
      ) as HTMLButtonElement | undefined
      const openMenu = async (): Promise<void> => {
        await act(async () => {
          importMenuButton?.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
          )
          importMenuButton?.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true })
          )
          await new Promise((resolve) => window.setTimeout(resolve, 5))
        })
      }
      await openMenu()
      const officialSkillLink = document.body.querySelector(
        'a[href="https://github.com/arcsin1/style-generate-skill"]'
      )
      expect(officialSkillLink?.getAttribute('target')).toBe('_blank')
      expect(officialSkillLink?.getAttribute('rel')).toBe('noopener noreferrer')
      await act(async () => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        )
        await new Promise((resolve) => window.setTimeout(resolve, 5))
      })
      expect(container.querySelectorAll('img')).toHaveLength(1)
      expect(container.querySelectorAll('iframe')).toHaveLength(0)
      expect(container.textContent).toContain('Preview Style')
      expect(container.textContent).toContain('Pitch')

      const observer = MockIntersectionObserver.instances[0]
      await act(async () => {
        observer.emit([
          {
            target: getObservedCard(observer, 'style-pending-thumbnail'),
            isIntersecting: true
          }
        ])
      })
      const previewIframe = container.querySelector('[data-testid="style-preview-iframe"]')
      expect(previewIframe).not.toBeNull()
      expect(previewIframe?.getAttribute('sandbox')).toBe('')

      await act(async () => {
        thumbnailListener?.({
          resourceType: 'style',
          resourceId: 'style-pending-thumbnail',
          variant: 'default',
          status: 'completed',
          thumbnailPath: '/thumbnail-cache/style-pending-thumbnail.png'
        })
      })
      expect(container.querySelectorAll('img')).toHaveLength(2)
      expect(container.querySelectorAll('iframe')).toHaveLength(0)
      expect(ipcMocks.listStyles).toHaveBeenCalledTimes(1)

      const generateButton = container.querySelector(
        'button[aria-label="styles.generatePreview"]'
      ) as HTMLButtonElement | null
      await act(async () => {
        generateButton?.click()
        await Promise.resolve()
      })
      expect(ipcMocks.generateStylePreview).toHaveBeenCalledWith({
        styleId: 'style-without-preview'
      })

      await openMenu()
      const importFolderItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
        (item) => item.textContent?.includes('styles.importPackageDirectory')
      )
      expect(importFolderItem).toBeTruthy()
      await act(async () => {
        importFolderItem?.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, cancelable: true })
        )
        importFolderItem?.click()
        await new Promise((resolve) => window.setTimeout(resolve, 10))
      })
      expect(ipcMocks.importStylePackageDirectory).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
