/**
 * @vitest-environment happy-dom
 *
 * Verify every animation type from the cookbook produces correct anime.js params.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const runtimeSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../resources/ppt-runtime.js'),
  'utf-8'
)

function createMockAnime() {
  const calls: Array<{ targets: unknown; params: Record<string, unknown> }> = []
  const anime = {
    animate: vi.fn((targets: unknown, params: Record<string, unknown>) => {
      calls.push({ targets, params: { ...params } })
      let resolveFinished!: () => void
      const finished = new Promise<void>((r) => { resolveFinished = r })
      return {
        pause: vi.fn(),
        play: vi.fn(),
        complete: vi.fn(() => resolveFinished()),
        finished
      }
    }),
    stagger: vi.fn((gap: number) => (_el: unknown, i: number) => i * gap),
    createTimeline: vi.fn(() => ({ add: vi.fn() })),
    timeline: vi.fn(() => ({ add: vi.fn() }))
  }
  return { anime, calls }
}

function setupAndScan(html: string) {
  const { anime, calls } = createMockAnime()
  ;(globalThis as Record<string, unknown>).__ohmypptPlaybackBridgeInstalled = false
  const existingPPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown> | undefined
  if (existingPPT) existingPPT.__runtimeVersion = null
  ;(globalThis as Record<string, unknown>).anime = anime
  document.body.innerHTML = html
  window.history.replaceState(null, '', '/page.html?pptPlayback=1')
  new Function(runtimeSrc)()
  const PPT = (globalThis as Record<string, unknown>).PPT as Record<string, unknown>
  const root = document.querySelector('.ppt-page-root')
  const config = (PPT.scanDataAnim as Function)(root)
  if (config && config.load && config.load.length > 0) {
    (PPT.executeDataAnim as Function)(config.load)
  }
  return { calls, PPT, config }
}

describe('cookbook animation verification', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // Entrance animations
  const entranceTests: Array<{ type: string; extra?: string; expectParams: Record<string, unknown> }> = [
    { type: 'fade', expectParams: { opacity: [0, 1] } },
    { type: 'fade-up', expectParams: { opacity: [0, 1], translateY: [20, 0] } },
    { type: 'fade-down', expectParams: { opacity: [0, 1], translateY: [-20, 0] } },
    { type: 'fade-left', expectParams: { opacity: [0, 1], translateX: [20, 0] } },
    { type: 'fade-right', expectParams: { opacity: [0, 1], translateX: [-20, 0] } },
    { type: 'scale-in', expectParams: { opacity: [0, 1], scale: [0.85, 1] } },
    { type: 'slide-up', expectParams: { opacity: [0, 1], translateY: [64, 0] } },
    { type: 'slide-down', expectParams: { opacity: [0, 1], translateY: [-64, 0] } },
    { type: 'slide-left', expectParams: { opacity: [0, 1], translateX: [72, 0] } },
    { type: 'slide-right', expectParams: { opacity: [0, 1], translateX: [-72, 0] } },
    { type: 'zoom-in', expectParams: { opacity: [0, 1], scale: [0.75, 1] } },
    { type: 'spin-in', expectParams: { opacity: [0, 1], rotate: [-12, 0], scale: [0.92, 1] } },
    { type: 'fly-in', extra: 'data-anim-from="left"', expectParams: { opacity: [0, 1], translateX: [-72, 0] } },
    { type: 'fly-in', extra: 'data-anim-from="right"', expectParams: { opacity: [0, 1], translateX: [72, 0] } },
    { type: 'fly-in', extra: 'data-anim-from="top"', expectParams: { opacity: [0, 1], translateY: [-72, 0] } },
    { type: 'fly-in', extra: 'data-anim-from="bottom"', expectParams: { opacity: [0, 1], translateY: [72, 0] } },
    { type: 'fly-in', extra: 'data-anim-from="center"', expectParams: { opacity: [0, 1], scale: [0.9, 1] } },
    { type: 'wipe', extra: 'data-anim-from="left"', expectParams: { opacity: [0, 1] } },  // clipPath checked separately
    { type: 'wipe', extra: 'data-anim-from="right"', expectParams: { opacity: [0, 1] } },
  ]

  for (const t of entranceTests) {
    const label = t.extra ? `${t.type} ${t.extra}` : t.type
    it(`entrance: ${label}`, () => {
      const html = `<div class="ppt-page-root"><div data-anim="${t.type}" ${t.extra || ''}>test</div></div>`
      const { calls } = setupAndScan(html)
      expect(calls.length).toBe(1)
      for (const [key, val] of Object.entries(t.expectParams)) {
        expect(calls[0].params[key]).toEqual(val)
      }
    })
  }

  // Wipe clip-path specifics
  it('wipe from=left has correct clipPath', () => {
    const html = `<div class="ppt-page-root"><div data-anim="wipe" data-anim-from="left">test</div></div>`
    const { calls } = setupAndScan(html)
    const cp = calls[0].params.clipPath as unknown[]
    expect(cp[0]).toContain('inset(0% 100% 0% 0%)')
    expect(cp[1]).toContain('inset(0% 0% 0% 0%)')
  })

  it('wipe from=right has correct clipPath', () => {
    const html = `<div class="ppt-page-root"><div data-anim="wipe" data-anim-from="right">test</div></div>`
    const { calls } = setupAndScan(html)
    const cp = calls[0].params.clipPath as unknown[]
    expect(cp[0]).toContain('inset(0% 0% 0% 100%)')
    expect(cp[1]).toContain('inset(0% 0% 0% 0%)')
  })

  // Path animation
  it('path: M 0 0 L 120 30 produces correct translateX/translateY', () => {
    const html = `<div class="ppt-page-root"><div data-anim="path" data-anim-path="M 0 0 L 120 30">test</div></div>`
    const { calls } = setupAndScan(html)
    expect(calls.length).toBe(1)
    expect(calls[0].params.translateX).toEqual([0, 120])
    expect(calls[0].params.translateY).toEqual([0, 30])
  })

  it('path: M 0 0 L 0 -150 produces vertical motion', () => {
    const html = `<div class="ppt-page-root"><div data-anim="path" data-anim-path="M 0 0 L 0 -150">test</div></div>`
    const { calls } = setupAndScan(html)
    expect(calls[0].params.translateX).toEqual([0, 0])
    expect(calls[0].params.translateY).toEqual([0, -150])
  })

  // Emphasis animations
  const emphasisTests: Array<{ type: string; expectParams: Record<string, unknown> }> = [
    { type: 'pulse-soft', expectParams: { scale: [1, 1.03, 1] } },
    { type: 'pulse', expectParams: { scale: [1, 1.06, 1] } },
    { type: 'pulse-strong', expectParams: { scale: [1, 1.1, 1] } },
    { type: 'grow-shrink-soft', expectParams: { scale: [0.95, 1.04, 1] } },
    { type: 'grow-shrink', expectParams: { scale: [0.9, 1.08, 1] } },
    { type: 'grow-shrink-strong', expectParams: { scale: [0.85, 1.12, 1] } },
  ]

  for (const t of emphasisTests) {
    it(`emphasis: ${t.type}`, () => {
      const html = `<div class="ppt-page-root"><div data-anim="${t.type}">test</div></div>`
      const { calls } = setupAndScan(html)
      expect(calls.length).toBe(1)
      for (const [key, val] of Object.entries(t.expectParams)) {
        expect(calls[0].params[key]).toEqual(val)
      }
    })
  }

  // Exit animations
  const exitTests: Array<{ type: string; extra?: string; expectParams: Record<string, unknown> }> = [
    { type: 'exit-fade', expectParams: { opacity: [1, 0] } },
    { type: 'exit-scale', expectParams: { opacity: [1, 0], scale: [1, 0.85] } },
    { type: 'exit-zoom', expectParams: { opacity: [1, 0], scale: [1, 0.75] } },
    { type: 'exit-fly', extra: 'data-anim-from="left"', expectParams: { opacity: [1, 0], translateX: [0, -40] } },
    { type: 'exit-fly', extra: 'data-anim-from="right"', expectParams: { opacity: [1, 0], translateX: [0, 40] } },
    { type: 'exit-fly', extra: 'data-anim-from="top"', expectParams: { opacity: [1, 0], translateY: [0, -40] } },
    { type: 'exit-fly', extra: 'data-anim-from="bottom"', expectParams: { opacity: [1, 0], translateY: [0, 40] } },
  ]

  for (const t of exitTests) {
    const label = t.extra ? `${t.type} ${t.extra}` : t.type
    it(`exit: ${label}`, () => {
      const html = `<div class="ppt-page-root"><div data-anim="${t.type}" ${t.extra || ''}>test</div></div>`
      const { calls } = setupAndScan(html)
      expect(calls.length).toBe(1)
      for (const [key, val] of Object.entries(t.expectParams)) {
        expect(calls[0].params[key]).toEqual(val)
      }
    })
  }

  // Exit-wipe clipPath
  it('exit-wipe from=left has reverse clipPath', () => {
    const html = `<div class="ppt-page-root"><div data-anim="exit-wipe" data-anim-from="left">test</div></div>`
    const { calls } = setupAndScan(html)
    const cp = calls[0].params.clipPath as unknown[]
    expect(cp[0]).toContain('inset(0% 0% 0% 0%)')
    expect(cp[1]).toContain('inset(0% 100% 0% 0%)')
  })

  // Stagger
  it('stagger: 3 fade-up cards with stagger=100 produce sequential delays', () => {
    const html = `<div class="ppt-page-root">
      <div data-anim="fade-up" data-anim-stagger="100">A</div>
      <div data-anim="fade-up" data-anim-stagger="100">B</div>
      <div data-anim="fade-up" data-anim-stagger="100">C</div>
    </div>`
    const { calls } = setupAndScan(html)
    expect(calls.length).toBe(3)
    expect(calls[0].params.delay).toBe(0)
    expect(calls[1].params.delay).toBe(100)
    expect(calls[2].params.delay).toBe(200)
  })

  // Sequence="after"
  it('sequence="after": second element delays after first duration', () => {
    const html = `<div class="ppt-page-root">
      <div data-anim="fade-up" data-anim-duration="600" id="first">First</div>
      <div data-anim="fade-up" data-anim-sequence="after" data-anim-duration="500" id="second">Second</div>
    </div>`
    const { calls } = setupAndScan(html)
    expect(calls.length).toBe(2)
    expect(calls[0].params.duration).toBe(600)
    // "after" means delay = previous duration
    expect(calls[1].params.delay).toBe(600)
  })

  // Click trigger
  it('click-triggered animations are not auto-played', () => {
    const html = `<div class="ppt-page-root">
      <div data-anim="fade-up">Auto</div>
      <div data-anim="fade-up" data-anim-trigger="click">Manual</div>
    </div>`
    const { calls, config } = setupAndScan(html)
    // Only 1 auto-played (the non-click one)
    expect(calls.length).toBe(1)
    expect(config.click.length).toBe(1)
  })

  // Duration override
  it('data-anim-duration overrides default', () => {
    const html = `<div class="ppt-page-root"><div data-anim="zoom-in" data-anim-duration="800">test</div></div>`
    const { calls } = setupAndScan(html)
    expect(calls[0].params.duration).toBe(800)
  })
})
