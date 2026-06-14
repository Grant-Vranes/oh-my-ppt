import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pLimit from 'p-limit'
import type { PPTDatabase, ThumbnailRecord } from '../db/database'
import { allowLocalAssetRoot } from '../ipc/io/assets-handlers'

const DEFAULT_CAPTURE_WIDTH = 1600
const DEFAULT_CAPTURE_HEIGHT = 900
const DEFAULT_THUMBNAIL_WIDTH = 640
const DEFAULT_THUMBNAIL_HEIGHT = 360
export const HTML_THUMBNAIL_CONCURRENCY = 2

export type HtmlThumbnailRequest = {
  resourceType: string
  resourceId: string
  variant?: string
  sourcePath: string
  query?: Record<string, string>
  captureWidth?: number
  captureHeight?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export type HtmlThumbnailTaskStatus = 'queued' | 'running' | 'completed' | 'failed'

export type HtmlThumbnailTask = {
  resourceType: string
  resourceId: string
  variant: string
  status: HtmlThumbnailTaskStatus
  thumbnailPath: string | null
  error?: string
}

let thumbnailDb: PPTDatabase | null = null
const thumbnailLimit = pLimit(HTML_THUMBNAIL_CONCURRENCY)
const backgroundTasks = new Map<string, HtmlThumbnailTask>()
const taskListeners = new Set<(task: HtmlThumbnailTask) => void>()

export function configureHtmlThumbnailService(db: PPTDatabase): void {
  thumbnailDb = db
  const cacheRoot = resolveHtmlThumbnailCacheRoot()
  fs.mkdirSync(cacheRoot, { recursive: true })
  for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tmp')) {
      try {
        fs.rmSync(path.join(cacheRoot, entry.name), { force: true })
      } catch {
        // A stale temp file must not prevent the app from starting.
      }
    }
  }
  allowLocalAssetRoot(cacheRoot)
}

export function onHtmlThumbnailTaskChanged(
  listener: (task: HtmlThumbnailTask) => void
): () => void {
  taskListeners.add(listener)
  return () => taskListeners.delete(listener)
}

function emitTaskChanged(task: HtmlThumbnailTask): void {
  for (const listener of taskListeners) listener({ ...task })
}

function getDb(): PPTDatabase {
  if (!thumbnailDb) throw new Error('Thumbnail service is not initialized')
  return thumbnailDb
}

function thumbnailTaskKey(resourceType: string, resourceId: string, variant: string): string {
  return `${resourceType}\u0000${resourceId}\u0000${variant}`
}

function normalizeDimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(64, Math.min(4096, Math.round(value)))
    : fallback
}

function normalizeRequest(request: HtmlThumbnailRequest): Required<HtmlThumbnailRequest> {
  const query = Object.fromEntries(
    Object.entries(request.query || {})
      .map(([key, value]) => [String(key), String(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  )
  return {
    resourceType: String(request.resourceType || '').trim(),
    resourceId: String(request.resourceId || '').trim(),
    variant: String(request.variant || 'default').trim() || 'default',
    sourcePath: path.resolve(request.sourcePath),
    query,
    captureWidth: normalizeDimension(request.captureWidth, DEFAULT_CAPTURE_WIDTH),
    captureHeight: normalizeDimension(request.captureHeight, DEFAULT_CAPTURE_HEIGHT),
    thumbnailWidth: normalizeDimension(request.thumbnailWidth, DEFAULT_THUMBNAIL_WIDTH),
    thumbnailHeight: normalizeDimension(request.thumbnailHeight, DEFAULT_THUMBNAIL_HEIGHT)
  }
}

function validateRequest(request: Required<HtmlThumbnailRequest>): void {
  if (!request.resourceType) throw new Error('Thumbnail resourceType is required')
  if (!request.resourceId) throw new Error('Thumbnail resourceId is required')
}

function requestSignature(request: Required<HtmlThumbnailRequest>): string {
  return JSON.stringify(request)
}

export function resolveHtmlThumbnailCacheRoot(): string {
  return path.join(app.getPath('userData'), is.dev ? 'html-thumbnails-dev' : 'html-thumbnails')
}

export function resolveHtmlThumbnailPath(
  resourceType: string,
  resourceId: string,
  variant = 'default'
): string {
  const key = createHash('sha256')
    .update(JSON.stringify({ resourceType, resourceId, variant }))
    .digest('hex')
    .slice(0, 32)
  return path.join(resolveHtmlThumbnailCacheRoot(), `${key}.png`)
}

function recordToTask(record: ThumbnailRecord | undefined): HtmlThumbnailTask | null {
  if (!record) return null
  return {
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    variant: record.variant,
    status: record.status,
    thumbnailPath:
      record.status === 'completed' && record.thumbnailPath && fs.existsSync(record.thumbnailPath)
        ? record.thumbnailPath
        : null,
    error: record.error || undefined
  }
}

export async function getHtmlThumbnailTask(
  resourceType: string,
  resourceId: string,
  variant = 'default'
): Promise<HtmlThumbnailTask | null> {
  const normalizedVariant = variant.trim() || 'default'
  const key = thumbnailTaskKey(resourceType, resourceId, normalizedVariant)
  const activeTask = backgroundTasks.get(key)
  if (activeTask) return { ...activeTask }
  const record = await getDb().getThumbnailRecord(resourceType, resourceId, normalizedVariant)
  return recordToTask(record)
}

export async function getFreshHtmlThumbnailPath(
  request: HtmlThumbnailRequest
): Promise<string | null> {
  const normalized = normalizeRequest(request)
  validateRequest(normalized)
  if (!fs.existsSync(normalized.sourcePath)) return null
  const record = await getDb().getThumbnailRecord(
    normalized.resourceType,
    normalized.resourceId,
    normalized.variant
  )
  if (!record || record.status !== 'completed' || !fs.existsSync(record.thumbnailPath)) return null

  try {
    const sourceMtimeMs = Math.floor(fs.statSync(normalized.sourcePath).mtimeMs)
    return record.signature === requestSignature(normalized) && record.sourceMtimeMs >= sourceMtimeMs
      ? record.thumbnailPath
      : null
  } catch {
    return null
  }
}

async function ensureThumbnailCacheRoot(): Promise<void> {
  const cacheRoot = resolveHtmlThumbnailCacheRoot()
  await fs.promises.mkdir(cacheRoot, { recursive: true })
  allowLocalAssetRoot(cacheRoot)
}

function createCaptureWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: DEFAULT_CAPTURE_WIDTH,
    height: DEFAULT_CAPTURE_HEIGHT,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: false
    }
  })
}

async function captureThumbnail(
  window: BrowserWindow,
  request: Required<HtmlThumbnailRequest>
): Promise<Buffer> {
  window.webContents.setZoomFactor(1)
  window.setContentSize(request.captureWidth, request.captureHeight)
  await window.loadFile(request.sourcePath, { query: request.query })
  await window.webContents.executeJavaScript(
    `Promise.resolve(document.fonts?.ready).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))`
  )
  const image = await window.webContents.capturePage({
    x: 0,
    y: 0,
    width: request.captureWidth,
    height: request.captureHeight
  })
  return image
    .resize({
      width: request.thumbnailWidth,
      height: request.thumbnailHeight,
      quality: 'best'
    })
    .toPNG()
}

async function persistTask(
  request: Required<HtmlThumbnailRequest>,
  status: HtmlThumbnailTaskStatus,
  thumbnailPath: string,
  error?: string
): Promise<void> {
  const sourceMtimeMs = fs.existsSync(request.sourcePath)
    ? Math.floor((await fs.promises.stat(request.sourcePath)).mtimeMs)
    : 0
  await getDb().upsertThumbnailRecord({
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    variant: request.variant,
    sourcePath: request.sourcePath,
    sourceMtimeMs,
    signature: requestSignature(request),
    thumbnailPath,
    status,
    error: error || null
  })
}

export async function enqueueHtmlThumbnail(
  request: HtmlThumbnailRequest,
  options: { force?: boolean; delayMs?: number } = {}
): Promise<HtmlThumbnailTask> {
  const normalized = normalizeRequest(request)
  validateRequest(normalized)
  const key = thumbnailTaskKey(
    normalized.resourceType,
    normalized.resourceId,
    normalized.variant
  )
  const existing = backgroundTasks.get(key)
  if (existing?.status === 'queued' || existing?.status === 'running') return { ...existing }

  if (!options.force) {
    const thumbnailPath = await getFreshHtmlThumbnailPath(normalized)
    if (thumbnailPath) {
      const completed: HtmlThumbnailTask = {
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        variant: normalized.variant,
        status: 'completed',
        thumbnailPath
      }
      return { ...completed }
    }
  }

  const queued: HtmlThumbnailTask = {
    resourceType: normalized.resourceType,
    resourceId: normalized.resourceId,
    variant: normalized.variant,
    status: 'queued',
    thumbnailPath: null
  }
  backgroundTasks.set(key, queued)
  await persistTask(normalized, 'queued', queued.thumbnailPath || '')
  emitTaskChanged(queued)

  const readyAt = Date.now() + Math.max(0, options.delayMs || 0)
  void thumbnailLimit(async () => {
    const remainingDelayMs = readyAt - Date.now()
    if (remainingDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelayMs))
    }
    let pendingPath = ''
    try {
      const running = { ...queued, status: 'running' as const }
      backgroundTasks.set(key, running)
      await persistTask(normalized, 'running', '')
      emitTaskChanged(running)
      await ensureThumbnailCacheRoot()
      const thumbnailPath = resolveHtmlThumbnailPath(
        normalized.resourceType,
        normalized.resourceId,
        normalized.variant
      )
      pendingPath = `${thumbnailPath}.tmp`
      const window = createCaptureWindow()
      try {
        const png = await captureThumbnail(window, normalized)
        await fs.promises.writeFile(pendingPath, png)
        await fs.promises.rename(pendingPath, thumbnailPath)
      } finally {
        if (!window.isDestroyed()) window.destroy()
      }
      const completed: HtmlThumbnailTask = {
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        variant: normalized.variant,
        status: 'completed',
        thumbnailPath
      }
      await persistTask(normalized, 'completed', thumbnailPath)
      emitTaskChanged(completed)
      backgroundTasks.delete(key)
    } catch (error) {
      if (pendingPath) await fs.promises.rm(pendingPath, { force: true }).catch(() => undefined)
      const message = error instanceof Error ? error.message : String(error)
      const failed: HtmlThumbnailTask = {
        ...queued,
        status: 'failed',
        error: message
      }
      backgroundTasks.set(key, failed)
      await persistTask(normalized, 'failed', '', message).catch(() => undefined)
      emitTaskChanged(failed)
      backgroundTasks.delete(key)
    }
  }).catch(() => backgroundTasks.delete(key))

  return { ...queued }
}

export async function enqueueHtmlThumbnails(
  requests: HtmlThumbnailRequest[],
  options: { force?: boolean; delayMs?: number } = {}
): Promise<HtmlThumbnailTask[]> {
  const tasks: HtmlThumbnailTask[] = []
  for (let index = 0; index < requests.length; index += 1) {
    tasks.push(
      await enqueueHtmlThumbnail(requests[index], {
        force: options.force,
        delayMs: options.delayMs
      })
    )
  }
  return tasks
}
