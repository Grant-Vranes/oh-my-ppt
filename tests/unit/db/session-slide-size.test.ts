import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'ohmyppt-test-user-data'))
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import { PPTDatabase } from '../../../src/main/db/database'
import { resolveSlideSize } from '../../../src/shared/slide-size'

describe('session slide size persistence', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('persists square 1:1 sessions with explicit dimensions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-session-slide-size-'))
    roots.push(root)
    const db = new PPTDatabase(path.join(root, 'test.db'))
    await db.init()

    try {
      const slideSize = resolveSlideSize({ id: 'square-1-1' })
      const sessionId = await db.createSession({
        title: 'Square card',
        topic: 'Square card',
        styleId: 'minimal-white',
        pageCount: 1,
        slideSizeId: slideSize.id,
        slideWidth: slideSize.width,
        slideHeight: slideSize.height,
        provider: 'test',
        model: 'test-model'
      })

      await expect(db.getSession(sessionId)).resolves.toMatchObject({
        slideSizeId: 'square-1-1',
        slideWidth: 1200,
        slideHeight: 1200
      })
    } finally {
      await db.close()
    }
  })

  it('rejects session creation without explicit slide size fields', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-session-slide-size-'))
    roots.push(root)
    const db = new PPTDatabase(path.join(root, 'test.db'))
    await db.init()

    try {
      await expect(
        db.createSession({
          title: 'Missing size',
          topic: 'Missing size',
          styleId: 'minimal-white',
          pageCount: 1,
          provider: 'test',
          model: 'test-model'
        })
      ).rejects.toThrow('Invalid slide size id:')
    } finally {
      await db.close()
    }
  })
})
