import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
  },
  BrowserWindow: class BrowserWindow {},
  ipcMain: {},
  session: {},
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false,
  },
}))

import { preprocessPageHtml } from '../../../src/main/tools/page-writer'

describe('preprocessPageHtml chart height stabilization', () => {
  it('uses the dedicated chart height comment marker when adding a missing frame height', () => {
    const html = preprocessPageHtml(`
      <section>
        <!-- height calc @ppt-chart-height=560: chart slot = 560; chart height = hero/main = 560 -->
        <div class="relative w-full overflow-hidden">
          <canvas id="chart"></canvas>
        </div>
      </section>
    `)

    expect(html).toContain('ppt-chart-frame')
    expect(html).toContain('h-[560px]')
    expect(html).not.toContain('h-[240px]')
  })

  it('uses a whole-page marker when the page has exactly one chart', () => {
    const html = preprocessPageHtml(`
      <section>
        <!-- height calc @ppt-chart-height=400: single-chart page, chart height = 400 -->
        <div class="grid grid-cols-[1fr_280px]">
          <div class="card">
            <h3>关键指标变化幅度对比</h3>
            <div class="relative w-full overflow-hidden">
              <canvas id="chart"></canvas>
            </div>
          </div>
          <aside>Insight</aside>
        </div>
      </section>
    `)

    expect(html).toContain('ppt-chart-frame')
    expect(html).toContain('h-[400px]')
    expect(html).not.toContain('h-[240px]')
  })

  it('does not use one whole-page marker for multiple charts', () => {
    const html = preprocessPageHtml(`
      <section>
        <!-- height calc @ppt-chart-height=400: ambiguous multi-chart page -->
        <header>Two charts below</header>
        <div><canvas id="chart-a"></canvas></div>
        <div><canvas id="chart-b"></canvas></div>
      </section>
    `)

    expect(html).toContain('h-[240px]')
    expect(html).not.toContain('h-[400px]')
  })

  it('ignores unmarked natural-language chart height comments', () => {
    const html = preprocessPageHtml(`
      <section>
        <!-- height calc: chart slot = 560; chart height = hero/main = 560 -->
        <div class="relative w-full overflow-hidden">
          <canvas id="chart"></canvas>
        </div>
      </section>
    `)

    expect(html).toContain('ppt-chart-frame')
    expect(html).toContain('h-[240px]')
    expect(html).not.toContain('h-[560px]')
  })
})
