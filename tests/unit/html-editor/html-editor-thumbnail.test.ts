import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enqueueHtmlThumbnail: vi.fn(),
  enqueueHtmlThumbnails: vi.fn(),
  getFreshHtmlThumbnailPaths: vi.fn()
}))

vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  enqueueHtmlThumbnail: state.enqueueHtmlThumbnail,
  enqueueHtmlThumbnails: state.enqueueHtmlThumbnails,
  getFreshHtmlThumbnailPaths: state.getFreshHtmlThumbnailPaths
}))

describe('HTML editor cover thumbnails', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns cached covers and queues only documents without one', async () => {
    state.getFreshHtmlThumbnailPaths.mockResolvedValue(new Map([['doc-1', '/cache/doc-1.png']]))
    state.enqueueHtmlThumbnails.mockResolvedValue([])

    const { warmHtmlEditorCoverThumbnails } =
      await import('../../../src/main/ipc/html-editor/html-editor-thumbnail')
    const result = await warmHtmlEditorCoverThumbnails([
      { id: 'doc-1', htmlPath: '/tmp/doc-1.html', designWidth: 1280 },
      { id: 'doc-2', htmlPath: '/tmp/doc-2.html', designWidth: 1440 },
      { id: '  ', htmlPath: '/tmp/doc-3.html', designWidth: 1280 }
    ])

    expect(result.get('doc-1')).toBe('/cache/doc-1.png')
    expect(state.getFreshHtmlThumbnailPaths).toHaveBeenCalledWith([
      {
        resourceType: 'html-editor',
        resourceId: 'doc-1',
        variant: 'cover',
        sourcePath: '/tmp/doc-1.html',
        captureWidth: 1280,
        captureHeight: 720,
        thumbnailWidth: 640,
        thumbnailHeight: 360
      },
      {
        resourceType: 'html-editor',
        resourceId: 'doc-2',
        variant: 'cover',
        sourcePath: '/tmp/doc-2.html',
        captureWidth: 1440,
        captureHeight: 810,
        thumbnailWidth: 640,
        thumbnailHeight: 360
      }
    ])
    expect(state.enqueueHtmlThumbnails).toHaveBeenCalledWith([
      {
        resourceType: 'html-editor',
        resourceId: 'doc-2',
        variant: 'cover',
        sourcePath: '/tmp/doc-2.html',
        captureWidth: 1440,
        captureHeight: 810,
        thumbnailWidth: 640,
        thumbnailHeight: 360
      }
    ])
  })

  it('forces a new capture after document content changes', async () => {
    state.enqueueHtmlThumbnail.mockResolvedValue({ status: 'queued' })

    const { refreshHtmlEditorCoverThumbnail } =
      await import('../../../src/main/ipc/html-editor/html-editor-thumbnail')
    refreshHtmlEditorCoverThumbnail({
      id: 'doc-1',
      htmlPath: '/tmp/doc-1.html',
      designWidth: 1280
    })

    expect(state.enqueueHtmlThumbnail).toHaveBeenCalledWith(
      {
        resourceType: 'html-editor',
        resourceId: 'doc-1',
        variant: 'cover',
        sourcePath: '/tmp/doc-1.html',
        captureWidth: 1280,
        captureHeight: 720,
        thumbnailWidth: 640,
        thumbnailHeight: 360
      },
      { force: true }
    )
  })
})
