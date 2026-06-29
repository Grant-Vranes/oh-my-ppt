import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { requireSlideSizePreset } from '../../../src/shared/slide-size'

const mocks = vi.hoisted(() => ({
  recordHistoryOperationStrict: vi.fn(),
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

vi.mock('../../../src/main/history/git-history-service', () => ({
  recordHistoryOperationStrict: mocks.recordHistoryOperationStrict
}))

vi.mock('../../../src/main/ipc/engine/template', () => ({
  buildProjectIndexHtml: (
    title: string,
    pages: Array<{ pageNumber: number; pageId: string; title: string; htmlPath: string }>,
    slideSize: { id: string; width: number; height: number }
  ) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${title} · Preview</title>
  </head>
  <body>
    <script type="application/json" id="pages-data">${JSON.stringify(
      pages.map((page) => ({
        pageNumber: page.pageNumber,
        pageId: page.pageId,
        title: page.title,
        htmlPath: page.htmlPath
      }))
    )}</script>
    <script type="application/json" id="deck-metadata">${JSON.stringify({
      slideSizeId: slideSize.id,
      width: slideSize.width,
      height: slideSize.height
    })}</script>
  </body>
</html>`,
  extractPagesDataFromIndex: (html: string) => {
    const pagesMatch = html.match(
      /<script type="application\/json" id="pages-data">([\s\S]*?)<\/script>/i
    )
    if (!pagesMatch?.[1]) return []
    return JSON.parse(pagesMatch[1]) as Array<{
      pageNumber: number
      pageId: string
      title: string
      htmlPath: string
    }>
  }
}))

vi.mock('../../../src/main/utils/style-skills', () => ({
  resolveUsableStyleId: () => 'minimal-white'
}))

import { importSessionFile } from '../../../src/main/session-import/session-importer'

describe('importSessionFile', () => {
  const roots: string[] = []

  afterEach(async () => {
    vi.clearAllMocks()
    for (const root of roots.splice(0)) {
      await fs.promises.rm(root, { recursive: true, force: true })
    }
  })

  it('persists the slide size recovered from imported deck metadata', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'session-importer-test-'))
    roots.push(root)
    const storageDir = path.join(root, 'storage')
    const zipPath = path.join(root, 'square-session.zip')
    const slideSize = requireSlideSizePreset('square-1-1')
    const indexHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Square import</title>
  </head>
  <body>
    <script type="application/json" id="pages-data">${JSON.stringify([
      {
        pageNumber: 1,
        pageId: 'page-1',
        title: 'Square page',
        htmlPath: 'page-1.html'
      }
    ])}</script>
    <script type="application/json" id="deck-metadata">${JSON.stringify({
      slideSizeId: slideSize.id,
      width: slideSize.width,
      height: slideSize.height
    })}</script>
  </body>
</html>`
    await fs.promises.writeFile(
      zipPath,
      Buffer.from(
        zipSync({
          'index.html': strToU8(indexHtml),
          'page-1.html': strToU8(
            '<!doctype html><html><body><main class="ppt-page-root">Square</main></body></html>'
          )
        })
      )
    )

    let sessionRecord: Record<string, unknown> | null = null
    let projectRecord: Record<string, unknown> | null = null
    let generationRun: Record<string, unknown> | null = null
    const sessionPages: Array<Record<string, unknown>> = []
    const db = {
      createSession: vi.fn(async (data: Record<string, unknown>) => {
        sessionRecord = {
          ...data,
          status: 'active',
          currentCommit: 'commit-1'
        }
        return String(data.id)
      }),
      updateSessionDesignContract: vi.fn(),
      createProject: vi.fn(async (data: Record<string, unknown>) => {
        projectRecord = { id: 'project-1', ...data }
        return 'project-1'
      }),
      createGenerationRun: vi.fn(async (data: Record<string, unknown>) => {
        generationRun = { id: 'run-1', ...data, status: 'running' }
        return 'run-1'
      }),
      upsertGenerationPage: vi.fn(),
      upsertSessionPage: vi.fn(async (data: Record<string, unknown>) => {
        sessionPages.push({
          ...data,
          html_path: data.htmlPath,
          status: data.status
        })
      }),
      updateGenerationRunStatus: vi.fn(async (_runId: string, status: string) => {
        generationRun = generationRun ? { ...generationRun, status } : generationRun
      }),
      updateSessionMetadata: vi.fn(),
      updateProjectStatus: vi.fn(),
      updateSessionStatus: vi.fn(async (_sessionId: string, status: string) => {
        sessionRecord = sessionRecord ? { ...sessionRecord, status } : sessionRecord
      }),
      getSession: vi.fn(async () => sessionRecord),
      getProject: vi.fn(async () => ({
        id: projectRecord?.id,
        root_path: projectRecord?.root_path
      })),
      listSessionPages: vi.fn(async () => sessionPages),
      getLatestGenerationRun: vi.fn(async () => generationRun),
      listSessionOperations: vi.fn(async () => [{ id: 'op-1', type: 'import' }]),
      deleteSession: vi.fn()
    }
    const ctx = {
      db,
      resolveStoragePath: vi.fn(async () => storageDir),
      ensureSessionAssets: vi.fn()
    }

    await expect(importSessionFile(ctx as never, zipPath)).resolves.toMatchObject({
      success: true,
      pageCount: 1,
      title: 'Square import'
    })

    expect(db.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        slideSizeId: 'square-1-1',
        slideWidth: 1200,
        slideHeight: 1200
      })
    )
    expect(mocks.recordHistoryOperationStrict).toHaveBeenCalledTimes(1)
  })
})
