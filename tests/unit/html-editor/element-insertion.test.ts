import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HtmlEditorCanvasHandle } from '../../../src/renderer/src/components/html-editor/HtmlEditorCanvas'
import { useHtmlElementInsertion } from '../../../src/renderer/src/components/html-editor/useHtmlElementInsertion'
import { ART_TEXT_TEMPLATES } from '../../../src/renderer/src/lib/artTextTemplates'
import { useHtmlEditHistoryStore } from '../../../src/renderer/src/store/htmlEditHistoryStore'
import { useHtmlEditStore } from '../../../src/renderer/src/store/htmlEditStore'
import type { EditableElementSnapshot } from '../../../src/renderer/src/components/preview/edit-mode-script'

const PAGE_CONTEXT = {
  pageId: 'page-1',
  htmlPath: '/tmp/page-1.html',
  sessionId: 'session-1'
}

function createSnapshot(selector: string): EditableElementSnapshot {
  return {
    selector,
    label: 'Inserted element',
    elementTag: 'div',
    elementText: '',
    kind: 'unknown',
    capabilities: ['layout', 'layer'],
    metrics: {
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      page: { x: 0, y: 0, width: 100, height: 100 },
      translateX: 0,
      translateY: 0
    },
    computed: {
      zIndex: '20',
      opacity: '1',
      backgroundColor: 'transparent',
      color: '#34402c'
    },
    inline: {},
    attrs: {}
  }
}

describe('useHtmlElementInsertion', () => {
  beforeEach(() => {
    useHtmlEditHistoryStore.getState().clear()
    useHtmlEditStore.getState().reset()
  })

  it('uses z-index 20 for every newly inserted element, including later inserts', async () => {
    const injectedFragments: string[] = []
    const iframe = {
      injectElement: vi.fn((_parentSelector: string, htmlFragment: string) => {
        injectedFragments.push(htmlFragment)
        return true
      }),
      readElementSnapshot: vi.fn(async (selector: string) => createSnapshot(selector)),
      ensureChartJs: vi.fn(async () => true)
    } as unknown as HtmlEditorCanvasHandle

    useHtmlEditStore.getState().attach({
      t: () => 'New text',
      requestRefresh: vi.fn(),
      bumpThumbnail: vi.fn(),
      getPageContext: () => PAGE_CONTEXT
    })
    useHtmlEditStore.getState().setIframeHandle(iframe)

    const insertion = useHtmlElementInsertion({ designWidth: 1280, t: () => 'New text' })
    await insertion.addText()
    await insertion.addArtText(ART_TEXT_TEMPLATES[0].id)
    await insertion.addShape('rect')
    await insertion.addIcon('lightbulb')
    await insertion.addChart('bar')

    expect(injectedFragments).toHaveLength(5)
    injectedFragments.forEach((fragment) => {
      expect(fragment).toMatch(/z-index:20(?:;|\")/)
    })
  })

  it('inserts image and video elements with escaped media URLs', async () => {
    const injectedFragments: string[] = []
    const iframe = {
      injectElement: vi.fn((_parentSelector: string, htmlFragment: string) => {
        injectedFragments.push(htmlFragment)
        return true
      }),
      readElementSnapshot: vi.fn(async (selector: string) => createSnapshot(selector))
    } as unknown as HtmlEditorCanvasHandle

    useHtmlEditStore.getState().attach({
      t: () => 'New text',
      requestRefresh: vi.fn(),
      bumpThumbnail: vi.fn(),
      getPageContext: () => PAGE_CONTEXT
    })
    useHtmlEditStore.getState().setIframeHandle(iframe)

    const insertion = useHtmlElementInsertion({ designWidth: 1280, t: () => 'New text' })
    await insertion.addImage('https://cdn.example.com/photo?a=1&b=2')
    await insertion.addVideo('file:///tmp/demo%20video.mp4')

    expect(injectedFragments).toHaveLength(2)
    expect(injectedFragments[0]).toContain('<img')
    expect(injectedFragments[0]).toContain('src="https://cdn.example.com/photo?a=1&amp;b=2"')
    expect(injectedFragments[0]).toContain('width:480px')
    expect(injectedFragments[1]).toContain('<video')
    expect(injectedFragments[1]).toContain('controls')
    expect(injectedFragments[1]).toContain('preload="metadata"')
    expect(injectedFragments[1]).toContain('width:640px')
  })

  it('does not save a media addition when the canvas rejects the injection', async () => {
    const iframe = {
      injectElement: vi.fn(async () => false),
      readElementSnapshot: vi.fn(async (selector: string) => createSnapshot(selector))
    } as unknown as HtmlEditorCanvasHandle

    useHtmlEditStore.getState().attach({
      t: () => 'New text',
      requestRefresh: vi.fn(),
      bumpThumbnail: vi.fn(),
      getPageContext: () => PAGE_CONTEXT
    })
    useHtmlEditStore.getState().setIframeHandle(iframe)

    const insertion = useHtmlElementInsertion({ designWidth: 1280, t: () => 'New text' })

    await expect(insertion.addImage('https://cdn.example.com/photo.webp')).resolves.toBe(false)
    expect(useHtmlEditHistoryStore.getState().addElements).toHaveLength(0)
  })
})
