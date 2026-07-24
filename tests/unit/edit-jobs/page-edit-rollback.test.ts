import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restorePageEditSnapshots } from '../../../src/main/ipc/edit-jobs/page-edit-rollback'

describe('restorePageEditSnapshots', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('continues restoring the remaining files when one rollback write fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-page-edit-rollback-'))
    roots.push(root)
    const restoredPath = path.join(root, 'page.html')
    const missingParentPath = path.join(root, 'missing', 'index.html')
    await writeFile(restoredPath, 'changed', 'utf-8')

    const failures = await restorePageEditSnapshots([
      { path: restoredPath, exists: true, content: 'original' },
      { path: missingParentPath, exists: true, content: 'original index' }
    ])

    await expect(readFile(restoredPath, 'utf-8')).resolves.toBe('original')
    expect(failures).toHaveLength(1)
    expect(failures[0]?.path).toBe(missingParentPath)
  })
})
