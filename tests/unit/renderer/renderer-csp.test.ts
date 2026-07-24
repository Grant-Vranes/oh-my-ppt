import fs from 'fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rendererIndexPath = fileURLToPath(
  new URL('../../../src/renderer/index.html', import.meta.url)
)

describe('renderer content security policy', () => {
  it('allows HTTP(S) image and media resources without expanding script permissions', async () => {
    const html = await fs.promises.readFile(rendererIndexPath, 'utf-8')

    expect(html).toContain("img-src 'self' data: local-asset: http: https:")
    expect(html).toContain("media-src 'self' local-asset: http: https:")
    expect(html).toContain("script-src 'self' 'unsafe-inline'")
    expect(html).not.toContain('script-src *')
  })
})
