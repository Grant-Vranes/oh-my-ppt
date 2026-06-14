import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userDataPath: `/tmp/ohmyppt-thumbnail-test-${Date.now()}`,
  capturePage: vi.fn(async () => ({
    resize: vi.fn(() => ({ toPNG: vi.fn(() => Buffer.from('png')) }))
  })),
  destroy: vi.fn(),
  loadFile: vi.fn(async () => undefined),
  executeJavaScript: vi.fn(async () => undefined),
  setContentSize: vi.fn(),
  setZoomFactor: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => state.userDataPath) },
  BrowserWindow: vi.fn(function () {
    return {
      loadFile: state.loadFile,
      setContentSize: state.setContentSize,
      isDestroyed: vi.fn(() => false),
      destroy: state.destroy,
      webContents: {
        capturePage: state.capturePage,
        executeJavaScript: state.executeJavaScript,
        setZoomFactor: state.setZoomFactor
      }
    }
  })
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('../../../src/main/ipc/io/assets-handlers', () => ({ allowLocalAssetRoot: vi.fn() }))

describe('html thumbnail background service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(state.userDataPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('removes stale screenshot temp files during startup configuration', async () => {
    const cacheRoot = path.join(state.userDataPath, 'html-thumbnails-dev')
    fs.mkdirSync(cacheRoot, { recursive: true })
    const staleTempPath = path.join(cacheRoot, 'stale.png.tmp')
    const completedPath = path.join(cacheRoot, 'completed.png')
    fs.writeFileSync(staleTempPath, 'partial')
    fs.writeFileSync(completedPath, 'png')

    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService({} as never)

    expect(fs.existsSync(staleTempPath)).toBe(false)
    expect(fs.existsSync(completedPath)).toBe(true)
  })

  it('returns queued immediately and persists completion by real resource ID', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-source-'))
    const sourcePath = path.join(sourceRoot, 'index.html')
    fs.writeFileSync(sourcePath, '<!doctype html><html></html>')
    const records = new Map<string, Record<string, unknown>>()
    const db = {
      getThumbnailRecord: vi.fn(async (resourceType: string, resourceId: string, variant: string) =>
        records.get(`${resourceType}:${resourceId}:${variant}`)
      ),
      upsertThumbnailRecord: vi.fn(async (record: Record<string, unknown>) => {
        records.set(`${record.resourceType}:${record.resourceId}:${record.variant}`, record)
      })
    }

    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)
    const queued = await service.enqueueHtmlThumbnail({
      resourceType: 'session',
      resourceId: 'session-real-id',
      variant: 'cover',
      sourcePath
    })
    expect(queued).toMatchObject({ status: 'queued', resourceId: 'session-real-id' })

    await vi.waitFor(async () => {
      const task = await service.getHtmlThumbnailTask('session', 'session-real-id', 'cover')
      expect(task?.status).toBe('completed')
      expect(task?.thumbnailPath).toMatch(/\.png$/)
    })
    expect(db.upsertThumbnailRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'session',
        resourceId: 'session-real-id',
        variant: 'cover',
        status: 'completed'
      })
    )
    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })

  it('invalidates cached thumbnails when source mtime or capture signature changes', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-freshness-'))
    const sourcePath = path.join(sourceRoot, 'index.html')
    const thumbnailPath = path.join(sourceRoot, 'thumbnail.png')
    fs.writeFileSync(sourcePath, '<!doctype html><html></html>')
    fs.writeFileSync(thumbnailPath, 'png')
    const sourceMtimeMs = Math.floor(fs.statSync(sourcePath).mtimeMs)
    const request = {
      resourceType: 'style',
      resourceId: 'style-cache',
      sourcePath
    }
    const normalizedSignature = JSON.stringify({
      resourceType: request.resourceType,
      resourceId: request.resourceId,
      variant: 'default',
      sourcePath: request.sourcePath,
      query: {},
      captureWidth: 1600,
      captureHeight: 900,
      thumbnailWidth: 640,
      thumbnailHeight: 360
    })
    const record = {
      resourceType: 'style',
      resourceId: 'style-cache',
      variant: 'default',
      sourcePath,
      sourceMtimeMs,
      signature: normalizedSignature,
      thumbnailPath,
      status: 'completed',
      error: null
    }
    const db = { getThumbnailRecord: vi.fn(async () => record) }
    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)

    await expect(service.getFreshHtmlThumbnailPath(request)).resolves.toBe(thumbnailPath)
    await expect(
      service.getFreshHtmlThumbnailPath({ ...request, thumbnailWidth: 320 })
    ).resolves.toBeNull()

    const newerTime = new Date(sourceMtimeMs + 2_000)
    fs.utimesSync(sourcePath, newerTime, newerTime)
    await expect(service.getFreshHtmlThumbnailPath(request)).resolves.toBeNull()
    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })

  it('runs at most two screenshot tasks concurrently', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-concurrency-'))
    const sourcePaths = Array.from({ length: 3 }, (_, index) => {
      const sourcePath = path.join(sourceRoot, `${index + 1}.html`)
      fs.writeFileSync(sourcePath, '<!doctype html><html></html>')
      return sourcePath
    })
    const records = new Map<string, Record<string, unknown>>()
    const db = {
      getThumbnailRecord: vi.fn(async (resourceType: string, resourceId: string, variant: string) =>
        records.get(`${resourceType}:${resourceId}:${variant}`)
      ),
      upsertThumbnailRecord: vi.fn(async (record: Record<string, unknown>) => {
        records.set(`${record.resourceType}:${record.resourceId}:${record.variant}`, record)
      })
    }
    let activeCaptures = 0
    let maxActiveCaptures = 0
    const releaseCaptures: Array<() => void> = []
    state.capturePage.mockImplementation(async () => {
      activeCaptures += 1
      maxActiveCaptures = Math.max(maxActiveCaptures, activeCaptures)
      await new Promise<void>((resolve) => releaseCaptures.push(resolve))
      activeCaptures -= 1
      return {
        resize: vi.fn(() => ({ toPNG: vi.fn(() => Buffer.from('png')) }))
      }
    })

    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)
    await service.enqueueHtmlThumbnails(
      sourcePaths.map((sourcePath, index) => ({
        resourceType: 'style',
        resourceId: `style-${index + 1}`,
        sourcePath
      }))
    )

    await vi.waitFor(() => expect(state.capturePage).toHaveBeenCalledTimes(2))
    expect(maxActiveCaptures).toBe(2)
    releaseCaptures.shift()?.()
    await vi.waitFor(() => expect(state.capturePage).toHaveBeenCalledTimes(3))
    expect(maxActiveCaptures).toBe(2)
    while (releaseCaptures.length > 0) releaseCaptures.shift()?.()
    await vi.waitFor(async () => {
      const task = await service.getHtmlThumbnailTask('style', 'style-3')
      expect(task?.status).toBe('completed')
    })

    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })
})
