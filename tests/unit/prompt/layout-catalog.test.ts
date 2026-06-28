import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

const readProjectFile = (filePath: string) =>
  readFileSync(path.join(projectRoot, filePath), 'utf-8')

const layoutDir = 'resources/skills/oh-my-ppt-layout'

describe('layout skill catalog structure', () => {
  it('catalog.md declares itself advisory and style-agnostic', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)

    expect(catalog).toContain('advisory')
    expect(catalog.toLowerCase()).toContain('structure choice')
    expect(catalog).toContain('style-swap self-check')
    expect(catalog).toContain('not visual styles')
  })

  it('catalog.md gives canonical 1600x900 zone skeletons for common half-empty failures', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)

    expect(catalog).toContain('Canonical 1600×900 zone skeletons')
    for (const skeleton of [
      'full-height-two-zone',
      'vertical-timeline-lanes',
      'kpi-dashboard-balanced',
      'chart-plus-insight-stack'
    ]) {
      expect(catalog).toContain(skeleton)
    }

    expect(catalog).toContain('all real modules sit in the top half')
    expect(catalog).toContain('both zones must visibly participate in the middle of the canvas')
    expect(catalog).toContain('timeline cards should not all sit in one top row')
    expect(catalog).toContain('a metric dashboard needs a designed middle')
    expect(catalog).toContain('chart frame around 240px')
  })

  it('catalog.md contains all 22 named patterns across 9 intents', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)

    const patterns = [
      'hero-title-center',
      'hero-title-asymmetric',
      'hero-big-number',
      'section-divider',
      'hero-quote',
      'summary-takeaways',
      'executive-brief',
      'kpi-hero',
      'metric-band',
      'trend-exhibit',
      'chart-annotated',
      'compare-two-zone',
      'compare-options',
      'decision-matrix',
      'concept-center-satellites',
      'framework-2x2',
      'framework-pyramid',
      'process-linear',
      'process-loop',
      'timeline-strip',
      'asset-image-hero',
      'asset-text-visual-split'
    ]

    for (const pattern of patterns) {
      expect(catalog).toContain(pattern)
    }
    expect(patterns).toHaveLength(22)
  })

  it('catalog.md marks structural gap patterns while keeping executive-brief controlled', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)
    const headings = catalog.split('\n').filter((line) => line.startsWith('### `'))

    const executiveHeading = headings.find((line) => line.includes('`executive-brief`'))
    expect(executiveHeading).toContain('controlled high-density')

    // Structural expansion patterns can still be marked as filling a catalog gap,
    // but the high-density executive brief should not be the default density cue.
    for (const pattern of [
      'decision-matrix',
      'framework-2x2',
      'framework-pyramid',
      'process-loop'
    ]) {
      const heading = headings.find((line) => line.includes(`\`${pattern}\``))
      expect(heading, `heading for expanded pattern ${pattern}`).toBeDefined()
      expect(heading).toMatch(/fills a gap/i)
    }
  })

  it('catalog.md documents the stackable composition techniques', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)

    expect(catalog).toContain('Stackable composition techniques')
    for (const technique of [
      'unequal-zones',
      'overlap-layering',
      'bento-grid',
      'split-tone',
      'floating-cards',
      'staircase',
      'hero-band',
      'diagonal-accent',
      'asymmetric-whitespace'
    ]) {
      expect(catalog).toContain(technique)
    }
  })

  it('every catalog pattern block carries all four parts of the definition', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)

    // Split into per-pattern blocks by the `### `name`` heading, and assert each
    // block has all four parts — not just that the headers exist somewhere.
    const blocks = catalog.split(/\n(?=### `)/).filter((b) => /^### `/.test(b))
    expect(blocks.length, 'at least the 22 named patterns').toBeGreaterThanOrEqual(22)

    const parts = ['**Input shape**', '**Structure recipe**', '**Budget rule**', '**Failure signs**']
    for (const block of blocks) {
      const name = block.match(/^### `([^`]+)`/)?.[1] ?? 'unknown'
      for (const part of parts) {
        expect(block, `pattern \`${name}\` is missing ${part}`).toContain(part)
      }
    }
  })
})

describe('layout skill cross-file wiring', () => {
  it('SKILL.md points to catalog.md, layout.md, and checklist.md', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)

    expect(skill).toContain('references/catalog.md')
    expect(skill).toContain('references/layout.md')
    expect(skill).toContain('references/checklist.md')
  })

  it('SKILL.md keeps the per-page decision path and preflight shape', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)

    expect(skill).toContain('per-page decision path')
    expect(skill).toContain('pattern: trend-exhibit')
    expect(skill).toContain('skeleton: chart-plus-insight-stack')
    expect(skill).toContain('image policy: standard mode, no image request slot')
  })

  it('layout.md no longer duplicates catalog-owned or SKILL-owned sections', () => {
    const layout = readProjectFile(`${layoutDir}/references/layout.md`)

    // Composition patterns and Creative techniques moved into catalog.md.
    expect(layout).not.toContain('## Composition patterns')
    expect(layout).not.toContain('## Creative layout techniques')
    // Density rules and title readability live in SKILL.md, not here.
    expect(layout).not.toContain('## Density levels')
    expect(layout).not.toContain('## Title placement')
    // The kept deep-dive sections remain.
    expect(layout).toContain('Collision avoidance')
    expect(layout).toContain('Height budget walkthrough')
  })
})

describe('layout skill checklist levels', () => {
  it('checklist.md has P0/P1/P2 and the structural P0 items', () => {
    const checklist = readProjectFile(`${layoutDir}/references/checklist.md`)

    expect(checklist).toContain('P0 — not deliverable')
    expect(checklist).toContain('P1 — should fix')
    expect(checklist).toContain('P2 — consider optimizing')

    // P0 mirrors the project hard rules.
    expect(checklist).toContain('data-img-slot')
    expect(checklist).toContain('below 18px')
    expect(checklist).toContain('heading is below 24px')
    expect(checklist).toContain('data-ppt-text-role="auxiliary"')
    expect(checklist).toContain('two-row bottom card grid')
    expect(checklist).toContain('exceeds 1600×900')
    expect(checklist).toContain('top-heavy')
    expect(checklist).toContain('220–280px')
  })
})

const readFourLayoutFiles = () =>
  [
    readProjectFile(`${layoutDir}/SKILL.md`),
    readProjectFile(`${layoutDir}/references/catalog.md`),
    readProjectFile(`${layoutDir}/references/layout.md`),
    readProjectFile(`${layoutDir}/references/checklist.md`)
  ].join('\n')

describe('layout skill height calc — tell the canvas, let the model compute', () => {
  it('SKILL.md gives a height-budget calc method, not preset module sizes', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)
    // The original writing: a step-by-step calc the model runs per page.
    expect(skill).toContain('calculate the height budget in order')
    expect(skill).toContain('Remaining = maximum space')
    // Step 5 must direct the chart/modules to use the canvas without forcing
    // dense fill.
    expect(skill).toMatch(/intentional whitespace/i)
  })

  it('SKILL.md tells the model both canvas dimensions', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)
    expect(skill).toMatch(/1600px wide.*900px tall/s)
  })

  it('SKILL.md mirrors the chart skill role ranges and keeps breathing-room guidance', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)
    // Role ranges mirror the chart skill's height calc, while preserving real
    // presentation density.
    expect(skill).toMatch(/380.?560px/i)
    expect(skill).toMatch(/standard 280.?360px/i)
    expect(skill).toMatch(/compact support 220.?280px/i)
    // The old "should not blindly consume all leftover height" caveat biased the
    // model toward small charts; it stays removed.
    expect(skill).not.toMatch(/blindly consume all leftover/i)
    expect(skill).toMatch(/breathing room/i)
  })

  it('SKILL.md §7 treats accidental under-fill as the failure, not whitespace itself', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)
    expect(skill).toMatch(/failure is not whitespace itself/i)
    expect(skill).toMatch(/accidental under-fill/i)
  })

  it('checklist.md flags accidental empty bands without requiring dense fill', () => {
    const checklist = readProjectFile(`${layoutDir}/references/checklist.md`)
    expect(checklist).toMatch(/accidentally under-filled|empty band/i)
    expect(checklist).toMatch(/do not make the whole page dense/i)
  })

  it('catalog.md budget rules describe balance relationships, not pixel budgets', () => {
    const catalog = readProjectFile(`${layoutDir}/references/catalog.md`)
    expect(catalog).toMatch(/preserving whitespace/i)
    expect(catalog).toMatch(/not forced into a dense dashboard/i)
  })

  it('the preflight is a zone sketch + balance check, not a rigid template', () => {
    const skill = readProjectFile(`${layoutDir}/SKILL.md`)
    const block = skill.match(/```text\n([\s\S]*?)```/)
    expect(block, 'preflight block present').toBeDefined()
    const preflight = block![1]
    expect(preflight).toContain('pattern: trend-exhibit')
    expect(preflight).toContain('image policy: standard mode, no image request slot')
    // The model sketches zones and checks balance before writing HTML.
    expect(preflight).toMatch(/zones:/i)
    expect(preflight).toMatch(/balance check|breathing room/i)
    // No preset per-module pixel sum to copy.
    expect(preflight).not.toMatch(/height budget:.*\d{2,3}\s*\+/)
    // Framed as a creativity-preserving thinking aid, not a fixed template.
    expect(skill).toMatch(/thinking aid, not a template/i)
  })
})

describe('layout skill forbidden-phrase guard across all four files', () => {
  it('no banned phrasing leaks into catalog/layout/checklist (extends the SKILL guard)', () => {
    const combined = readFourLayoutFiles()

    expect(combined).not.toContain('cut content')
    expect(combined).not.toContain('move support modules to another slide')
    expect(combined).not.toContain('split the content')
    expect(combined).not.toContain('放不下就减模块')
  })

  it('does not tell the model to move content to another slide (resolve within the page instead)', () => {
    // Deck outline / page count is planned upstream; the page agent must not
    // reassign information to a different slide. When content overflows,
    // condense, regroup, convert to compact forms, or switch pattern in-page.
    const combined = readFourLayoutFiles()

    expect(combined).not.toMatch(/next slide/i)
    expect(combined).not.toMatch(/follow-?up slide/i)
    // "a new slide" is legitimate in "Creating a new slide" (When-to-use);
    // reassignment uses another / dedicated / separate / its own.
    expect(combined).not.toMatch(/(its own|another|a dedicated|a separate) slide/i)
    expect(combined).not.toMatch(/break (?:it |them )?across/i)
    expect(combined).not.toMatch(/across (?:two|2|multiple|\d+) slides/i)
    expect(combined).not.toMatch(/\bmoves? to\b[^.\n]*\b(?:slide|page|notes)\b/i)
    expect(combined).not.toMatch(/\bbelongs? on\b[^.\n]*\b(?:slide|page)\b/i)
  })

  it('does not suggest discarding information (fold / compress / relegate in-page instead)', () => {
    // "drop the extra detail" reads as permission to lose info, which collides
    // with the no-cut-content guard. Resolve by folding/compressing/relegating.
    // remove/trim are intentionally NOT banned — they have legit structural
    // uses (flatten wrappers, trim length), written as "flatten" in these files.
    const combined = readFourLayoutFiles()

    expect(combined).not.toMatch(
      /\b(drops?|dropped|dropping|omits?|discards?|deletes?|shed|shedding)\b/i
    )
  })
})
