import { describe, expect, it } from 'vitest'

import { validateHtmlContent, validatePersistedPageHtml } from '../../../src/main/tools/html-utils'
import {
  DATA_ANIM_SKILL_NAME,
  formatSkillUsageRequirement,
} from '../../../src/main/skills/skill-contract'

describe('validateHtmlContent animation validation', () => {
  it('allows declarative data-anim stagger delay', () => {
    const result = validateHtmlContent(`
      <div>
        <div data-anim="fade-up" data-anim-delay="stagger(100)">A</div>
        <div data-anim="fade-up" data-anim-delay='stagger(120)'>B</div>
      </div>
    `)

    expect(result.errors).not.toContain(
      `检测到未命名空间的动画调用（animate/stagger/createTimeline）；修改动画前请先 ${formatSkillUsageRequirement(DATA_ANIM_SKILL_NAME)}`
    )
  })

  it('still rejects unqualified stagger calls in scripts', () => {
    const result = validateHtmlContent(`
      <div>Card</div>
      <script>
        stagger(100)
      </script>
    `)

    expect(result.errors).toContain(
      `检测到未命名空间的动画调用（animate/stagger/createTimeline）；修改动画前请先 ${formatSkillUsageRequirement(DATA_ANIM_SKILL_NAME)}`
    )
  })
})

describe('validateHtmlContent chart height marker validation', () => {
  it('rejects chart frames whose height class does not match @ppt-chart-height', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=420: chart height = hero/main = 420 -->
        <div class="ppt-chart-frame relative h-[240px] w-full overflow-hidden">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
      </div>
    `)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('@ppt-chart-height=420'))).toBe(true)
    expect(result.errors.some((error) => error.includes('h-[240px]'))).toBe(true)
  })

  it('rejects mismatch when the marker is attached to a one-chart wrapper', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=400: chart area slot = 542; chart height = 400 -->
        <div class="bg-white p-4">
          <h3>关键指标变化幅度对比</h3>
          <div class="ppt-chart-frame relative h-[240px] w-full overflow-hidden">
            <canvas id="chart" class="h-full w-full"></canvas>
          </div>
        </div>
      </div>
    `)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('@ppt-chart-height=400'))).toBe(true)
    expect(result.errors.some((error) => error.includes('h-[240px]'))).toBe(true)
  })

  it('uses a whole-page marker only when the page has a single chart', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=400: single chart page, chart height = 400 -->
        <section>
          <div class="ppt-chart-frame relative h-[240px] w-full overflow-hidden">
            <canvas id="chart" class="h-full w-full"></canvas>
          </div>
        </section>
      </div>
    `)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('@ppt-chart-height=400'))).toBe(true)
  })

  it('does not globally apply one marker to multiple charts', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=400: ambiguous multi-chart page -->
        <header>Two charts below</header>
        <section>
          <div class="ppt-chart-frame relative h-[240px] w-full overflow-hidden">
            <canvas id="chart-a" class="h-full w-full"></canvas>
          </div>
          <div class="ppt-chart-frame relative h-[240px] w-full overflow-hidden">
            <canvas id="chart-b" class="h-full w-full"></canvas>
          </div>
        </section>
      </div>
    `)

    expect(result.errors.some((error) => error.includes('图表高度标记 @ppt-chart-height'))).toBe(
      false
    )
  })

  it('allows matching chart height marker and frame class', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=420: chart height = hero/main = 420 -->
        <div class="ppt-chart-frame relative h-[420px] w-full overflow-hidden">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
      </div>
    `)

    expect(result.errors.some((error) => error.includes('图表高度标记 @ppt-chart-height'))).toBe(
      false
    )
  })

  it('rejects visible chart height marker text outside HTML comments', () => {
    const result = validateHtmlContent(`
      <div>
        <div class="ppt-chart-frame relative h-[420px] w-full overflow-hidden">
          @ppt-chart-height=420
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
      </div>
    `)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('必须写在 HTML 注释中'))).toBe(true)
  })

  it('does not reject a marker when the chart frame has no fixed height class yet', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=420: chart height = hero/main = 420 -->
        <div class="ppt-chart-frame relative w-full overflow-hidden">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
      </div>
    `)

    expect(result.errors.some((error) => error.includes('图表高度标记 @ppt-chart-height'))).toBe(
      false
    )
  })

  it('flags an out-of-range class height against the marker (no range filtering on the class side)', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=120: chart height = compact = 120 -->
        <div class="ppt-chart-frame relative h-[100px] w-full overflow-hidden">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
      </div>
    `)

    // h-[100px] is below the chart-frame MIN, but the contract is "marker must
    // equal the class". 120 ≠ 100, so this is a mismatch — not silently treated
    // as "no fixed height class".
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('@ppt-chart-height=120'))).toBe(true)
    expect(result.errors.some((error) => error.includes('h-[100px]'))).toBe(true)
  })
})

describe('validateHtmlContent chart label validation', () => {
  it('rejects Chart.js labels that contain HTML markup', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=360: chart slot = 360 -->
        <div class="ppt-chart-frame relative h-[360px]">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            PPT.createChart(document.getElementById('chart'), {
              type: 'bar',
              data: {
                labels: ['AI调校师<br><span>约80→1,400</span>'],
                datasets: [{ label: '变化率', data: [1650] }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            })
          })
        </script>
      </div>
    `)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('图表 labels 包含 HTML 标签'))).toBe(true)
  })

  it('allows Chart.js string-array labels for multi-line categories', () => {
    const result = validateHtmlContent(`
      <div>
        <!-- height calc @ppt-chart-height=360: chart slot = 360 -->
        <div class="ppt-chart-frame relative h-[360px]">
          <canvas id="chart" class="h-full w-full"></canvas>
        </div>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            PPT.createChart(document.getElementById('chart'), {
              type: 'bar',
              data: {
                labels: [['AI调校师', '约80→1,400'], ['中割/补间', '9,300→5,600']],
                datasets: [{ label: '2026人数', data: [1400, 5600] }]
              },
              options: { responsive: true, maintainAspectRatio: false }
            })
          })
        </script>
      </div>
    `)

    expect(result.errors.some((error) => error.includes('图表 labels 包含 HTML 标签'))).toBe(false)
  })
})

describe('validatePersistedPageHtml chart validation', () => {
  const pageWithChartFrame = (frameClass: string): string => `
    <html>
      <body>
        <section class="ppt-page-root" data-ppt-guard-root="1">
          <main class="ppt-page-content">
            <div class="ppt-chart-frame relative ${frameClass}">
              <canvas id="chart" class="h-full w-full"></canvas>
            </div>
          </main>
        </section>
      </body>
    </html>
  `

  const pageWithBrokenChartScript = (): string => `
    <html>
      <body>
        <section class="ppt-page-root" data-ppt-guard-root="1">
          <main class="ppt-page-content">
            <div class="ppt-chart-frame relative h-[360px]">
              <canvas id="chart" class="h-full w-full"></canvas>
            </div>
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                PPT.createChart(document.getElementById('chart'), {
                  type: 'bar',
                  data: { labels: ['A'], datasets: [{ data: [1] }] },
                  options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                      duration: 800,
                      easing: '</script></main></section>
          </main>
        </section>
      </body>
    </html>
  `

  it.each(['h-[240px]', 'h-64'])(
    'accepts supported Tailwind chart height class %s',
    (frameClass) => {
      const result = validatePersistedPageHtml(pageWithChartFrame(frameClass), 'page-1')

      expect(result.valid).toBe(true)
    }
  )

  it('rejects persisted pages with malformed inline chart scripts', () => {
    const result = validatePersistedPageHtml(pageWithBrokenChartScript(), 'page-1')

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('内联 script 语法错误'))).toBe(true)
  })

  it('rejects persisted pages whose chart height marker disagrees with the frame class', () => {
    const result = validatePersistedPageHtml(
      `
        <html>
          <body>
            <section class="ppt-page-root" data-ppt-guard-root="1">
              <main class="ppt-page-content">
                <!-- height calc @ppt-chart-height=560: chart slot = 560 -->
                <div class="ppt-chart-frame relative h-[240px]">
                  <canvas id="chart" class="h-full w-full"></canvas>
                </div>
              </main>
            </section>
          </body>
        </html>
      `,
      'page-1'
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('@ppt-chart-height=560'))).toBe(true)
    expect(result.errors.some((error) => error.includes('h-[240px]'))).toBe(true)
  })

  it('rejects persisted pages with visible chart height marker text', () => {
    const result = validatePersistedPageHtml(
      `
        <html>
          <body>
            <section class="ppt-page-root" data-ppt-guard-root="1">
              <main class="ppt-page-content">
                <div class="ppt-chart-frame relative h-[560px]">
                  @ppt-chart-height=560
                  <canvas id="chart" class="h-full w-full"></canvas>
                </div>
              </main>
            </section>
          </body>
        </html>
      `,
      'page-1'
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('必须写在 HTML 注释中'))).toBe(true)
  })

  it('rejects persisted pages whose chart labels contain HTML markup', () => {
    const result = validatePersistedPageHtml(
      `
        <html>
          <body>
            <section class="ppt-page-root" data-ppt-guard-root="1">
              <main class="ppt-page-content">
                <div class="ppt-chart-frame relative h-[360px]">
                  <canvas id="chart" class="h-full w-full"></canvas>
                </div>
                <script>
                  document.addEventListener('DOMContentLoaded', function() {
                    PPT.createChart(document.getElementById('chart'), {
                      type: 'bar',
                      data: {
                        labels: ['中割/补间<br><span>9,300→5,600</span>'],
                        datasets: [{ data: [-39.8] }]
                      },
                      options: { responsive: true, maintainAspectRatio: false }
                    })
                  })
                </script>
              </main>
            </section>
          </body>
        </html>
      `,
      'page-1'
    )

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('图表 labels 包含 HTML 标签'))).toBe(true)
  })
})
