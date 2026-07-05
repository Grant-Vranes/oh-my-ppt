import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildDeckAgentSystemPrompt,
  buildSinglePageGenerationPrompt
} from '../../../src/main/prompt'
import type { SessionDeckGenerationContext } from '../../../src/main/tools/types'
import { resolveSlideSize } from '../../../src/shared/slide-size'

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
  slideSize: resolveSlideSize({ id: 'wide-16-9' }),
  appLocale: 'en'
}

describe('content expansion rules — always-on, not source-gated', () => {
  it('scenario expansion rules expand only when the page is truly thin', () => {
    const scenario = readSource('src/main/prompt/canvas-scenario.ts')

    // Expansion is conditional: enough content means choose, group, and budget —
    // not more modules. This guards against dense source pages overflowing.
    expect(scenario).toContain('export function buildCanvasScenarioExpansionRules')
    expect(scenario).toContain('内容丰富与优化规则')
    expect(scenario).toContain('够了就压缩')
    expect(scenario).toContain('禁止捏造')
    expect(scenario).toContain('收在当前画布内')
    expect(scenario).toContain('演示页的“够”')
    expect(scenario).toContain('竖屏的“够”')
    expect(scenario).toContain('小红书页的“够”')
  })

  it('density control is single-sourced in canvas constraints, not duplicated in scenario expansion rules', () => {
    const shared = readSource('src/main/prompt/shared.ts')
    const scenario = readSource('src/main/prompt/canvas-scenario.ts')
    const expansionStart = scenario.indexOf('export function buildCanvasScenarioExpansionRules')
    const expansionBlock = scenario.slice(
      expansionStart,
      scenario.indexOf('export function buildCanvasScenarioDeliveryGuard', expansionStart)
    )
    const canvasStart = shared.indexOf('export function buildCanvasConstraints')
    const canvasBlock = shared.slice(
      canvasStart,
      shared.indexOf('export function buildLayoutCollisionRules', canvasStart)
    )

    // Density control lives once, in the always-on canvas block that reaches
    // generation AND edit. Scenario expansion only owns the expansion trigger
    // and guardrails, so it must not drift into layout-specific recipes.
    expect(canvasBlock).toContain('密度由内容决定')
    expect(expansionBlock).not.toContain('扩展不是堆卡片')
    expect(expansionBlock).toContain('偏薄')
  })

  it('is imported by the real deck-agent entry and single-page generation', () => {
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    // The deck path runs through buildDeckAgentSystemPrompt (called in agent.ts).
    // Wire the rule where it actually ships.
    expect(deckSystem).toContain('buildCanvasScenarioExpansionRules')
    expect(generationUser).toContain('buildCanvasScenarioExpansionRules')
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
    expect(afterSourceBlock).toContain('buildCanvasScenarioExpansionRules(context.slideSize)')
  })

  it('single-page generation wires it into the always-on return, not the source-gated block', () => {
    const generationUser = readSource('src/main/prompt/generation-user.ts')
    const singlePageSource = generationUser.slice(
      generationUser.indexOf('export function buildSinglePageGenerationPrompt')
    )

    // Present in the main return array (after retryInstructions), not inside the
    // sourceDocumentInstructions ternary that only fires with source documents.
    const afterRetry = singlePageSource.slice(singlePageSource.indexOf('...retryInstructions'))
    expect(afterRetry).toContain('buildCanvasScenarioExpansionRules(args.slideSize)')
  })

  it('generation prompts keep page form in scenario rules and content enrichment in scenario expansion rules', () => {
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
      pageOutline: 'Summarize the quarter.',
      slideSize: baseContext.slideSize
    })

    expect(pagePrompt).toContain('Required content enrichment decision before writing')
    expect(pagePrompt).toContain('First use the Canvas scenario rules to decide the page form')
    expect(pagePrompt).toContain('scenario expansion rules only to decide whether the content itself needs enrichment')
    expect(pagePrompt).toContain('the page is thin: enrich the warranted structure')
    expect(pagePrompt).toContain('animation is downstream only')
    expect(pagePrompt).toContain('must follow the current canvas scenario, source grounding, and warranted content enrichment')

    expect(deckPrompt).toContain('Animation preferences for page writing only')
    expect(deckPrompt).toContain('Animation is downstream only')
    expect(deckPrompt).toContain('Never reduce, skip, or reshape warranted content enrichment')
    expect(deckPrompt).toContain('写 HTML 前判断')
    expect(deckPrompt.indexOf('写 HTML 前判断')).toBeLessThan(
      deckPrompt.indexOf('Animation preferences for page writing only')
    )
  })

  it('section agenda page prompts do not request source document reading', () => {
    const pagePrompt = buildSinglePageGenerationPrompt({
      topic: 'AI动漫报告',
      deckTitle: 'AI动漫报告',
      pageId: 'page-2',
      pageNumber: 2,
      pageTitle: '二、技术参数与技术效率明细',
      pageOutline: [
        'Page role: section-agenda',
        'Page purpose: 章节目录页：概览本章下的子主题，包括：2.1 主流AI动漫工具性能对比、2.2 训练数据规模、2.3 效率实证。'
      ].join('\n'),
      slideSize: baseContext.slideSize,
      sourceDocumentPaths: ['/docs/source.md'],
      referenceDocumentSnippets: '[片段 1] /docs/source.md#L18-L50\n内容：should not appear'
    })

    expect(pagePrompt).toContain('Section agenda page requirements')
    expect(pagePrompt).toContain('Use only the child topic names already listed')
    expect(pagePrompt).not.toContain('Source document requirements')
    expect(pagePrompt).not.toContain('Range-bound source reading')
    expect(pagePrompt).not.toContain('参考文档检索片段')
    expect(pagePrompt).not.toContain('should not appear')
  })

  it('section agenda single-page system prompts ignore source document paths', () => {
    const deckPrompt = buildDeckAgentSystemPrompt('test-style', {
      ...baseContext,
      sourceDocumentPaths: ['/docs/source.md'],
      selectedPageId: 'page-1',
      selectedPageNumber: 1,
      outlineTitles: ['二、技术参数与技术效率明细'],
      outlineItems: [
        {
          title: '二、技术参数与技术效率明细',
          contentOutline: [
            'Page role: section-agenda',
            'Page purpose: 章节目录页：概览本章下的子主题，包括：2.1 主流AI动漫工具性能对比、2.2 训练数据规模、2.3 效率实证。'
          ].join('\n'),
          layoutIntent: 'summary'
        }
      ]
    })

    expect(deckPrompt).not.toContain('## Source documents')
    expect(deckPrompt).not.toContain('source-reading skill')
    expect(deckPrompt).not.toContain('/docs/source.md')
  })

  it('scenario content rules own the form guidance while scenario expansion owns enrichment', () => {
    const scenario = readSource('src/main/prompt/canvas-scenario.ts')
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    expect(scenario).toContain('export function buildCanvasScenarioContentRules')
    expect(scenario).toContain('3 秒主旨')
    expect(scenario).toContain('PPT 是演讲辅助')
    expect(scenario).toContain('移动端竖屏')
    expect(scenario).toContain('小红书图文笔记')
    expect(scenario).toContain('一个焦点')
    expect(scenario).toContain('构图平衡')

    // Both real generation entries import and foreground it (DRY — one source).
    expect(deckSystem).toContain('buildCanvasScenarioContentRules')
    expect(generationUser).toContain('buildCanvasScenarioContentRules')

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

    expect(singlePageEdit).toContain('buildCanvasScenarioContentRules')
    expect(deckEdit).toContain('buildCanvasScenarioContentRules')
    expect(selectorEdit).not.toContain('buildCanvasScenarioContentRules')
    expect(containerEdit).not.toContain('buildCanvasScenarioContentRules')

    expect(singlePageEdit).toContain('buildCanvasScenarioExpansionRules')
    expect(deckEdit).toContain('buildCanvasScenarioExpansionRules')
    expect(selectorEdit).not.toContain('buildCanvasScenarioExpansionRules')
    expect(containerEdit).not.toContain('buildCanvasScenarioExpansionRules')

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
