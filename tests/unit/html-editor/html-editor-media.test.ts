import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  importHtmlEditorMedia,
  isSupportedHtmlEditorMediaFile,
  listHtmlEditorMedia
} from '../../../src/main/ipc/html-editor/html-editor-media'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true }))
  )
})

describe('HTML editor media import', () => {
  it('accepts only supported media extensions', () => {
    expect(isSupportedHtmlEditorMediaFile('image', 'photo.WEBP')).toBe(true)
    expect(isSupportedHtmlEditorMediaFile('video', 'clip.webm')).toBe(true)
    expect(isSupportedHtmlEditorMediaFile('image', 'clip.mp4')).toBe(false)
    expect(isSupportedHtmlEditorMediaFile('video', 'document.pdf')).toBe(false)
  })

  it('copies the selected media into the current document workspace and returns a file URL', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'html-editor-media-'))
    roots.push(root)
    const sourcePath = path.join(root, 'source image.png')
    const workspaceDir = path.join(root, 'document')
    await fs.promises.writeFile(sourcePath, 'media-data')

    const result = await importHtmlEditorMedia({
      workspaceDir,
      sourcePath,
      mediaType: 'image'
    })

    expect(result.relativePath).toMatch(/^assets\/images\/source image-[\w-]+\.png$/)
    expect(result.url).toMatch(/^file:\/\//)
    expect(result.filePath).toContain(path.join('document', 'assets', 'images'))
    await expect(fs.promises.readFile(result.filePath, 'utf-8')).resolves.toBe('media-data')

    const imageAssets = await listHtmlEditorMedia({ workspaceDir, mediaType: 'image' })
    const videoAssets = await listHtmlEditorMedia({ workspaceDir, mediaType: 'video' })
    expect(imageAssets).toEqual([
      expect.objectContaining({
        filePath: result.filePath,
        relativePath: result.relativePath,
        url: result.url
      })
    ])
    expect(videoAssets).toEqual([])
  })
})
