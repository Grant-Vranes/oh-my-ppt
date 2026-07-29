import { describe, expect, it } from 'vitest'
import {
  migrateLegacyPageOutlinesToSourceSkeletons,
  resolveOutlinesForPages,
  resolvePageContentOutline
} from '../../../src/main/session/page-outline-utils'
import type {
  GenerationPageRecord,
  PPTDatabase,
  Session,
  SessionPageRecord,
  SourcePageSkeletonRecord
} from '../../../src/main/db/database'

const makeSnapshot = (
  pageId: string,
  pageNumber: number,
  contentOutline: string
): GenerationPageRecord => ({
  id: `run:${pageId}`,
  run_id: 'run',
  session_id: 'session',
  page_id: pageId,
  page_number: pageNumber,
  title: `P${pageNumber}`,
  content_outline: contentOutline,
  layout_intent: null,
  html_path: null,
  status: 'completed',
  error: null,
  retry_count: 0,
  created_at: 1,
  updated_at: 1
})

const makeSessionPage = (
  id: string,
  fileSlug: string,
  pageNumber: number
): Pick<SessionPageRecord, 'id' | 'file_slug' | 'legacy_page_id' | 'page_number'> => ({
  id,
  file_slug: fileSlug,
  legacy_page_id: null,
  page_number: pageNumber
})

const makeSourceSkeleton = (
  pageNumber: number,
  sourceHeading: string,
  reason: string | null = null
): SourcePageSkeletonRecord => ({
  id: `session:${pageNumber}`,
  session_id: 'session',
  page_number: pageNumber,
  title: `P${pageNumber}`,
  role: 'content',
  source_document_path: '/source.md',
  source_document_name: 'source.md',
  source_heading: sourceHeading,
  heading_level: 1,
  line_start: pageNumber,
  line_end: pageNumber,
  reason,
  confidence: 'high',
  created_at: 1,
  updated_at: 1
})

describe('resolvePageContentOutline', () => {
  it('extracts explicit Chinese page sections', () => {
    const outline = [
      '第 1 页：项目背景',
      '- 市场变化',
      '第 2 页：方案策略',
      '- 分阶段落地',
      '- 明确负责人',
      '第 3 页：总结'
    ].join('\n')

    expect(resolvePageContentOutline(outline, 2)).toBe('方案策略 分阶段落地 明确负责人')
  })

  it('extracts explicit English page sections without leaking the page number', () => {
    const outline = ['Page 1: Context', 'Page 2', '- Delivery plan', '- Owner mapping'].join('\n')

    expect(resolvePageContentOutline(outline, 2)).toBe('Delivery plan Owner mapping')
  })

  it('extracts Chinese markdown page sections from the new thinking outline format', () => {
    const outline = [
      '## 第 1 页：封面',
      '- 页面角色：封面',
      '- 页面目的：建立主题',
      '',
      '用一句话说明汇报对象。',
      '- 项目名称',
      '- 汇报日期',
      '',
      '## 第 2 页：技术演进',
      '- Role: content',
      '- Objective: 说明关键趋势',
      '',
      '梳理核心技术变化和工程影响。',
      '- 架构趋势',
      '- 部署趋势'
    ].join('\n')

    expect(resolvePageContentOutline(outline, 2)).toBe(
      '技术演进 说明关键趋势 梳理核心技术变化和工程影响。 架构趋势 部署趋势'
    )
  })

  it('stops explicit page extraction before following global brief sections', () => {
    const outline = [
      '每页要点：',
      '第 1 页：背景与目标',
      '页面角色：内容页',
      '页面目的：解释项目背景',
      '必须保留：',
      '- 预算数字',
      '风格：',
      '- 克制'
    ].join('\n')

    expect(resolvePageContentOutline(outline, 1)).toBe('背景与目标 解释项目背景')
  })

  it('extracts numbered items inside an outline section', () => {
    const outline = [
      '推荐大纲',
      '1. 封面：一句话说明主题',
      '2. 现状分析：痛点、数据、机会',
      '   - 补充关键指标',
      '3. 行动计划：节奏和责任'
    ].join('\n')

    expect(resolvePageContentOutline(outline, 2)).toBe('现状分析：痛点、数据、机会 补充关键指标')
  })

  it('does not split ordinary per-page numbered bullets by default', () => {
    const outline = ['1. 保留核心指标', '2. 加一张趋势图', '3. 结尾突出风险'].join('\n')

    expect(resolvePageContentOutline(outline, 2)).toBe(
      '1. 保留核心指标 2. 加一张趋势图 3. 结尾突出风险'
    )
  })

  it('can split a shared unheaded numbered deck outline', () => {
    const outline = ['1. 背景与目标', '2. 方案设计', '3. 里程碑'].join('\n')

    expect(resolvePageContentOutline(outline, 2, { allowUnheadedNumberedOutline: true })).toBe(
      '方案设计'
    )
  })
})

describe('resolveOutlinesForPages', () => {
  it('uses source page skeletons as the page outline source', async () => {
    const db = {
      listSourcePageSkeletons: async () => [
        makeSourceSkeleton(1, '背景与目标'),
        makeSourceSkeleton(2, '方案设计', '明确交付节奏'),
        makeSourceSkeleton(3, '里程碑')
      ]
    } as Pick<PPTDatabase, 'listSourcePageSkeletons'> as PPTDatabase

    const result = await resolveOutlinesForPages(db, 'session', [
      makeSessionPage('session-a', 'page-a', 1),
      makeSessionPage('session-b', 'page-b', 2),
      makeSessionPage('session-c', 'page-c', 3)
    ])

    expect(result.get('session-a')).toBe('背景与目标')
    expect(result.get('session-b')).toBe('方案设计 明确交付节奏')
    expect(result.get('session-c')).toBe('里程碑')
  })
})

describe('migrateLegacyPageOutlinesToSourceSkeletons', () => {
  it('migrates shared generation outlines into source page skeleton rows', async () => {
    const deckOutline = ['1. 背景与目标', '2. 方案设计', '3. 里程碑'].join('\n')
    const replaced: Parameters<PPTDatabase['replaceSourcePageSkeletons']>[0][] = []
    const db = {
      listSourcePageSkeletons: async () => [],
      getSession: async () =>
        ({
          id: 'session',
          title: '迁移测试',
          reference_document_path: '/docs/source.md',
          referenceDocumentPath: '/docs/source.md'
        }) as Session,
      listSessionPages: async () => [
        makeSessionPage('session-a', 'page-a', 1) as SessionPageRecord,
        makeSessionPage('session-b', 'page-b', 2) as SessionPageRecord,
        makeSessionPage('session-c', 'page-c', 3) as SessionPageRecord
      ],
      listLatestGenerationPageSnapshot: async () => [
        makeSnapshot('page-a', 1, deckOutline),
        makeSnapshot('page-b', 2, deckOutline),
        makeSnapshot('page-c', 3, deckOutline)
      ],
      replaceSourcePageSkeletons: async (args) => {
        replaced.push(args)
      }
    } as Pick<
      PPTDatabase,
      | 'listSourcePageSkeletons'
      | 'getSession'
      | 'listSessionPages'
      | 'listLatestGenerationPageSnapshot'
      | 'replaceSourcePageSkeletons'
    > as PPTDatabase

    const result = await migrateLegacyPageOutlinesToSourceSkeletons(db, 'session')

    expect(result).toEqual({ migrated: true, migratedCount: 3, existingCount: 0 })
    expect(replaced[0]?.sourceDocumentPath).toBe('/docs/source.md')
    expect(replaced[0]?.items.map((item) => item.sourceHeading)).toEqual([
      '背景与目标',
      '方案设计',
      '里程碑'
    ])
  })

  it('does not overwrite existing source page skeletons', async () => {
    const db = {
      listSourcePageSkeletons: async () => [makeSourceSkeleton(1, '已有大纲')]
    } as Pick<PPTDatabase, 'listSourcePageSkeletons'> as PPTDatabase

    await expect(migrateLegacyPageOutlinesToSourceSkeletons(db, 'session')).resolves.toEqual({
      migrated: false,
      migratedCount: 0,
      existingCount: 1
    })
  })
})
