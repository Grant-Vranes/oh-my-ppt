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

  it('persists template cover completion with the template resource type', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-template-thumbnail-source-'))
    const sourcePath = path.join(sourceRoot, 'page-1.html')
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
    await service.enqueueHtmlThumbnail({
      resourceType: 'template',
      resourceId: 'template-real-id',
      variant: 'cover',
      sourcePath
    })

    await vi.waitFor(() => {
      expect(db.upsertThumbnailRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'template',
          resourceId: 'template-real-id',
          variant: 'cover',
          status: 'completed',
          thumbnailPath: expect.stringMatching(/\.png$/)
        })
      )
    })
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
      pageId: '',
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

  it('returns an existing fresh thumbnail without opening a capture window', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-existing-'))
    const sourcePath = path.join(sourceRoot, 'page-1.html')
    const thumbnailPath = path.join(sourceRoot, 'thumbnail.png')
    fs.writeFileSync(sourcePath, '<!doctype html><html></html>')
    fs.writeFileSync(thumbnailPath, 'png')
    const request = {
      resourceType: 'session',
      resourceId: 'session-existing',
      variant: 'first-page',
      sourcePath
    }
    const db = {
      getThumbnailRecord: vi.fn(async () => ({
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        variant: request.variant,
        sourcePath,
        sourceMtimeMs: Math.floor(fs.statSync(sourcePath).mtimeMs),
        signature: JSON.stringify({
          ...request,
          pageId: '',
          query: {},
          captureWidth: 1600,
          captureHeight: 900,
          thumbnailWidth: 640,
          thumbnailHeight: 360
        }),
        thumbnailPath,
        status: 'completed',
        error: null
      })),
      upsertThumbnailRecord: vi.fn()
    }
    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)

    await expect(service.enqueueHtmlThumbnail(request)).resolves.toMatchObject({
      status: 'completed',
      thumbnailPath
    })
    expect(state.capturePage).not.toHaveBeenCalled()
    expect(db.upsertThumbnailRecord).not.toHaveBeenCalled()
    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })

  it('waits until an enqueued thumbnail task completes', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-wait-'))
    const sourcePath = path.join(sourceRoot, 'preview.html')
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

    const completed = service.waitForHtmlThumbnailTask('style', 'style-wait', 'default', 2_000)
    await service.enqueueHtmlThumbnail({
      resourceType: 'style',
      resourceId: 'style-wait',
      sourcePath
    })

    await expect(completed).resolves.toMatchObject({
      resourceType: 'style',
      resourceId: 'style-wait',
      status: 'completed',
      thumbnailPath: expect.stringMatching(/\.png$/)
    })
    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })

  it('retries capture when the source changes and records the stable source mtime', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-changing-'))
    const sourcePath = path.join(sourceRoot, 'page-1.html')
    fs.writeFileSync(sourcePath, '<!doctype html><html><body>first</body></html>')
    const records = new Map<string, Record<string, unknown>>()
    const db = {
      getThumbnailRecord: vi.fn(async (resourceType: string, resourceId: string, variant: string) =>
        records.get(`${resourceType}:${resourceId}:${variant}`)
      ),
      upsertThumbnailRecord: vi.fn(async (record: Record<string, unknown>) => {
        records.set(`${record.resourceType}:${record.resourceId}:${record.variant}`, record)
      })
    }
    state.capturePage.mockImplementationOnce(async () => {
      fs.writeFileSync(sourcePath, '<!doctype html><html><body>second</body></html>')
      const changedTime = new Date(Date.now() + 2_000)
      fs.utimesSync(sourcePath, changedTime, changedTime)
      return {
        resize: vi.fn(() => ({ toPNG: vi.fn(() => Buffer.from('stale')) }))
      }
    })

    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)
    await service.enqueueHtmlThumbnail({
      resourceType: 'session',
      resourceId: 'session-changing',
      variant: 'first-page',
      sourcePath
    })

    await vi.waitFor(() => {
      const completed = db.upsertThumbnailRecord.mock.calls.find(
        ([record]) => record.status === 'completed'
      )?.[0]
      expect(completed).toBeTruthy()
      expect(completed?.sourceMtimeMs).toBe(Math.floor(fs.statSync(sourcePath).mtimeMs))
    })
    expect(state.capturePage).toHaveBeenCalledTimes(2)
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

  it('resolves multiple fresh thumbnails with a single batched DB query', async () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-batch-'))
    const records = new Map<string, Record<string, unknown>>()
    const db = {
      getThumbnailRecord: vi.fn(async (resourceType: string, resourceId: string, variant: string) =>
        records.get(`${resourceType}:${resourceId}:${variant}`)
      ),
      getThumbnailRecords: vi.fn(
        async (resourceType: string, resourceIds: string[], variant: string) =>
          resourceIds
            .map((id) => records.get(`${resourceType}:${id}:${variant}`))
            .filter((record): record is Record<string, unknown> => Boolean(record))
      ),
      upsertThumbnailRecord: vi.fn(async (record: Record<string, unknown>) => {
        records.set(`${record.resourceType}:${record.resourceId}:${record.variant}`, record)
      })
    }
    const service = await import('../../../src/main/utils/html-thumbnail-service')
    service.configureHtmlThumbnailService(db as never)

    const writeSource = (name: string): string => {
      const sourcePath = path.join(sourceRoot, name)
      fs.writeFileSync(sourcePath, '<!doctype html><html></html>')
      return sourcePath
    }
    const makeSignature = (resourceId: string, sourcePath: string, thumbnailWidth = 640) =>
      JSON.stringify({
        resourceType: 'session',
        resourceId,
        variant: 'first-page',
        sourcePath,
        pageId: '',
        query: {},
        captureWidth: 1600,
        captureHeight: 900,
        thumbnailWidth,
        thumbnailHeight: 360
      })
    const writeThumbnail = (name: string): string => {
      const thumbnailPath = path.join(sourceRoot, name)
      fs.writeFileSync(thumbnailPath, 'png')
      return thumbnailPath
    }

    const freshSource = writeSource('fresh.html')
    const freshThumbnail = writeThumbnail('fresh.png')
    const staleSource = writeSource('stale.html')
    const staleThumbnail = writeThumbnail('stale.png')
    const resizedSource = writeSource('resized.html')
    const resizedThumbnail = writeThumbnail('resized.png')

    records.set('session:fresh:first-page', {
      resourceType: 'session',
      resourceId: 'fresh',
      variant: 'first-page',
      sourcePath: freshSource,
      sourceMtimeMs: Math.floor(fs.statSync(freshSource).mtimeMs),
      signature: makeSignature('fresh', freshSource),
      thumbnailPath: freshThumbnail,
      status: 'completed',
      error: null
    })
    records.set('session:stale:first-page', {
      resourceType: 'session',
      resourceId: 'stale',
      variant: 'first-page',
      sourcePath: staleSource,
      sourceMtimeMs: Math.floor(fs.statSync(staleSource).mtimeMs) - 5_000,
      signature: makeSignature('stale', staleSource),
      thumbnailPath: staleThumbnail,
      status: 'completed',
      error: null
    })
    records.set('session:resized:first-page', {
      resourceType: 'session',
      resourceId: 'resized',
      variant: 'first-page',
      sourcePath: resizedSource,
      sourceMtimeMs: Math.floor(fs.statSync(resizedSource).mtimeMs),
      signature: makeSignature('resized', resizedSource, 320),
      thumbnailPath: resizedThumbnail,
      status: 'completed',
      error: null
    })

    const newerTime = new Date(Date.now() + 2_000)
    fs.utimesSync(staleSource, newerTime, newerTime)

    const result = await service.getFreshHtmlThumbnailPaths([
      {
        resourceType: 'session',
        resourceId: 'fresh',
        variant: 'first-page',
        sourcePath: freshSource
      },
      {
        resourceType: 'session',
        resourceId: 'stale',
        variant: 'first-page',
        sourcePath: staleSource
      },
      {
        resourceType: 'session',
        resourceId: 'resized',
        variant: 'first-page',
        sourcePath: resizedSource
      },
      {
        resourceType: 'session',
        resourceId: 'missing-source',
        variant: 'first-page',
        sourcePath: path.join(sourceRoot, 'does-not-exist.html')
      },
      {
        resourceType: 'session',
        resourceId: 'no-record',
        variant: 'first-page',
        sourcePath: writeSource('no-record.html')
      }
    ])

    expect(result.get('fresh')).toBe(freshThumbnail)
    expect(result.has('stale')).toBe(false)
    expect(result.has('resized')).toBe(false)
    expect(result.has('missing-source')).toBe(false)
    expect(result.has('no-record')).toBe(false)
    expect(db.getThumbnailRecords).toHaveBeenCalledTimes(1)
    expect(db.getThumbnailRecord).not.toHaveBeenCalled()

    fs.rmSync(sourceRoot, { recursive: true, force: true })
  })
})
