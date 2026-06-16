import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enqueueHtmlThumbnails: vi.fn(async () => [])
}))

vi.mock('../../../src/main/utils/html-thumbnail-service', () => ({
  enqueueHtmlThumbnails: state.enqueueHtmlThumbnails
}))

describe('warmStyleThumbnails', () => {
  const roots: string[] = []

  afterEach(() => {
    state.enqueueHtmlThumbnails.mockClear()
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('resolves builtin, user, and explicit package preview paths', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohmyppt-style-warmup-'))
    roots.push(root)
    const previews = [
      path.join(root, 'system', 'builtin-key', 'preview.html'),
      path.join(root, 'user', 'custom-id', 'preview.html'),
      path.join(root, 'overrides', 'special', 'preview.html')
    ]
    for (const previewPath of previews) {
      fs.mkdirSync(path.dirname(previewPath), { recursive: true })
      fs.writeFileSync(previewPath, '<!doctype html>')
    }

    const { warmStyleThumbnails } = await import('../../../src/main/styles/style-thumbnail-warmup')
    await warmStyleThumbnails(
      root,
      [
        { id: 'builtin-id', style: 'builtin-key', source: 'builtin' },
        { id: 'custom-id', style: 'custom-key', source: 'custom' },
        {
          id: 'override-id',
          style: 'override-key',
          source: 'override',
          packageDir: 'overrides/special'
        },
        { id: 'missing-id', style: 'missing-key', source: 'custom' }
      ],
      500
    )

    expect(state.enqueueHtmlThumbnails).toHaveBeenCalledWith(
      [
        { resourceType: 'style', resourceId: 'builtin-id', sourcePath: previews[0] },
        { resourceType: 'style', resourceId: 'custom-id', sourcePath: previews[1] },
        { resourceType: 'style', resourceId: 'override-id', sourcePath: previews[2] }
      ],
      { delayMs: 500 }
    )
  })
})
