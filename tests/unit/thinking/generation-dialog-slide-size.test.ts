import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('thinking generation slide size selection', () => {
  it('lets the confirm dialog choose a slide size and forwards it when creating a session', () => {
    const dialogSource = readFileSync(
      'src/renderer/src/components/thinking/GenerationConfirmDialog.tsx',
      'utf8'
    )
    const pageSource = readFileSync('src/renderer/src/pages/thinking-detail.tsx', 'utf8')

    expect(dialogSource).toContain('SLIDE_SIZE_PRESETS')
    expect(dialogSource).toContain('const [slideSizeId, setSlideSizeId]')
    expect(dialogSource).toContain('slideSizeId,')
    expect(dialogSource).toContain('sm:grid-cols-[minmax(20rem,1fr)_6.25rem_minmax(0,12rem)]')
    expect(dialogSource).toContain('className="h-8 min-w-0 py-0 text-xs"')
    expect(dialogSource).toContain('dropdownClassName="w-[min(640px,calc(100vw-3rem))]"')
    expect(pageSource).toContain('slideSizeId: params.slideSizeId')
  })
})
