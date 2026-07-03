// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: class BrowserWindow {},
  ipcMain: {},
  session: {}
}))

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { buildBasePageStyleTag, buildFitScript } from '../../../src/main/tools/page-writer'
import { requireSlideSizePreset, resolveSlideSize } from '../../../src/shared/slide-size'

describe('canvas-aware font floors', () => {
  // Root font-size is NOT scaled — we keep the browser 16px default so rem-based
  // Tailwind utilities (gap-4, p-8, ...) don't blow up layout on tall canvases.
  // Instead, the fit-script font floors scale with canvas height, and the layout
  // skills / design contract prompt tell the model to write larger explicit px
  // font-sizes on taller canvases.

  it('keeps the root and content font-size at the 16px baseline on every canvas', () => {
    const portrait = resolveSlideSize({ id: 'vertical-9-16' }) // 900x1600
    const css = buildBasePageStyleTag(portrait)

    // No canvas-height-aware calc on root; .ppt-page-content stays at 16px so
    // rem-based Tailwind spacing utilities are not side-effect-amplified.
    expect(css).not.toMatch(/font-size:\s*calc\(16px \* var\(--ppt-slide-height\)/)
    expect(css).toMatch(/\.ppt-page-content\s*{[^}]*font-size:\s*16px/)
    expect(css).toMatch(/\[data-ppt-readable-fonts="1"\]\s*{[^}]*font-size:\s*18px/)
  })

  it('scales fit-script font floors with canvas height (1600h portrait)', () => {
    const portrait = resolveSlideSize({ id: 'vertical-9-16' }) // height 1600 -> scale ~1.778
    const script = buildFitScript(portrait)

    // 1600/900 = 1.777...; Math.round(18 * 1.777) = 32
    expect(script).toContain('const BODY_MIN_FONT = 32;')
    // Math.round(24 * 1.777) = 43
    expect(script).toContain('const HEADING_MIN_FONT = 43;')
    // Math.round(12 * 1.777) = 21
    expect(script).toContain('const AUXILIARY_MIN_FONT = 21;')
    // Math.round(14 * 1.777) = 25
    expect(script).toContain('const LEGACY_MIN_FONT = 25;')
  })

  it('keeps the original 18/24/12/14 floors on the 900h reference canvas', () => {
    const wide = requireSlideSizePreset('wide-16-9') // height 900 -> scale 1
    const script = buildFitScript(wide)

    expect(script).toContain('const BODY_MIN_FONT = 18;')
    expect(script).toContain('const HEADING_MIN_FONT = 24;')
    expect(script).toContain('const AUXILIARY_MIN_FONT = 12;')
    expect(script).toContain('const LEGACY_MIN_FONT = 14;')
  })

  it('uses an intermediate scale for 1200h canvases (4:3 / 1:1)', () => {
    const square = resolveSlideSize({ id: 'square-1-1' }) // 1200x1200
    const script = buildFitScript(square)

    // 1200/900 = 1.333; Math.round(18 * 1.333) = 24, Math.round(24 * 1.333) = 32
    expect(script).toContain('const BODY_MIN_FONT = 24;')
    expect(script).toContain('const HEADING_MIN_FONT = 32;')
    expect(script).toContain('const AUXILIARY_MIN_FONT = 16;')
    expect(script).toContain('const LEGACY_MIN_FONT = 19;')
  })

  it('uses the largest scale for 1660h xiaohongshu canvas', () => {
    const note = resolveSlideSize({ id: 'xiaohongshu-note' }) // 1242x1660
    const script = buildFitScript(note)

    // 1660/900 = 1.844; Math.round(18 * 1.844) = 33, Math.round(24 * 1.844) = 44
    expect(script).toContain('const BODY_MIN_FONT = 33;')
    expect(script).toContain('const HEADING_MIN_FONT = 44;')
    expect(script).toContain('const AUXILIARY_MIN_FONT = 22;')
    expect(script).toContain('const LEGACY_MIN_FONT = 26;')
  })
})
