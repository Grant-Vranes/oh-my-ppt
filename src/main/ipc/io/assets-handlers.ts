import { is } from '@electron-toolkit/utils'
import { BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import type { IpcContext } from '../context'
import { getUserFontsRoot } from '../../tools/font-registry'

const ASSET_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  js: 'text/javascript',
  css: 'text/css',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  html: 'text/html'
}

const dynamicAllowedRoots = new Set<string>()

const getResourcesRoot = (): string =>
  is.dev ? path.join(process.cwd(), 'resources') : path.join(process.resourcesPath, 'app.asar.unpacked', 'resources')

const normalizeExistingPath = (filePath: string): string => {
  const resolved = path.resolve(filePath)
  try {
    return fs.realpathSync(resolved)
  } catch {
    return resolved
  }
}

const isPathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

const getStaticAllowedRoots = (): string[] => [getResourcesRoot(), getUserFontsRoot()]

export const resolveAllowedLocalAssetPath = (filePath: string): string | null => {
  const normalizedFile = normalizeExistingPath(filePath)
  const roots = [...getStaticAllowedRoots(), ...dynamicAllowedRoots]
    .map(normalizeExistingPath)
    .filter((root) => root.length > 0)
  return roots.some((root) => isPathInside(normalizedFile, root)) ? normalizedFile : null
}

export function allowLocalAssetRoot(rootPath: string): void {
  if (!rootPath.trim()) return
  dynamicAllowedRoots.add(normalizeExistingPath(rootPath))
}

export function registerLocalAssetProtocol(): void {
  protocol.handle('local-asset', (request) => {
    const requestedPath = decodeURIComponent(
      request.url.replace('local-asset://', '').split(/[?#]/, 1)[0]
    )
    const filePath = resolveAllowedLocalAssetPath(requestedPath)
    if (!filePath) return new Response('Forbidden', { status: 403 })
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const mime = ASSET_MIME_MAP[ext] || 'application/octet-stream'
      const fileSize = stat.size

      const range = request.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (!m) return new Response('Invalid range', { status: 416 })
        const start = m[1] ? parseInt(m[1], 10) : 0
        const end = m[2] ? Math.min(parseInt(m[2], 10), fileSize - 1) : fileSize - 1
        if (start > end || start >= fileSize) {
          return new Response('Range not satisfiable', { status: 416 })
        }
        const len = end - start + 1
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, start)
        fs.closeSync(fd)
        return new Response(buf, {
          status: 206,
          headers: {
            'content-type': mime,
            'content-range': `bytes ${start}-${end}/${fileSize}`,
            'content-length': String(len),
            'accept-ranges': 'bytes'
          }
        })
      }

      const data = fs.readFileSync(filePath)
      return new Response(data, {
        headers: {
          'content-type': mime,
          'accept-ranges': 'bytes',
          'content-length': String(fileSize)
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export function registerAssetHandlers(ctx: IpcContext): void {
  const { mainWindow, uploadMediaAssets, resolveSessionProjectDir } = ctx

  ipcMain.handle('assets:upload', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const files = Array.isArray(record.files)
      ? (record.files as Array<Record<string, unknown>>)
      : []
    return { assets: await uploadMediaAssets(sessionId, files) }
  })

  ipcMain.handle('assets:chooseAndUpload', async (event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const assetType =
      record.assetType === 'video' ? 'video' : record.assetType === 'image' ? 'image' : 'image'
    if (!sessionId) throw new Error('sessionId 不能为空')

    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
    const result = await dialog.showOpenDialog(win, {
      title: assetType === 'video' ? '选择视频素材' : '选择图片素材',
      properties: ['openFile', 'multiSelections'],
      filters:
        assetType === 'video'
          ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] }]
          : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { assets: [], cancelled: true }
    }
    const assets = await uploadMediaAssets(
      sessionId,
      result.filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath)
      }))
    )
    return { assets, cancelled: false }
  })

  ipcMain.handle('assets:list', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const assetType =
      record.assetType === 'video' ? 'video' : record.assetType === 'image' ? 'image' : 'image'
    if (!sessionId) throw new Error('sessionId 不能为空')

    const dirName = assetType === 'video' ? 'videos' : 'images'
    const projectDir = await resolveSessionProjectDir(sessionId)
    const targetDir = path.join(projectDir, dirName)
    allowLocalAssetRoot(targetDir)
    if (!fs.existsSync(targetDir)) return { assets: [] }

    const files = await fs.promises.readdir(targetDir)
    const assets = files
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({
        fileName: f,
        relativePath: `./${dirName}/${f}`,
        absolutePath: path.join(targetDir, f)
      }))
    return { assets }
  })
}
