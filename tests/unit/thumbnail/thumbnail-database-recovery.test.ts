import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => os.tmpdir()) } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

describe('thumbnail database recovery', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('marks interrupted queued and running tasks as failed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-thumbnail-db-'))
    roots.push(root)
    const { PPTDatabase } = await import('../../../src/main/db/database')
    const db = new PPTDatabase(path.join(root, 'test.db'))
    await db.init()
    try {
      for (const [resourceId, status] of [
        ['queued-id', 'queued'],
        ['running-id', 'running'],
        ['completed-id', 'completed']
      ] as const) {
        await db.upsertThumbnailRecord({
          resourceType: 'style',
          resourceId,
          variant: 'default',
          sourcePath: `/styles/${resourceId}.html`,
          sourceMtimeMs: 1,
          signature: resourceId,
          thumbnailPath: status === 'completed' ? `/thumbs/${resourceId}.png` : '',
          status
        })
      }

      await db.failInterruptedThumbnailTasks()

      await expect(db.getThumbnailRecord('style', 'queued-id')).resolves.toMatchObject({
        status: 'failed',
        error: '应用退出时任务尚未完成'
      })
      await expect(db.getThumbnailRecord('style', 'running-id')).resolves.toMatchObject({
        status: 'failed',
        error: '应用退出时任务尚未完成'
      })
      await expect(db.getThumbnailRecord('style', 'completed-id')).resolves.toMatchObject({
        status: 'completed'
      })
    } finally {
      await db.close()
    }
  })
})
