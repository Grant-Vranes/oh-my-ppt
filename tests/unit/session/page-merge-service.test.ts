import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadEditableSessionPages: vi.fn(),
  persistManagedPages: vi.fn(),
  ensureHistoryBaselineSafe: vi.fn(),
  recordHistoryOperationStrict: vi.fn(),
  buildFontHeadTags: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({
  default: {
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: mocks.logError
  }
}))

vi.mock('../../../src/main/ipc/session/page-management-service', () => ({
  loadEditableSessionPages: mocks.loadEditableSessionPages,
  persistManagedPages: mocks.persistManagedPages
}))

vi.mock('../../../src/main/history/git-history-service', () => ({
  ensureHistoryBaselineSafe: mocks.ensureHistoryBaselineSafe,
  recordHistoryOperationStrict: mocks.recordHistoryOperationStrict
}))

vi.mock('../../../src/main/ipc/engine/template', () => ({
  SESSION_ASSET_FILE_NAMES: ['ppt-runtime.js', 'index-runtime.js']
}))

vi.mock('../../../src/main/tools/html-utils', () => ({
  validatePersistedPageHtml: () => ({ valid: true, errors: [] })
}))

vi.mock('../../../src/main/tools/font-registry', () => ({
  buildFontHeadTags: mocks.buildFontHeadTags
}))

vi.mock('../../../src/main/ipc/templates/template-service', () => ({
  loadTemplateManifest: vi.fn(),
  listTemplates: vi.fn()
}))

vi.mock('../../../src/main/ipc/templates/template-paths', () => ({
  resolveTemplateRelativePath: vi.fn()
}))

import {
  listMergeSourceSessions,
  mergeSessionPages
} from '../../../src/main/ipc/session/page-merge-service'

const wideSlideSize = {
  slideSizeId: 'wide-16-9',
  slideWidth: 1600,
  slideHeight: 900
}

describe('mergeSessionPages', () => {
  let root: string
  let sourceProjectDir: string
  let targetProjectDir: string
  let sourceSkeletons: Array<Record<string, unknown>>
  let upsertedPages: Array<{ id: string; title: string; pageNumber: number; fileSlug: string }>

  const createContext = () => ({
    db: {
      getSession: vi.fn(async (sessionId: string) => ({
        id: sessionId,
        title: sessionId === 'source' ? 'Source deck' : 'Target deck',
        status: 'completed',
        metadata: '{}',
        ...wideSlideSize
      })),
      listSessionsWithPageCounts: vi.fn(),
      listSourcePageSkeletons: vi.fn(async () => sourceSkeletons),
      upsertSessionPage: vi.fn(async (page) => {
        upsertedPages.push(page)
      }),
      upsertSourcePageSkeleton: vi.fn(),
      getProject: vi.fn(async () => ({ id: 'project', status: 'published' })),
      updateProjectStatus: vi.fn(),
      updateSessionStatus: vi.fn(),
      hardDeleteSessionPages: vi.fn(),
      deleteSourcePageSkeletons: vi.fn(),
      replaceSessionPageOrder: vi.fn(),
      updateSessionMetadata: vi.fn()
    },
    sessionRunStates: new Map(),
    getPageSourceUrl: (htmlPath?: string) => (htmlPath ? `file://${htmlPath}` : undefined)
  })

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'page-merge-service-'))
    sourceProjectDir = path.join(root, 'source')
    targetProjectDir = path.join(root, 'target')
    sourceSkeletons = []
    upsertedPages = []
    await fs.promises.mkdir(path.join(sourceProjectDir, 'images'), { recursive: true })
    await fs.promises.mkdir(path.join(sourceProjectDir, 'assets', 'custom-font'), {
      recursive: true
    })
    await fs.promises.mkdir(
      path.join(sourceProjectDir, 'assets', 'fonts', 'google-fonts', 'Source-Font'),
      { recursive: true }
    )
    await fs.promises.mkdir(
      path.join(targetProjectDir, 'assets', 'fonts', 'google-fonts', 'Target-Font'),
      { recursive: true }
    )
    await fs.promises.mkdir(targetProjectDir, { recursive: true })
    await fs.promises.writeFile(path.join(sourceProjectDir, 'images', 'shared.png'), 'image')
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'assets', 'custom-font', 'font.css'),
      '@font-face{font-family:Demo;src:url("./demo.woff2")}'
    )
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'assets', 'custom-font', 'demo.woff2'),
      'font'
    )
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'assets', 'fonts', 'google-fonts', 'Source-Font', 'source.woff2'),
      'source-font'
    )
    await fs.promises.writeFile(
      path.join(targetProjectDir, 'assets', 'fonts', 'google-fonts', 'Target-Font', 'target.woff2'),
      'target-font'
    )
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'page-two.html'),
      '<html><head><link rel="stylesheet" href="./assets/custom-font/font.css"><style data-ppt-fonts="google">@font-face{font-family:"Source Font";src:url("./assets/fonts/google-fonts/Source-Font/source.woff2") format("woff2")}</style><style data-ppt-fonts="1">:root{--ppt-title-font:"Source Font";--ppt-body-font:"Source Font"}</style><style>.source-font{font-family:"Source Font"}</style></head><body data-page-id="page-two"><img src="./images/shared.png"><p class="source-font">Two</p></body></html>'
    )
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'page-one.html'),
      '<html><body data-page-id="page-one"><p>One</p></body></html>'
    )
    await fs.promises.writeFile(
      path.join(targetProjectDir, 'existing.html'),
      '<html><head><style data-ppt-fonts="google">@font-face{font-family:"Target Font";src:url("./assets/fonts/google-fonts/Target-Font/target.woff2") format("woff2")}</style><style data-ppt-fonts="1">:root{--ppt-title-font:"Target Font";--ppt-body-font:"Target Font"}</style></head><body data-page-id="existing"><p>Existing</p></body></html>'
    )
    await fs.promises.writeFile(path.join(targetProjectDir, 'index.html'), '<html>old index</html>')

    mocks.loadEditableSessionPages.mockImplementation(async (_ctx, sessionId: string) => {
      if (sessionId === 'source') {
        return {
          session: wideSlideSize,
          projectDir: sourceProjectDir,
          indexPath: path.join(sourceProjectDir, 'index.html'),
          deckTitle: 'Source',
          pages: [
            {
              id: 'source-page-1',
              pageNumber: 1,
              pageId: 'page-one',
              title: 'One',
              htmlPath: path.join(sourceProjectDir, 'page-one.html'),
              status: 'completed'
            },
            {
              id: 'source-page-2',
              pageNumber: 2,
              pageId: 'page-two',
              title: 'Two',
              htmlPath: path.join(sourceProjectDir, 'page-two.html'),
              status: 'completed'
            }
          ]
        }
      }
      return {
        session: wideSlideSize,
        projectDir: targetProjectDir,
        indexPath: path.join(targetProjectDir, 'index.html'),
        deckTitle: 'Target',
        pages: [
          {
            id: 'target-page-1',
            pageNumber: 1,
            pageId: 'existing',
            title: 'Existing',
            htmlPath: path.join(targetProjectDir, 'existing.html'),
            status: 'completed'
          }
        ]
      }
    })
    mocks.persistManagedPages.mockImplementation(async (_ctx, args) => args.pages)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await fs.promises.rm(root, { recursive: true, force: true })
  })

  it('sorts selected source pages, copies resources, and records one history operation', async () => {
    const context = createContext()

    const result = await mergeSessionPages(context as never, {
      targetSessionId: 'target',
      sourceSessionId: 'source',
      sourcePageIds: ['source-page-2', 'source-page-1']
    })

    expect(upsertedPages.map((page) => page.title)).toEqual(['One', 'Two'])
    expect(upsertedPages.map((page) => page.pageNumber)).toEqual([2, 3])
    expect(result.insertedPageIds).toHaveLength(2)
    expect(result.generatedPages.map((page) => page.title)).toEqual(['Existing', 'One', 'Two'])
    expect(mocks.persistManagedPages).toHaveBeenCalledTimes(1)
    expect(mocks.recordHistoryOperationStrict).toHaveBeenCalledTimes(1)
    expect(mocks.logInfo).toHaveBeenCalledWith(
      '[page-merge]',
      expect.objectContaining({ stage: 'request:start', targetSessionId: 'target' })
    )
    expect(mocks.logInfo).toHaveBeenCalledWith(
      '[page-merge]',
      expect.objectContaining({
        stage: 'request:completed',
        insertedPageCount: 2,
        targetSessionId: 'target'
      })
    )

    const secondMergedPage = upsertedPages.find((page) => page.title === 'Two')
    expect(secondMergedPage).toBeDefined()
    const copiedHtml = await fs.promises.readFile(
      path.join(targetProjectDir, `${secondMergedPage?.fileSlug}.html`),
      'utf-8'
    )
    expect(copiedHtml).toContain('./assets/merged-pages/')
    expect(copiedHtml).toContain('font-family:"Target Font"')
    expect(copiedHtml).toContain('./assets/fonts/google-fonts/Target-Font/target.woff2')
    expect(copiedHtml).not.toContain('Source Font')
    expect(copiedHtml).not.toContain('Source-Font/source.woff2')
    const copiedAssets = await fs.promises.readdir(
      path.join(targetProjectDir, 'assets', 'merged-pages'),
      { recursive: true }
    )
    expect(copiedAssets.some((entry) => String(entry).endsWith('shared.png'))).toBe(true)
    expect(copiedAssets.some((entry) => String(entry).endsWith('demo.woff2'))).toBe(false)
    expect(copiedAssets.some((entry) => String(entry).endsWith('source.woff2'))).toBe(false)
    const copiedCssPath = copiedAssets.find((entry) => String(entry).endsWith('font.css'))
    expect(copiedCssPath).toBeDefined()
    expect(
      await fs.promises.readFile(
        path.join(targetProjectDir, 'assets', 'merged-pages', String(copiedCssPath)),
        'utf-8'
      )
    ).not.toContain('@font-face')
  })

  it('uses one aggregated query for source sessions', async () => {
    const context = createContext()
    context.db.listSessionsWithPageCounts.mockResolvedValue([
      {
        session: {
          id: 'target',
          title: 'Target',
          status: 'completed',
          updated_at: 3,
          ...wideSlideSize
        },
        pageCount: 1
      },
      {
        session: {
          id: 'source',
          title: 'Source',
          status: 'completed',
          updated_at: 2,
          ...wideSlideSize
        },
        pageCount: 4
      }
    ])

    const result = await listMergeSourceSessions(context as never, 'target')

    expect(context.db.listSessionsWithPageCounts).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      expect.objectContaining({ id: 'source', pageCount: 4, selectable: true })
    ])
  })

  it('disables and rejects source sessions with a different canvas size', async () => {
    const context = createContext()
    context.db.getSession.mockImplementation(async (sessionId: string) => ({
      id: sessionId,
      title: sessionId,
      status: 'completed',
      metadata: '{}',
      slideSizeId: sessionId === 'source' ? 'vertical-9-16' : 'wide-16-9',
      slideWidth: sessionId === 'source' ? 900 : 1600,
      slideHeight: sessionId === 'source' ? 1600 : 900
    }))
    context.db.listSessionsWithPageCounts.mockResolvedValue([
      {
        session: await context.db.getSession('source'),
        pageCount: 2
      }
    ])

    await expect(listMergeSourceSessions(context as never, 'target')).resolves.toEqual([
      expect.objectContaining({
        id: 'source',
        selectable: false,
        disabledReason: 'PAGE_MERGE_SLIDE_SIZE_MISMATCH'
      })
    ])
    await expect(
      mergeSessionPages(context as never, {
        targetSessionId: 'target',
        sourceSessionId: 'source',
        sourcePageIds: ['source-page-1']
      })
    ).rejects.toMatchObject({ code: 'PAGE_MERGE_SLIDE_SIZE_MISMATCH' })
  })

  it('rejects a page when a required local resource is missing', async () => {
    await fs.promises.writeFile(
      path.join(sourceProjectDir, 'page-one.html'),
      '<html><body data-page-id="page-one"><img src="./images/missing.png"></body></html>'
    )
    const context = createContext()

    await expect(
      mergeSessionPages(context as never, {
        targetSessionId: 'target',
        sourceSessionId: 'source',
        sourcePageIds: ['source-page-1']
      })
    ).rejects.toMatchObject({ code: 'PAGE_MERGE_PAGE_COPY_FAILED' })

    expect(upsertedPages).toEqual([])
  })

  it('copies source documents and rewrites the skeleton path', async () => {
    await fs.promises.mkdir(path.join(sourceProjectDir, 'docs'), { recursive: true })
    await fs.promises.writeFile(path.join(sourceProjectDir, 'docs', 'source.md'), '# source')
    sourceSkeletons = [
      {
        page_number: 2,
        title: 'Two',
        role: 'content',
        source_document_path: '/docs/source.md',
        source_document_name: 'source.md',
        source_heading: 'Two heading',
        heading_level: 1,
        line_start: 1,
        line_end: 2,
        reason: null,
        confidence: 'high'
      }
    ]
    const context = createContext()

    await mergeSessionPages(context as never, {
      targetSessionId: 'target',
      sourceSessionId: 'source',
      sourcePageIds: ['source-page-2']
    })

    expect(context.db.upsertSourcePageSkeleton).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocumentPath: expect.stringMatching(/^\/docs\/merged-pages\/mg_/),
        sourceHeading: 'Two heading'
      })
    )
    const copiedDocs = await fs.promises.readdir(
      path.join(targetProjectDir, 'docs', 'merged-pages'),
      { recursive: true }
    )
    expect(copiedDocs.some((entry) => String(entry).endsWith('source.md'))).toBe(true)
  })

  it('uses a legacy marker when the source document is missing', async () => {
    sourceSkeletons = [
      {
        page_number: 2,
        title: 'Two',
        role: 'content',
        source_document_path: '/docs/missing.md',
        source_document_name: 'missing.md',
        source_heading: 'Two heading',
        heading_level: 1,
        line_start: 1,
        line_end: 2,
        reason: null,
        confidence: 'medium'
      }
    ]
    const context = createContext()

    await mergeSessionPages(context as never, {
      targetSessionId: 'target',
      sourceSessionId: 'source',
      sourcePageIds: ['source-page-2']
    })

    expect(context.db.upsertSourcePageSkeleton).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocumentPath: expect.stringMatching(/^merged-session:mg_/)
      })
    )
  })

  it('rolls back database rows, files, resources, and index when commit fails', async () => {
    const context = createContext()
    context.db.getSession.mockImplementation(async (sessionId: string) => ({
      id: sessionId,
      title: sessionId === 'source' ? 'Source deck' : 'Target deck',
      status: sessionId === 'target' ? 'failed' : 'completed',
      metadata: '{}',
      ...wideSlideSize
    }))
    mocks.persistManagedPages.mockImplementationOnce(async (_ctx, args) => {
      await fs.promises.writeFile(args.indexPath, '<html>new index</html>')
      return args.pages
    })
    mocks.recordHistoryOperationStrict.mockRejectedValueOnce(new Error('history failed'))

    await expect(
      mergeSessionPages(context as never, {
        targetSessionId: 'target',
        sourceSessionId: 'source',
        sourcePageIds: ['source-page-2']
      })
    ).rejects.toThrow('history failed')

    expect(context.db.hardDeleteSessionPages).toHaveBeenCalledWith(
      'target',
      expect.arrayContaining([expect.any(String)])
    )
    expect(context.db.deleteSourcePageSkeletons).toHaveBeenCalled()
    expect(context.db.replaceSessionPageOrder).toHaveBeenCalledWith('target', [
      { id: 'target-page-1', pageNumber: 1 }
    ])
    expect(context.db.updateSessionStatus).toHaveBeenLastCalledWith('target', 'failed')
    expect(context.db.updateProjectStatus).toHaveBeenLastCalledWith('project', 'published')
    expect(await fs.promises.readFile(path.join(targetProjectDir, 'index.html'), 'utf-8')).toBe(
      '<html>old index</html>'
    )
    expect(
      await fs.promises.readdir(path.join(targetProjectDir, 'assets', 'merged-pages'), {
        recursive: true
      })
    ).toEqual([])
    for (const page of upsertedPages) {
      await expect(
        fs.promises.access(path.join(targetProjectDir, `${page.fileSlug}.html`))
      ).rejects.toThrow()
    }
  })

  it('removes newly staged target font files when merge commit fails', async () => {
    await fs.promises.writeFile(
      path.join(targetProjectDir, 'existing.html'),
      '<html><body data-page-id="existing"><p>Existing</p></body></html>'
    )
    mocks.buildFontHeadTags.mockImplementationOnce(async ({ projectDir }) => {
      const fontPath = path.join(
        projectDir,
        'assets',
        'fonts',
        'google-fonts',
        'Fallback-Font',
        'fallback.woff2'
      )
      await fs.promises.mkdir(path.dirname(fontPath), { recursive: true })
      await fs.promises.writeFile(fontPath, 'fallback-font')
      return '<style data-ppt-fonts="google">@font-face{font-family:"Fallback Font";src:url("./assets/fonts/google-fonts/Fallback-Font/fallback.woff2") format("woff2")}</style><style data-ppt-fonts="1">:root{--ppt-title-font:"Fallback Font";--ppt-body-font:"Fallback Font"}</style>'
    })
    mocks.recordHistoryOperationStrict.mockRejectedValueOnce(new Error('history failed'))
    const context = createContext()

    await expect(
      mergeSessionPages(context as never, {
        targetSessionId: 'target',
        sourceSessionId: 'source',
        sourcePageIds: ['source-page-1']
      })
    ).rejects.toThrow('history failed')

    await expect(
      fs.promises.access(
        path.join(
          targetProjectDir,
          'assets',
          'fonts',
          'google-fonts',
          'Fallback-Font',
          'fallback.woff2'
        )
      )
    ).rejects.toThrow()
  })

  it('logs the rollback stage when a compensation step fails', async () => {
    const context = createContext()
    context.db.hardDeleteSessionPages.mockRejectedValueOnce(new Error('delete failed'))
    mocks.recordHistoryOperationStrict.mockRejectedValueOnce(new Error('history failed'))
    await expect(
      mergeSessionPages(context as never, {
        targetSessionId: 'target',
        sourceSessionId: 'source',
        sourcePageIds: ['source-page-1']
      })
    ).rejects.toThrow('history failed')

    expect(mocks.logError).toHaveBeenCalledWith(
      '[page-merge]',
      expect.objectContaining({ stage: 'request:failed', failedStage: 'record-history' })
    )
    expect(mocks.logWarn).toHaveBeenCalledWith(
      '[page-merge]',
      expect.objectContaining({
        stage: 'rollback:delete-session-pages:failed',
        error: 'delete failed'
      })
    )
  })
})
