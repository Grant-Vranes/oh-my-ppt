import { describe, expect, it } from 'vitest'
import { buildPageBeautifySystemPrompt } from '../../../src/main/ipc/edit-jobs/page-beautify-prompt'
import { resolveLayoutSkillName } from '../../../src/main/skills/skill-contract'

const baseArgs = {
  provider: 'provider',
  apiKey: 'key',
  model: 'model',
  baseUrl: 'https://example.com',
  maxTokens: 1000,
  modelTimeoutMs: { agent: 1000 },
  signal: new AbortController().signal,
  styleKey: 'editorial',
  styleName: 'Editorial',
  styleSkillPrompt: 'Use a clear editorial hierarchy.',
  styleCase: '<section class="hero"><h1>Title</h1></section>',
  slideSize: { id: 'wide-16-9', width: 1600, height: 900, label: '宽屏 16:9' },
  targetPageId: 'page-2',
  targetPageNumber: 2,
  targetHtmlPath: '/tmp/page-2.html'
}

describe('page beautify prompt', () => {
  it('limits the agent to the current page and visual contracts', () => {
    const prompt = buildPageBeautifySystemPrompt({
      ...baseArgs,
      layoutSkillName: resolveLayoutSkillName(baseArgs.slideSize)
    })

    expect(prompt).toContain('exactly one editable region')
    expect(prompt).toContain('Target: page-2 (slide 2)')
    expect(prompt).toContain('Use a clear editorial hierarchy.')
    expect(prompt).toContain('Preserve the visible wording and reading order')
    expect(prompt).toContain('when the page is too dense to remain legible')
    expect(prompt).toContain('every number, date, unit, table value, chart value')
    expect(prompt).toContain('Overflow recovery (required)')
    expect(prompt).toContain('material re-composition')
    expect(prompt).toContain('Never solve overflow by adding overflow-hidden')
    expect(prompt).toContain('read_page_html')
    expect(prompt).toContain('save_current_page_content')
    expect(prompt).toContain('Read/write asymmetry')
    expect(prompt).toContain('Style case (visual reference)')
    expect(prompt).toContain('class="hero"')
    expect(prompt).toContain('ppt-page-root')
    expect(prompt).toContain('Do not add data-block-id attributes')
    expect(prompt).not.toContain('update_single_page_file')
    expect(prompt).not.toContain('get_session_context')
    expect(prompt).not.toContain('/docs/source.pdf')
    expect(prompt).not.toContain('read_current_page_content')
  })

  it('directs the model to read the slide-size layout skill via read_file before re-layouting', () => {
    const prompt = buildPageBeautifySystemPrompt({
      ...baseArgs,
      slideSize: { id: 'wide-16-9', width: 1600, height: 900, label: '16:9' },
      layoutSkillName: resolveLayoutSkillName({ id: 'wide-16-9', width: 1600, height: 900, label: '16:9' })
    })

    expect(prompt).toContain('oh-my-ppt-layout')
    expect(prompt).toMatch(/read_file/)
    expect(prompt).toMatch(/references\/catalog\.md/)
    expect(prompt).toMatch(/Re-layout is the goal/)
    expect(prompt).toContain('creative version upgrade within the selected style')
    expect(prompt).toContain('selected style is a hard visual guardrail')
    expect(prompt).toContain('only changes wording, number formatting, comments, animations')
    expect(prompt).toContain('Review the finished layout before saving')
    expect(prompt).toContain('chart configuration, and data-bearing attributes')
    expect(prompt).toContain('fixed 16:9 canvas: 1600px wide x 900px high')
    expect(prompt).toContain('x=0..1599, y=0..899')
    expect(prompt).toContain('overflow:hidden')
  })

  it('names the size-specific layout skill for non-16:9 canvases', () => {
    const slideSize = { id: 'vertical-9-16', width: 1080, height: 1920, label: '9:16' }
    const prompt = buildPageBeautifySystemPrompt({
      ...baseArgs,
      slideSize,
      layoutSkillName: resolveLayoutSkillName(slideSize)
    })

    expect(prompt).toContain('vertical-9-16-layout-skill')
    expect(prompt).toContain('fixed 9:16 canvas: 1080px wide x 1920px high')
  })

  it('gives the model a browser-measured layout audit when the preview supplies one', () => {
    const prompt = buildPageBeautifySystemPrompt({
      ...baseArgs,
      layoutSkillName: resolveLayoutSkillName(baseArgs.slideSize),
      layoutAudit:
        'Canvas: 1242px x 1660px.\nMeasured defects:\n- [text-overflow] <p>: text needs 86px more width'
    })

    expect(prompt).toContain('Current rendered layout audit')
    expect(prompt).toContain('measured this from the already-rendered current page')
    expect(prompt).toContain('text needs 86px more width')
  })
})
