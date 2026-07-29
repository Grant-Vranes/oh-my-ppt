import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: class BrowserWindow {},
  ipcMain: {},
  session: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { requireSlideSizePreset } from '../../../src/shared/slide-size'
import {
  PageWriteValidationError,
  persistPageHtmlFromFragment,
  verifyPresentationPageFiles
} from '../../../src/main/presentation/html/page-writer-core'
import {
  persistIndexTransition,
  verifyIndexShellFile
} from '../../../src/main/presentation/html/index-transition'
import { buildProjectIndexHtml } from '../../../src/main/session/template-builder'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ohmyppt-presentation-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true }))
  )
})

describe('presentation persistence capabilities', () => {
  it('owns page validation, runtime injection, serialized persistence, and verification', async () => {
    const projectDir = await createTemporaryDirectory()
    const pagePath = path.join(projectDir, 'page-1.html')
    const result = await persistPageHtmlFromFragment({
      content: '<section><h1>Quarterly review</h1><p>Growth is on track.</p></section>',
      pageId: 'page-1',
      projectDir,
      targetPath: pagePath,
      slideSize: requireSlideSizePreset('wide-16-9')
    })

    expect(result.html).toContain('data-ppt-guard-root="1"')
    await expect(fs.promises.readFile(pagePath, 'utf-8')).resolves.toBe(result.html)
    await expect(
      verifyPresentationPageFiles({ pageFileMap: { 'page-1': pagePath }, pageIds: ['page-1', 'missing'] })
    ).resolves.toEqual([
      {
        pageId: 'page-1',
        filled: true,
        hasContent: true,
        hasRemoteRuntime: false
      },
      {
        pageId: 'missing',
        filled: false,
        hasContent: false,
        hasRemoteRuntime: false
      }
    ])
  })

  it('keeps template skeleton validation and index persistence in presentation', async () => {
    const projectDir = await createTemporaryDirectory()
    const pagePath = path.join(projectDir, 'page-1.html')
    const templateHtml = '<div class="bg-cover" style="background-image: url(./images/template.png)"></div>'
    await fs.promises.writeFile(pagePath, templateHtml, 'utf-8')

    await expect(
      persistPageHtmlFromFragment({
        content: '<section><h1>New content</h1></section>',
        pageId: 'page-1',
        projectDir,
        targetPath: pagePath,
        slideSize: requireSlideSizePreset('wide-16-9'),
        preserveTemplateSkeleton: true
      })
    ).rejects.toMatchObject<PageWriteValidationError>({ kind: 'template-skeleton' })
    await expect(fs.promises.readFile(pagePath, 'utf-8')).resolves.toBe(templateHtml)

    const indexPath = path.join(projectDir, 'index.html')
    await fs.promises.writeFile(
      indexPath,
      buildProjectIndexHtml(
        'Review',
        [{ pageNumber: 1, pageId: 'page-1', title: 'Overview', htmlPath: 'page-1.html' }],
        requireSlideSizePreset('wide-16-9')
      ),
      'utf-8'
    )
    await expect(verifyIndexShellFile(indexPath)).resolves.toEqual({ status: 'valid' })
    await expect(
      persistIndexTransition({
        indexPath,
        projectDir,
        input: { type: 'fade', durationMs: 420 }
      })
    ).resolves.toMatchObject({ status: 'updated', config: { type: 'fade', durationMs: 420 } })
    await expect(fs.promises.readFile(indexPath, 'utf-8')).resolves.toContain(
      '"durationMs":420'
    )
  })
})
