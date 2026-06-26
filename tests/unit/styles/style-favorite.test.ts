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

describe('style favorites', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores favoriteAt without bumping updatedAt', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-style-favorite-'))
    const db = new PPTDatabase(path.join(tmp, 'test.db'))
    try {
      await db.init()
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-25T00:00:00Z'))
      const styleId = await db.createStyleRow({
        id: 'favorite-style',
        style: 'favorite-style',
        styleName: 'Favorite Style',
        description: 'A style used to test favorites',
        category: '测试',
        aliases: [],
        source: 'custom',
        styleSkill: '# Skill',
        styleCase: '测试'
      })
      const before = await db.getStyleRow(styleId)
      expect(before).toBeTruthy()

      vi.setSystemTime(new Date('2026-06-25T00:05:00Z'))
      const favoriteAt = Math.floor(Date.now() / 1000)
      await expect(db.setStyleFavorite(styleId, favoriteAt)).resolves.toBe(favoriteAt)

      const favorited = await db.getStyleRow(styleId)
      expect(favorited?.favoriteAt).toBe(favoriteAt)
      expect(favorited?.updatedAt).toBe(before?.updatedAt)

      await expect(db.setStyleFavorite(styleId, null)).resolves.toBeNull()
      const unfavorited = await db.getStyleRow(styleId)
      expect(unfavorited?.favoriteAt).toBeNull()
      expect(unfavorited?.updatedAt).toBe(before?.updatedAt)
    } finally {
      await db.close()
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
