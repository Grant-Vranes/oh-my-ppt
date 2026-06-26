import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

describe('content expansion rules — always-on, not source-gated', () => {
  it('CONTENT_EXPANSION_RULES expands only when the page is truly thin', () => {
    const shared = readSource('src/main/prompt/shared.ts')

    // Expansion is conditional: enough content means choose, group, and budget —
    // not more modules. This guards against dense source pages overflowing.
    expect(shared).toContain('export const CONTENT_EXPANSION_RULES')
    expect(shared).toContain('先判断是否真的不足')
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

  it('the slide-thesis soul is a shared constant (SLIDE_THESIS_RULES) foregrounded in both generation entries', () => {
    const shared = readSource('src/main/prompt/shared.ts')
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    // The soul lives ONCE in shared.ts as a constant — not inlined duplicated prose.
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

    // The soul (SLIDE_THESIS_RULES) and source-grounded expansion live ONLY in the
    // rewrite-capable edit paths (single-page + deck). Selector (element-level) and
    // container (index.html transition) edits must NOT carry whole-page signals —
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
