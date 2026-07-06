import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildCanvasConstraints,
  buildLayoutCollisionRules,
  buildPageSemanticStructure
} from '../../../src/main/prompt/shared'
import {
  buildDeckAgentSystemPrompt,
  buildSinglePageGenerationPrompt,
  buildCanvasScenarioContentRules,
  buildCanvasScenarioDeliveryGuard,
  resolveCanvasScenario
} from '../../../src/main/prompt'
import { buildEditAgentSystemPrompt } from '../../../src/main/prompt/edit-system'
import type { SessionDeckGenerationContext } from '../../../src/main/tools/types'
import { resolveSlideSize } from '../../../src/shared/slide-size'
import {
  CHART_SKILL_NAME,
  DATA_ANIM_SKILL_NAME,
  LAYOUT_SKILL_NAME,
  RED_LAYOUT_SKILL_NAME,
  SOURCE_READING_SKILL_NAME,
  SQUARE_1_1_LAYOUT_SKILL_NAME,
  STANDARD_4_3_LAYOUT_SKILL_NAME,
  VERTICAL_3_4_LAYOUT_SKILL_NAME,
  VERTICAL_9_16_LAYOUT_SKILL_NAME,
  getRequiredProductSkillNamesForSlideSize,
  resolveLayoutSkillName
} from '../../../src/main/skills/skill-contract'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

const makeContext = (
  slideSize = resolveSlideSize({ id: 'wide-16-9' })
): SessionDeckGenerationContext => ({
  sessionId: 'session-1',
  projectDir: '/tmp/project',
  indexPath: '/tmp/project/index.html',
  pageFileMap: { 'page-1': '/tmp/project/page-1.html' },
  topic: '测试主题',
  deckTitle: '测试标题',
  styleId: 'test-style',
  styleSkillPrompt: 'Use a clean style.',
  userMessage: '生成内容',
  outlineTitles: ['第一页'],
  outlineItems: [{ title: '第一页', contentOutline: '说明重点' }],
  slideSize,
  appLocale: 'zh'
})

describe('slide size prompt', () => {
  it('uses the selected canvas dimensions', () => {
    const prompt = buildCanvasConstraints(resolveSlideSize({ id: 'standard-4-3' }))
    expect(prompt).toContain('1600×1200')
    expect(prompt).toContain('4:3')
    expect(prompt).not.toContain('1600×900')
    expect(prompt).toContain(STANDARD_4_3_LAYOUT_SKILL_NAME)
    expect(prompt).not.toContain('oh-my-ppt-adaptive-layout')
    expect(prompt).not.toContain(`skill ${LAYOUT_SKILL_NAME}`)
  })

  it('adds portrait layout guidance', () => {
    const prompt = buildCanvasConstraints(resolveSlideSize({ id: 'vertical-9-16' }))
    expect(prompt).toContain('900×1600')
    expect(prompt).toContain('竖版画布')
    expect(prompt).toContain('不要照搬横向三列')
    expect(prompt).toContain(VERTICAL_9_16_LAYOUT_SKILL_NAME)
  })

  it('injects the PPT layout skill only for 16:9', () => {
    const slideSize = resolveSlideSize({ id: 'wide-16-9' })
    expect(resolveLayoutSkillName(slideSize)).toBe(LAYOUT_SKILL_NAME)
    expect(buildCanvasConstraints(slideSize)).toContain(`skill ${LAYOUT_SKILL_NAME}`)
    expect(buildPageSemanticStructure(slideSize)).toContain(`skill ${LAYOUT_SKILL_NAME}`)
    expect(buildLayoutCollisionRules(slideSize)).toContain(`skill ${LAYOUT_SKILL_NAME}`)
    expect(getRequiredProductSkillNamesForSlideSize(slideSize)).toEqual([
      LAYOUT_SKILL_NAME,
      DATA_ANIM_SKILL_NAME,
      CHART_SKILL_NAME,
      SOURCE_READING_SKILL_NAME
    ])
  })

  it('injects red-layout-skill for Xiaohongshu', () => {
    const slideSize = resolveSlideSize({ id: 'xiaohongshu-note' })
    expect(resolveLayoutSkillName(slideSize)).toBe(RED_LAYOUT_SKILL_NAME)
    expect(buildCanvasConstraints(slideSize)).toContain(`skill ${RED_LAYOUT_SKILL_NAME}`)
    expect(buildPageSemanticStructure(slideSize)).toContain(`skill ${RED_LAYOUT_SKILL_NAME}`)
    expect(buildLayoutCollisionRules(slideSize)).toContain(`skill ${RED_LAYOUT_SKILL_NAME}`)
    expect(getRequiredProductSkillNamesForSlideSize(slideSize)).toEqual([
      RED_LAYOUT_SKILL_NAME,
      DATA_ANIM_SKILL_NAME,
      CHART_SKILL_NAME,
      SOURCE_READING_SKILL_NAME
    ])
  })

  it('injects a dedicated layout skill for every non-16:9 preset', () => {
    const cases = [
      ['vertical-9-16', VERTICAL_9_16_LAYOUT_SKILL_NAME],
      ['standard-4-3', STANDARD_4_3_LAYOUT_SKILL_NAME],
      ['square-1-1', SQUARE_1_1_LAYOUT_SKILL_NAME],
      ['vertical-3-4', VERTICAL_3_4_LAYOUT_SKILL_NAME]
    ] as const
    for (const [id, skillName] of cases) {
      const slideSize = resolveSlideSize({ id })
      expect(resolveLayoutSkillName(slideSize)).toBe(skillName)
      expect(buildCanvasConstraints(slideSize)).toContain(`skill ${skillName}`)
      expect(buildPageSemanticStructure(slideSize)).toContain(`skill ${skillName}`)
      expect(buildLayoutCollisionRules(slideSize)).toContain(`skill ${skillName}`)
      expect(getRequiredProductSkillNamesForSlideSize(slideSize)[0]).toBe(skillName)
      expect(buildCanvasConstraints(slideSize)).not.toContain('oh-my-ppt-adaptive-layout')
    }
  })

  it('uses PPT scenario wording only for presentation canvases', () => {
    const wide = resolveSlideSize({ id: 'wide-16-9' })
    const prompt = [
      buildCanvasScenarioContentRules(wide),
      buildCanvasScenarioDeliveryGuard(wide)
    ].join('\n')

    expect(resolveCanvasScenario(wide).id).toBe('presentation-wide')
    expect(prompt).toContain('PPT 是演讲辅助')
    expect(prompt).toContain('投影')
    expect(prompt).toContain('主图表页')
  })

  it('maps every supported size to an explicit scenario with no adaptive fallback', () => {
    const cases = [
      ['wide-16-9', 'presentation-wide'],
      ['standard-4-3', 'presentation-standard'],
      ['square-1-1', 'square-card'],
      ['vertical-9-16', 'mobile-story'],
      ['vertical-3-4', 'poster-card'],
      ['xiaohongshu-note', 'social-note']
    ] as const
    for (const [id, scenarioId] of cases) {
      expect(resolveCanvasScenario(resolveSlideSize({ id })).id).toBe(scenarioId)
    }

    const source = readSource('src/main/prompt/canvas-scenario.ts')
    expect(source).not.toContain('adaptive-canvas')
    expect(source).not.toContain('fallback')
    expect(source).toContain('No canvas scenario prompt configured')
  })

  it('uses mobile-story wording for 9:16 without PPT presentation delivery checks', () => {
    const vertical = resolveSlideSize({ id: 'vertical-9-16' })
    const prompt = buildDeckAgentSystemPrompt('test-style', makeContext(vertical))

    expect(resolveCanvasScenario(vertical).id).toBe('mobile-story')
    expect(prompt).toContain('移动端竖屏')
    expect(prompt).toContain('首屏')
    expect(prompt).toContain('上下阅读路径')
    expect(prompt).not.toContain('PPT 是演讲辅助')
    expect(prompt).not.toContain('投影/大屏')
    expect(prompt).not.toContain('主图表页')
  })

  it('uses square-card wording for 1:1 across deck, single-page, and edit prompts', () => {
    const square = resolveSlideSize({ id: 'square-1-1' })
    const deckPrompt = buildDeckAgentSystemPrompt('test-style', makeContext(square))
    const pagePrompt = buildSinglePageGenerationPrompt({
      topic: '测试主题',
      deckTitle: '测试标题',
      pageId: 'page-1',
      pageNumber: 1,
      pageTitle: '第一页',
      pageOutline: '说明重点',
      slideSize: square
    })
    const editPrompt = buildEditAgentSystemPrompt('test-style', {
      ...makeContext(square),
      mode: 'edit',
      editScope: 'page',
      selectedPageId: 'page-1'
    })
    const combined = [deckPrompt, pagePrompt, editPrompt].join('\n')

    expect(square).toMatchObject({ id: 'square-1-1', width: 1200, height: 1200 })
    expect(resolveCanvasScenario(square).id).toBe('square-card')
    expect(resolveLayoutSkillName(square)).toBe(SQUARE_1_1_LAYOUT_SKILL_NAME)
    expect(combined).toContain('1:1 方形内容卡')
    expect(combined).toContain('中心焦点')
    expect(combined).toContain('四边平衡')
    expect(combined).toContain(SQUARE_1_1_LAYOUT_SKILL_NAME)
    expect(combined).not.toContain('PPT 是演讲辅助')
    expect(combined).not.toContain('投影/大屏')
    expect(combined).not.toContain('主图表页')
  })

  it('uses social-note wording for Xiaohongshu across deck, single-page, and edit prompts', () => {
    const xhs = resolveSlideSize({ id: 'xiaohongshu-note' })
    const deckPrompt = buildDeckAgentSystemPrompt('test-style', makeContext(xhs))
    const pagePrompt = buildSinglePageGenerationPrompt({
      topic: '测试主题',
      deckTitle: '测试标题',
      pageId: 'page-1',
      pageNumber: 1,
      pageTitle: '第一页',
      pageOutline: '说明重点',
      slideSize: xhs
    })
    const editPrompt = buildEditAgentSystemPrompt('test-style', {
      ...makeContext(xhs),
      mode: 'edit',
      editScope: 'page',
      selectedPageId: 'page-1'
    })
    const combined = [deckPrompt, pagePrompt, editPrompt].join('\n')

    expect(resolveCanvasScenario(xhs).id).toBe('social-note')
    expect(combined).toContain('小红书图文笔记')
    expect(combined).toContain('标题钩子')
    expect(combined).toContain('收藏价值')
    expect(combined).not.toContain('PPT 是演讲辅助')
    expect(combined).not.toContain('投影/大屏')
    expect(combined).not.toContain('主图表页')
  })
})
