import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildDeckAgentSystemPrompt,
  buildSinglePageGenerationPrompt
} from '../../../src/main/prompt'
import type { SessionDeckGenerationContext } from '../../../src/main/tools/types'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

const baseContext: SessionDeckGenerationContext = {
  sessionId: 'session-1',
  projectDir: '/tmp/project',
  indexPath: '/tmp/project/index.html',
  pageFileMap: { 'page-1': '/tmp/project/page-1.html' },
  topic: 'Quarterly report',
  deckTitle: 'Quarterly report',
  styleId: 'test-style',
  styleSkillPrompt: 'Use a clean business style.',
  userMessage: 'Create a quarterly report.',
  outlineTitles: ['Overview'],
  outlineItems: [{ title: 'Overview', contentOutline: 'Summarize the quarter.' }],
  appLocale: 'en'
}

describe('content expansion rules — always-on, not source-gated', () => {
  it('CONTENT_EXPANSION_RULES expands only when the page is truly thin', () => {
    const shared = readSource('src/main/prompt/shared.ts')

    // Expansion is conditional: enough content means choose, group, and budget —
    // not more modules. This guards against dense source pages overflowing.
    expect(shared).toContain('export const CONTENT_EXPANSION_RULES')
    expect(shared).toContain('内容丰富与优化规则')
    expect(shared).toContain('先判断是否真的不足')
    expect(shared).toContain('写 HTML 前必须先判断内容是否需要丰富或优化')
    expect(shared).toContain('内容够了就不扩展')
    expect(shared).toContain('已有完整表格、多指标对比、图表 + 读图结论')
    expect(shared).toContain('不要再新增卡片、注释区或第二套总结')
    expect(shared).toContain('不要捏造') // boundary: no fabrication
    expect(shared).toContain('能少量讲清就不再加') // boundary: fits one page
    expect(shared).toContain('1600×900')
  })

  it('density control is single-sourced in CANVAS_CONSTRAINTS (always-on, all paths), not duplicated in CONTENT_EXPANSION_RULES', () => {
    const shared = readSource('src/main/prompt/shared.ts')
    const expansionStart = shared.indexOf('export const CONTENT_EXPANSION_RULES')
    const expansionBlock = shared.slice(
      expansionStart,
      shared.indexOf('export const', expansionStart + 1)
    )
    const canvasStart = shared.indexOf('export const CANVAS_CONSTRAINTS')
    const canvasBlock = shared.slice(canvasStart, shared.indexOf('export const', canvasStart + 1))

    // Density control lives once, in the always-on canvas block that reaches
    // generation AND edit. CONTENT_EXPANSION_RULES only owns the expansion trigger
    // and guardrails, so it must not drift into layout-specific recipes.
    expect(canvasBlock).toContain('密度由内容决定')
    expect(expansionBlock).not.toContain('扩展不是堆卡片')
    expect(expansionBlock).toContain('先判断是否真的不足')
  })

  it('is imported by the real deck-agent entry (deck-system.ts) and single-page generation', () => {
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    // The deck path runs through buildDeckAgentSystemPrompt (called in agent.ts).
    // Wire the rule where it actually ships.
    expect(deckSystem.slice(0, deckSystem.indexOf("} from './shared'"))).toContain(
      'CONTENT_EXPANSION_RULES'
    )
    expect(generationUser.slice(0, generationUser.indexOf("} from './shared'"))).toContain(
      'CONTENT_EXPANSION_RULES'
    )
  })

  it('the dead deck helper is gone (deck runs through buildDeckAgentSystemPrompt, not a never-called helper)', () => {
    const generationUser = readSource('src/main/prompt/generation-user.ts')
    expect(generationUser).not.toContain('buildDeckGenerationPrompt')
    expect(generationUser).not.toContain('buildOutlinePageList')
  })

  it('deck agent wires it into the always-on system prompt (after the source-document block)', () => {
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const deckFn = deckSystem.slice(deckSystem.indexOf('export function buildDeckAgentSystemPrompt'))

    // It sits in the main return array, after the source-document block spread,
    // so it applies whether or not source documents are present.
    const afterSourceBlock = deckFn.slice(deckFn.indexOf('...sourceDocumentInstructions'))
    expect(afterSourceBlock).toContain('CONTENT_EXPANSION_RULES')
  })

  it('single-page generation wires it into the always-on return, not the source-gated block', () => {
    const generationUser = readSource('src/main/prompt/generation-user.ts')
    const singlePageSource = generationUser.slice(
      generationUser.indexOf('export function buildSinglePageGenerationPrompt')
    )

    // Present in the main return array (after retryInstructions), not inside the
    // sourceDocumentInstructions ternary that only fires with source documents.
    const afterRetry = singlePageSource.slice(singlePageSource.indexOf('...retryInstructions'))
    expect(afterRetry).toContain('CONTENT_EXPANSION_RULES')
  })

  it('generation prompts keep slide form in SLIDE_THESIS_RULES and content enrichment in CONTENT_EXPANSION_RULES', () => {
    const deckPrompt = buildDeckAgentSystemPrompt('test-style', {
      ...baseContext,
      animationPreferences: { ids: ['fade'] }
    })
    const pagePrompt = buildSinglePageGenerationPrompt({
      topic: 'Quarterly report',
      deckTitle: 'Quarterly report',
      pageId: 'page-1',
      pageNumber: 1,
      pageTitle: 'Overview',
      pageOutline: 'Summarize the quarter.'
    })

    expect(pagePrompt).toContain('Required content enrichment decision before writing')
    expect(pagePrompt).toContain('First follow SLIDE_THESIS_RULES to decide the slide form')
    expect(pagePrompt).toContain('CONTENT_EXPANSION_RULES only to decide whether the content itself needs enrichment')
    expect(pagePrompt).toContain('the page is thin: enrich the argument structure')
    expect(pagePrompt).toContain('animation is downstream only')
    expect(pagePrompt).toContain('must follow the slide form, source grounding, and warranted content enrichment')

    expect(deckPrompt).toContain('Animation preferences for page writing only')
    expect(deckPrompt).toContain('Animation is downstream only')
    expect(deckPrompt).toContain('Never reduce, skip, or reshape warranted content enrichment')
    expect(deckPrompt).toContain('写 HTML 前必须先判断内容是否需要丰富或优化')
    expect(deckPrompt.indexOf('写 HTML 前必须先判断内容是否需要丰富或优化')).toBeLessThan(
      deckPrompt.indexOf('Animation preferences for page writing only')
    )
  })

  it('slide-thesis rules own the form guidance while content expansion owns enrichment', () => {
    const shared = readSource('src/main/prompt/shared.ts')
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    // The thesis helper lives once in shared.ts as a constant — not inlined duplicated prose.
    expect(shared).toContain('export const SLIDE_THESIS_RULES')
    expect(shared).toContain('3 秒主旨')
    expect(shared).toContain('PPT 是演讲辅助')
    expect(shared).toContain('一个焦点')
    expect(shared).toContain('构图平衡')
    expect(shared).toContain('留白是设计，不是待填的空')
    expect(shared).toContain('量的多少不是问题，平衡才是')
    expect(shared).toContain('按焦点取舍而非逐条上屏')

    // Both real generation entries import and foreground it (DRY — one source).
    expect(deckSystem).toContain('SLIDE_THESIS_RULES')
    expect(generationUser).toContain('SLIDE_THESIS_RULES')

    // Form guidance and source-grounded content enrichment live ONLY in the
    // rewrite-capable edit paths (single-page + deck). Selector (element-level)
    // and container edits must NOT carry whole-page signals —
    // that would violate their narrow scope. Slice each edit function's body and
    // assert the boundary precisely so a future mis-wire is caught.
    const editSystem = readSource('src/main/prompt/edit-system.ts')
    const containerEdit = editSystem.slice(
      editSystem.indexOf('function buildContainerEditPrompt('),
      editSystem.indexOf('function buildSelectorEditPrompt(')
    )
    const selectorEdit = editSystem.slice(
      editSystem.indexOf('function buildSelectorEditPrompt('),
      editSystem.indexOf('function buildSinglePageEditPrompt(')
    )
    const singlePageEdit = editSystem.slice(
      editSystem.indexOf('function buildSinglePageEditPrompt('),
      editSystem.indexOf('function buildDeckEditPrompt(')
    )
    const deckEdit = editSystem.slice(editSystem.indexOf('function buildDeckEditPrompt('))

    expect(singlePageEdit).toContain('SLIDE_THESIS_RULES')
    expect(deckEdit).toContain('SLIDE_THESIS_RULES')
    expect(selectorEdit).not.toContain('SLIDE_THESIS_RULES')
    expect(containerEdit).not.toContain('SLIDE_THESIS_RULES')

    expect(singlePageEdit).toContain('CONTENT_EXPANSION_RULES')
    expect(deckEdit).toContain('CONTENT_EXPANSION_RULES')
    expect(selectorEdit).not.toContain('CONTENT_EXPANSION_RULES')
    expect(containerEdit).not.toContain('CONTENT_EXPANSION_RULES')

    // SOURCE_GROUNDED_EXPANSION_RULES ("enrich the slide") is gated to the rewrite
    // paths via includeExpansion; selector/container must not enable it.
    expect(singlePageEdit).toContain('includeExpansion: true')
    expect(deckEdit).toContain('includeExpansion: true')
    expect(selectorEdit).not.toContain('includeExpansion: true')
    expect(containerEdit).not.toContain('includeExpansion: true')

    // The old checklist-mirroring directive is gone (it contradicted the thesis-first rule).
    expect(deckSystem).not.toContain(
      'Fill each corresponding page strictly according to the content points'
    )
  })
})
