import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getFreshHtmlThumbnailPaths: vi.fn(),
  enqueueHtmlThumbnails: vi.fn()
}))

vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  getFreshHtmlThumbnailPaths: state.getFreshHtmlThumbnailPaths,
  enqueueHtmlThumbnails: state.enqueueHtmlThumbnails
}))

describe('session first page thumbnails', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('batches thumbnail lookups for many sessions in one service call', async () => {
    state.getFreshHtmlThumbnailPaths.mockResolvedValue(new Map([['session-1', '/cache/1.png']]))

    const { getSessionFirstPageThumbnails } = await import(
      '../../../src/main/session/session-thumbnail'
    )
    const result = await getSessionFirstPageThumbnails([
      { sessionId: 'session-1', pageId: 'p-1', sourcePath: '/tmp/page-1.html' },
      { sessionId: 'session-2', sourcePath: null },
      { sessionId: '  ', sourcePath: '/tmp/page-2.html' }
    ])

    expect(result.get('session-1')).toBe('/cache/1.png')
    expect(state.getFreshHtmlThumbnailPaths).toHaveBeenCalledWith([
      {
        resourceType: 'session',
        resourceId: 'session-1',
        variant: 'first-page',
        sourcePath: '/tmp/page-1.html',
        pageId: 'p-1'
      }
    ])
  })

  it('enqueues only the sessions whose fresh thumbnail is missing', async () => {
    state.getFreshHtmlThumbnailPaths.mockResolvedValue(new Map([['session-1', '/cache/1.png']]))
    state.enqueueHtmlThumbnails.mockResolvedValue([])

    const { warmSessionFirstPageThumbnails } = await import(
      '../../../src/main/session/session-thumbnail'
    )
    const result = await warmSessionFirstPageThumbnails([
      { sessionId: 'session-1', pageId: 'p-1', sourcePath: '/tmp/page-1.html' },
      { sessionId: 'session-2', pageId: 'p-2', sourcePath: '/tmp/page-2.html' },
      { sessionId: '  ', sourcePath: '/tmp/page-3.html' }
    ])

    expect(result.get('session-1')).toBe('/cache/1.png')
    expect(result.has('session-2')).toBe(false)
    expect(state.enqueueHtmlThumbnails).toHaveBeenCalledTimes(1)
    expect(state.enqueueHtmlThumbnails).toHaveBeenCalledWith([
      {
        resourceType: 'session',
        resourceId: 'session-2',
        variant: 'first-page',
        sourcePath: '/tmp/page-2.html',
        pageId: 'p-2'
      }
    ])
  })

  it('does not enqueue anything when every thumbnail is already fresh', async () => {
    state.getFreshHtmlThumbnailPaths.mockResolvedValue(
      new Map([
        ['session-1', '/cache/1.png'],
        ['session-2', '/cache/2.png']
      ])
    )

    const { warmSessionFirstPageThumbnails } = await import(
      '../../../src/main/session/session-thumbnail'
    )
    const result = await warmSessionFirstPageThumbnails([
      { sessionId: 'session-1', sourcePath: '/tmp/page-1.html' },
      { sessionId: 'session-2', sourcePath: '/tmp/page-2.html' }
    ])

    expect(result.size).toBe(2)
    expect(state.enqueueHtmlThumbnails).not.toHaveBeenCalled()
  })

  it('returns an empty result without enqueueing when the cache lookup fails', async () => {
    state.getFreshHtmlThumbnailPaths.mockRejectedValue(new Error('database unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { warmSessionFirstPageThumbnails } = await import(
      '../../../src/main/session/session-thumbnail'
    )
    const result = await warmSessionFirstPageThumbnails([
      { sessionId: 'session-1', pageId: 'p-1', sourcePath: '/tmp/page-1.html' }
    ])

    expect(result.size).toBe(0)
    expect(state.enqueueHtmlThumbnails).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[session-thumbnail] fresh thumbnail lookup failed',
      expect.any(Error)
    )
  })
})
