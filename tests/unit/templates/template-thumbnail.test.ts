import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enqueueHtmlThumbnail: vi.fn(),
  getFreshHtmlThumbnailPaths: vi.fn(),
  enqueueHtmlThumbnails: vi.fn(),
  waitForHtmlThumbnailTask: vi.fn()
}))

vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  enqueueHtmlThumbnail: state.enqueueHtmlThumbnail,
  getFreshHtmlThumbnailPaths: state.getFreshHtmlThumbnailPaths,
  enqueueHtmlThumbnails: state.enqueueHtmlThumbnails,
  waitForHtmlThumbnailTask: state.waitForHtmlThumbnailTask
}))

describe('template cover thumbnails', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns fresh covers and queues only missing templates', async () => {
    state.getFreshHtmlThumbnailPaths.mockResolvedValue(
      new Map([['template-1', '/cache/template-1.png']])
    )
    state.enqueueHtmlThumbnails.mockResolvedValue([])

    const { warmTemplateCoverThumbnails } =
      await import('../../../src/main/templates/template-thumbnail')
    const result = await warmTemplateCoverThumbnails(
      [
        { templateId: 'template-1', pageId: 'page-1', sourcePath: '/tmp/page-1.html' },
        { templateId: 'template-2', pageId: 'page-2', sourcePath: '/tmp/page-2.html' },
        { templateId: 'template-3', sourcePath: null }
      ],
      250
    )

    expect(result.get('template-1')).toBe('/cache/template-1.png')
    expect(state.getFreshHtmlThumbnailPaths).toHaveBeenCalledWith([
      {
        resourceType: 'template',
        resourceId: 'template-1',
        variant: 'cover',
        sourcePath: '/tmp/page-1.html',
        pageId: 'page-1',
        captureWidth: undefined,
        captureHeight: undefined,
        thumbnailWidth: 640,
        thumbnailHeight: undefined
      },
      {
        resourceType: 'template',
        resourceId: 'template-2',
        variant: 'cover',
        sourcePath: '/tmp/page-2.html',
        pageId: 'page-2',
        captureWidth: undefined,
        captureHeight: undefined,
        thumbnailWidth: 640,
        thumbnailHeight: undefined
      }
    ])
    expect(state.enqueueHtmlThumbnails).toHaveBeenCalledWith(
      [
        {
          resourceType: 'template',
        resourceId: 'template-2',
        variant: 'cover',
        sourcePath: '/tmp/page-2.html',
        pageId: 'page-2',
        captureWidth: undefined,
        captureHeight: undefined,
        thumbnailWidth: 640,
        thumbnailHeight: undefined
      }
      ],
      { delayMs: 250 }
    )
  })

  it('waits for the imported template cover to finish', async () => {
    state.enqueueHtmlThumbnail.mockResolvedValue({
      resourceType: 'template',
      resourceId: 'template-1',
      variant: 'cover',
      status: 'queued',
      thumbnailPath: null
    })
    state.waitForHtmlThumbnailTask.mockResolvedValue({
      resourceType: 'template',
      resourceId: 'template-1',
      variant: 'cover',
      status: 'completed',
      thumbnailPath: '/cache/template-1.png'
    })

    const { captureTemplateCoverThumbnail } =
      await import('../../../src/main/templates/template-thumbnail')
    const result = await captureTemplateCoverThumbnail({
      templateId: 'template-1',
      pageId: 'page-1',
      sourcePath: '/tmp/page-1.html'
    })

    expect(result).toBe('/cache/template-1.png')
    expect(state.waitForHtmlThumbnailTask).toHaveBeenCalledWith('template', 'template-1', 'cover')
  })
})
