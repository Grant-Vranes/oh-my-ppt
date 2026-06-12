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

  it.each(['h-[240px]', 'h-64'])(
    'accepts supported Tailwind chart height class %s',
    (frameClass) => {
      const result = validatePersistedPageHtml(pageWithChartFrame(frameClass), 'page-1')

      expect(result.valid).toBe(true)
    }
  )
})
