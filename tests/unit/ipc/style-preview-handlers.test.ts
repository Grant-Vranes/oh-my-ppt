import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  return {
    handlers,
    generateStylePreviewHtml: vi.fn(),
    getStylePackageDirectory: vi.fn(),
    saveGeneratedStylePreview: vi.fn(),
    enqueueHtmlThumbnail: vi.fn(),
    waitForHtmlThumbnailTask: vi.fn(),
    resolveGlobalModelTimeouts: vi.fn(),
    resolveModelConfigForTask: vi.fn(),
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        handlers.set(channel, handler)
      })
    }
  }
})

vi.mock('electron', () => ({ ipcMain: state.ipcMain }))
vi.mock('electron-log/main.js', () => ({ default: { info: vi.fn() } }))
vi.mock('../../../src/main/utils/style-skills', () => ({
  getStylePackageDirectory: state.getStylePackageDirectory,
  saveGeneratedStylePreview: state.saveGeneratedStylePreview
}))
vi.mock('../../../src/main/utils/style-preview-generator', () => ({
  generateStylePreviewHtml: state.generateStylePreviewHtml
}))
vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  enqueueHtmlThumbnail: state.enqueueHtmlThumbnail,
  waitForHtmlThumbnailTask: state.waitForHtmlThumbnailTask
}))
vi.mock('../../../src/main/ipc/config/model-config-utils', () => ({
  resolveGlobalModelTimeouts: state.resolveGlobalModelTimeouts,
  resolveModelConfigForTask: state.resolveModelConfigForTask
}))

describe('registerStylePreviewHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    state.handlers.clear()
    state.ipcMain.handle.mockClear()
    state.generateStylePreviewHtml.mockReset()
    state.getStylePackageDirectory.mockReset()
    state.saveGeneratedStylePreview.mockReset()
    state.enqueueHtmlThumbnail.mockReset()
    state.waitForHtmlThumbnailTask.mockReset()
    state.resolveGlobalModelTimeouts.mockReset()
    state.resolveModelConfigForTask.mockReset()
  })

  it('registers an independent IPC channel and generates the requested style preview', async () => {
    state.getStylePackageDirectory.mockReturnValue('/styles/user/paper-story')
    state.resolveModelConfigForTask.mockResolvedValue({
      provider: 'openai',
      apiKey: 'key',
      model: 'model',
      baseUrl: '',
      maxTokens: 4096
    })
    state.resolveGlobalModelTimeouts.mockResolvedValue({ document: 600000 })
    state.generateStylePreviewHtml.mockResolvedValue('<!doctype html><html></html>')
    state.saveGeneratedStylePreview.mockResolvedValue({
      previewPath: '/styles/user/paper-story/preview.html'
    })
    state.enqueueHtmlThumbnail.mockResolvedValue({
      resourceType: 'style',
      resourceId: 'paper-story',
      variant: 'default',
      status: 'queued',
      thumbnailPath: null
    })
    state.waitForHtmlThumbnailTask.mockResolvedValue({
      resourceType: 'style',
      resourceId: 'paper-story',
      variant: 'default',
      status: 'completed',
      thumbnailPath: '/thumbnail-cache/paper-story.png'
    })

    const { registerStylePreviewHandlers } =
      await import('../../../src/main/ipc/config/style-preview-handlers')
    registerStylePreviewHandlers({ db: {}, decryptApiKey: vi.fn() } as never)

    const handler = state.handlers.get('styles:generatePreview')
    const result = await handler?.({}, { styleId: 'paper-story' })

    expect(result).toEqual({
      success: true,
      previewPath: '/styles/user/paper-story/preview.html',
      thumbnailPath: '/thumbnail-cache/paper-story.png'
    })
    expect(state.resolveModelConfigForTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purpose: 'styles:generatePreview' })
    )
    expect(state.generateStylePreviewHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        styleId: 'paper-story',
        stylePackageDir: '/styles/user/paper-story',
        modelTimeoutMs: 600000
      })
    )
    expect(state.saveGeneratedStylePreview).toHaveBeenCalledWith(
      'paper-story',
      '<!doctype html><html></html>'
    )
    expect(state.enqueueHtmlThumbnail).toHaveBeenCalledWith(
      {
        resourceType: 'style',
        resourceId: 'paper-story',
        sourcePath: '/styles/user/paper-story/preview.html'
      },
      { force: true }
    )
    expect(state.waitForHtmlThumbnailTask).toHaveBeenCalledWith('style', 'paper-story')
  })
})
