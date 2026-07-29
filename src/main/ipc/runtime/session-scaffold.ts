import fs from 'fs'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import {
  buildPageScaffoldHtml,
  buildProjectIndexHtml,
  SESSION_ASSET_FILE_NAMES,
  type DeckPageFile
} from '../../session/template-builder'

export type SessionScaffold = {
  resolveSessionAssetSourcePath(fileName: string): string
  ensureSessionAssets(projectDir: string): Promise<void>
  scaffoldProjectFiles(args: {
    deckTitle: string
    indexPath: string
    pages: Array<{ pageNumber: number; pageId: string; title: string; htmlPath: string }>
    slideSize: import('@shared/slide-size').SlideSizePreset
  }): Promise<void>
}

export function createSessionScaffold(): SessionScaffold {
  const resolveSessionAssetSourcePath = (fileName: string): string => {
    const baseDir = is.dev
      ? path.join(process.cwd(), 'resources')
      : path.join(process.resourcesPath, 'app.asar.unpacked', 'resources')
    const sourcePath = path.join(baseDir, fileName)
    if (fs.existsSync(sourcePath)) return sourcePath
    throw new Error(`缺少资源文件 ${fileName}。期望路径: ${sourcePath}`)
  }

  const ensureSessionAssets = async (projectDir: string): Promise<void> => {
    const assetsDir = path.join(projectDir, 'assets')
    const imagesDir = path.join(projectDir, 'images')
    const videosDir = path.join(projectDir, 'videos')
    const docsDir = path.join(projectDir, 'docs')
    await fs.promises.mkdir(assetsDir, { recursive: true })
    await fs.promises.mkdir(imagesDir, { recursive: true })
    await fs.promises.mkdir(videosDir, { recursive: true })
    await fs.promises.mkdir(docsDir, { recursive: true })
    await Promise.all(
      SESSION_ASSET_FILE_NAMES.map(async (sourceRelPath) => {
        const sourcePath = resolveSessionAssetSourcePath(sourceRelPath)
        const targetPath = path.join(assetsDir, sourceRelPath)
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
        await fs.promises.copyFile(sourcePath, targetPath)
      })
    )
    const katexFontsSource = resolveSessionAssetSourcePath('katex/fonts')
    const katexFontsTarget = path.join(assetsDir, 'katex', 'fonts')
    await fs.promises.mkdir(katexFontsTarget, { recursive: true })
    const katexFontFiles = await fs.promises.readdir(katexFontsSource)
    await Promise.all(
      katexFontFiles
        .filter((fileName) => fileName.endsWith('.woff2'))
        .map((fileName) =>
          fs.promises.copyFile(
            path.join(katexFontsSource, fileName),
            path.join(katexFontsTarget, fileName)
          )
        )
    )
  }

  const scaffoldProjectFiles = async (args: {
    deckTitle: string
    indexPath: string
    pages: Array<{ pageNumber: number; pageId: string; title: string; htmlPath: string }>
    slideSize: import('@shared/slide-size').SlideSizePreset
  }): Promise<void> => {
    const { deckTitle, indexPath, pages, slideSize } = args
    await Promise.all(
      pages.map((page) =>
        fs.promises.writeFile(
          page.htmlPath,
          buildPageScaffoldHtml(
            {
              pageNumber: page.pageNumber,
              pageId: page.pageId,
              title: page.title
            },
            slideSize
          ),
          'utf-8'
        )
      )
    )
    await fs.promises.writeFile(
      indexPath,
      buildProjectIndexHtml(
        deckTitle,
        pages.map(
          (page): DeckPageFile => ({
            pageNumber: page.pageNumber,
            pageId: page.pageId,
            title: page.title,
            htmlPath: path.basename(page.htmlPath)
          })
        ),
        slideSize
      ),
      'utf-8'
    )
  }

  return { resolveSessionAssetSourcePath, ensureSessionAssets, scaffoldProjectFiles }
}
