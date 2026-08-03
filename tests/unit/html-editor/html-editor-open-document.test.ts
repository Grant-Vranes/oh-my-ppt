import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn(
        (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
          handlers.set(channel, handler)
        }
      )
    },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    normalizeImportedHtml: vi.fn(({ html }: { html: string }) => ({
      html,
      designWidth: 1280,
      title: ''
    }))
  }
})

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain: state.ipcMain,
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() }
}))
vi.mock('electron-log/main.js', () => ({ default: state.log }))
vi.mock('../../../src/main/html-editor/html-editor-import', () => ({
  normalizeImportedHtml: state.normalizeImportedHtml
}))
vi.mock('../../../src/main/html-editor/html-editor-git', () => ({
  commitHtmlFile: vi.fn(),
  ensureHtmlRepo: vi.fn(),
  getHtmlRepoHead: vi.fn(),
  readHtmlAtCommit: vi.fn(),
  restoreHtmlFileAtCommit: vi.fn(),
  restoreHtmlRepoHead: vi.fn()
}))
vi.mock('../../../src/main/html-editor/html-editor-thumbnail', () => ({
  refreshHtmlEditorCoverThumbnail: vi.fn(),
  warmHtmlEditorCoverThumbnails: vi.fn()
}))
vi.mock('../../../src/main/html-editor/html-editor-media', () => ({
  getHtmlEditorMediaExtensions: vi.fn(),
  importHtmlEditorMedia: vi.fn(),
  listHtmlEditorMedia: vi.fn()
}))

describe('html-editor:openDocument', () => {
  let storagePath = ''

  beforeEach(async () => {
    vi.resetModules()
    state.handlers.clear()
    state.ipcMain.handle.mockClear()
    state.normalizeImportedHtml.mockClear()
    state.normalizeImportedHtml.mockImplementation(({ html }: { html: string }) => ({
      html,
      designWidth: 1280,
      title: ''
    }))
    storagePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'html-editor-open-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (storagePath) await fs.promises.rm(storagePath, { recursive: true, force: true })
  })

  it('reuses an unchanged disk version and revalidates after the file changes', async () => {
    const docId = 'doc-1'
    const workspaceDir = path.join(storagePath, 'html-editor', docId)
    const htmlPath = path.join(workspaceDir, 'current.html')
    await fs.promises.mkdir(workspaceDir, { recursive: true })
    await fs.promises.writeFile(htmlPath, '<html><body>first</body></html>', 'utf-8')

    const { registerHtmlEditorHandlers } =
      await import('../../../src/main/html-editor/html-editor-handlers')
    registerHtmlEditorHandlers({
      mainWindow: null,
      db: {
        getHtmlEditDocument: vi.fn().mockResolvedValue({
          id: docId,
          title: 'Document',
          sourcePath: null,
          htmlPath,
          designWidth: 1280
        })
      },
      resolveStoragePath: vi.fn().mockResolvedValue(storagePath)
    } as never)

    const handler = state.handlers.get('html-editor:openDocument')
    expect(handler).toBeDefined()
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    await handler!({}, { docId })
    await handler!({}, { docId })

    expect(state.normalizeImportedHtml).toHaveBeenCalledTimes(1)
    expect(readFileSpy.mock.calls.filter(([filePath]) => filePath === htmlPath)).toHaveLength(1)

    await fs.promises.writeFile(htmlPath, '<html><body>second version</body></html>', 'utf-8')
    await handler!({}, { docId })

    expect(state.normalizeImportedHtml).toHaveBeenCalledTimes(2)
    expect(readFileSpy.mock.calls.filter(([filePath]) => filePath === htmlPath)).toHaveLength(2)
  })
})
