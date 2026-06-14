import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  return {
    handlers,
    enqueueHtmlThumbnail: vi.fn(),
    enqueueHtmlThumbnails: vi.fn(),
    getHtmlThumbnailTask: vi.fn(),
    onHtmlThumbnailTaskChanged: vi.fn(),
    resolveAllowedLocalAssetPath: vi.fn(),
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        handlers.set(channel, handler)
      })
    }
  }
})

vi.mock('electron', () => ({ ipcMain: state.ipcMain }))
vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  enqueueHtmlThumbnail: state.enqueueHtmlThumbnail,
  enqueueHtmlThumbnails: state.enqueueHtmlThumbnails,
  getHtmlThumbnailTask: state.getHtmlThumbnailTask,
  onHtmlThumbnailTaskChanged: state.onHtmlThumbnailTaskChanged
}))
vi.mock('../../../src/main/ipc/io/assets-handlers', () => ({
  resolveAllowedLocalAssetPath: state.resolveAllowedLocalAssetPath
}))

describe('registerThumbnailHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    state.handlers.clear()
    state.ipcMain.handle.mockClear()
    state.enqueueHtmlThumbnail.mockReset()
    state.enqueueHtmlThumbnails.mockReset()
    state.getHtmlThumbnailTask.mockReset()
    state.onHtmlThumbnailTaskChanged.mockReset()
    state.resolveAllowedLocalAssetPath.mockReset()
  })

  it('registers reusable get and background enqueue channels keyed by resource ID', async () => {
    state.resolveAllowedLocalAssetPath.mockReturnValue('/allowed/session/index.html')
    state.enqueueHtmlThumbnail.mockResolvedValue({
      resourceType: 'session',
      resourceId: 'session-1',
      variant: 'cover',
      status: 'queued',
      thumbnailPath: null
    })
    state.getHtmlThumbnailTask.mockResolvedValue({
      resourceType: 'session',
      resourceId: 'session-1',
      variant: 'cover',
      status: 'completed',
      thumbnailPath: '/cache/session-1.png'
    })

    const { registerThumbnailHandlers } =
      await import('../../../src/main/ipc/io/thumbnail-handlers')
    registerThumbnailHandlers({
      mainWindow: {
        isDestroyed: vi.fn(() => false),
        webContents: { isDestroyed: vi.fn(() => false), send: vi.fn() }
      }
    } as never)

    const enqueue = state.handlers.get('thumbnails:enqueue')
    const queued = await enqueue?.({}, {
      resourceType: 'session',
      resourceId: 'session-1',
      variant: 'cover',
      sourcePath: '/project/index.html'
    })
    expect(queued).toMatchObject({ status: 'queued', resourceId: 'session-1' })
    expect(state.enqueueHtmlThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'session',
        resourceId: 'session-1',
        sourcePath: '/allowed/session/index.html'
      }),
      { force: false }
    )

    const get = state.handlers.get('thumbnails:get')
    const cached = await get?.({}, {
      resourceType: 'session',
      resourceId: 'session-1',
      variant: 'cover'
    })
    expect(cached).toMatchObject({
      status: 'completed',
      thumbnailPath: '/cache/session-1.png'
    })
  })
})
