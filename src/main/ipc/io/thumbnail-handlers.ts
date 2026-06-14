import { ipcMain } from 'electron'
import {
  enqueueHtmlThumbnail,
  enqueueHtmlThumbnails,
  getHtmlThumbnailTask,
  onHtmlThumbnailTaskChanged,
  type HtmlThumbnailRequest
} from '../../utils/html-thumbnail-service'
import { resolveAllowedLocalAssetPath } from './assets-handlers'
import type { IpcContext } from '../context'

const MAX_BATCH_SIZE = 100

function parseRequest(payload: unknown): HtmlThumbnailRequest {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const resourceType = typeof record.resourceType === 'string' ? record.resourceType.trim() : ''
  const resourceId = typeof record.resourceId === 'string' ? record.resourceId.trim() : ''
  if (!resourceType || !resourceId) throw new Error('缩略图资源类型或 ID 为空')
  const requestedPath = typeof record.sourcePath === 'string' ? record.sourcePath.trim() : ''
  const sourcePath = requestedPath ? resolveAllowedLocalAssetPath(requestedPath) : null
  if (!sourcePath || !sourcePath.toLowerCase().endsWith('.html')) {
    throw new Error('HTML 路径无效或不在允许目录中')
  }
  const queryRecord =
    record.query && typeof record.query === 'object'
      ? (record.query as Record<string, unknown>)
      : {}
  const query = Object.fromEntries(
    Object.entries(queryRecord).map(([key, value]) => [key, String(value)])
  )
  return {
    resourceType,
    resourceId,
    variant: typeof record.variant === 'string' ? record.variant.trim() : undefined,
    sourcePath,
    query,
    captureWidth: typeof record.captureWidth === 'number' ? record.captureWidth : undefined,
    captureHeight: typeof record.captureHeight === 'number' ? record.captureHeight : undefined,
    thumbnailWidth: typeof record.thumbnailWidth === 'number' ? record.thumbnailWidth : undefined,
    thumbnailHeight: typeof record.thumbnailHeight === 'number' ? record.thumbnailHeight : undefined
  }
}

export function registerThumbnailHandlers(ctx: IpcContext): void {
  onHtmlThumbnailTaskChanged((task) => {
    if (ctx.mainWindow.isDestroyed() || ctx.mainWindow.webContents.isDestroyed()) return
    ctx.mainWindow.webContents.send('thumbnails:changed', task)
  })
  ipcMain.handle('thumbnails:get', async (_event, payload) => {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const resourceType = typeof record.resourceType === 'string' ? record.resourceType.trim() : ''
    const resourceId = typeof record.resourceId === 'string' ? record.resourceId.trim() : ''
    if (!resourceType || !resourceId) throw new Error('缩略图资源类型或 ID 为空')
    return getHtmlThumbnailTask(
      resourceType,
      resourceId,
      typeof record.variant === 'string' ? record.variant : undefined
    )
  })

  ipcMain.handle('thumbnails:enqueue', async (_event, payload) => {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    return await enqueueHtmlThumbnail(parseRequest(payload), {
      force: record.force === true
    })
  })

  ipcMain.handle('thumbnails:enqueueBatch', async (_event, payload) => {
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const rawItems = Array.isArray(record.items) ? record.items.slice(0, MAX_BATCH_SIZE) : []
    return {
      tasks: await enqueueHtmlThumbnails(rawItems.map(parseRequest), {
        force: record.force === true
      })
    }
  })
}
