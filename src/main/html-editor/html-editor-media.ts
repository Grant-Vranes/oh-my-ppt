import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'
import { nanoid } from 'nanoid'

export type HtmlEditorMediaType = 'image' | 'video'

const MEDIA_EXTENSIONS: Record<HtmlEditorMediaType, ReadonlySet<string>> = {
  image: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']),
  video: new Set(['.mp4', '.webm', '.ogg', '.ogv'])
}

export function isSupportedHtmlEditorMediaFile(
  mediaType: HtmlEditorMediaType,
  sourcePath: string
): boolean {
  return MEDIA_EXTENSIONS[mediaType].has(path.extname(sourcePath).toLowerCase())
}

export function getHtmlEditorMediaExtensions(mediaType: HtmlEditorMediaType): string[] {
  return [...MEDIA_EXTENSIONS[mediaType]].map((extension) => extension.slice(1))
}

export interface HtmlEditorMediaAsset {
  fileName: string
  filePath: string
  relativePath: string
  url: string
}

function getMediaDir(workspaceDir: string, mediaType: HtmlEditorMediaType): string {
  return path.join(workspaceDir, 'assets', mediaType === 'video' ? 'videos' : 'images')
}

export async function listHtmlEditorMedia(input: {
  workspaceDir: string
  mediaType: HtmlEditorMediaType
}): Promise<HtmlEditorMediaAsset[]> {
  const mediaDir = getMediaDir(input.workspaceDir, input.mediaType)
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(mediaDir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        isSupportedHtmlEditorMediaFile(input.mediaType, entry.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const filePath = path.join(mediaDir, entry.name)
      return {
        fileName: entry.name,
        filePath,
        relativePath: path.relative(input.workspaceDir, filePath).split(path.sep).join('/'),
        url: pathToFileURL(filePath).href
      }
    })
}

export async function importHtmlEditorMedia(input: {
  workspaceDir: string
  sourcePath: string
  mediaType: HtmlEditorMediaType
}): Promise<{ filePath: string; relativePath: string; url: string }> {
  const { workspaceDir, sourcePath, mediaType } = input
  if (!isSupportedHtmlEditorMediaFile(mediaType, sourcePath)) {
    throw new Error(mediaType === 'video' ? '不支持的视频格式' : '不支持的图片格式')
  }

  const sourceStat = await fs.promises.stat(sourcePath)
  if (!sourceStat.isFile()) throw new Error('所选媒体文件不可用')

  const extension = path.extname(sourcePath).toLowerCase()
  const originalName = path.basename(sourcePath, path.extname(sourcePath)).trim() || mediaType
  const mediaDir = getMediaDir(workspaceDir, mediaType)
  const fileName = `${originalName}-${nanoid(8)}${extension}`
  const filePath = path.join(mediaDir, fileName)

  await fs.promises.mkdir(mediaDir, { recursive: true })
  await fs.promises.copyFile(sourcePath, filePath)

  return {
    filePath,
    relativePath: path.relative(workspaceDir, filePath).split(path.sep).join('/'),
    url: pathToFileURL(filePath).href
  }
}
