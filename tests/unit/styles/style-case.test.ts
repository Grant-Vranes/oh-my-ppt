import { describe, expect, it } from 'vitest'
import {
  buildStyleCaseOptions,
  filterByStyleCase,
  filterByStyleKeyword,
  parseStyleCases
} from '../../../src/renderer/src/lib/style-case'

describe('style case filters', () => {
  it('splits, trims and deduplicates style cases', () => {
    expect(parseStyleCases('技术分享、 产品发布、技术分享')).toEqual(['技术分享', '产品发布'])
    expect(parseStyleCases('教学，培训;工作坊')).toEqual(['教学', '培训', '工作坊'])
  })

  it('counts style case options and sorts popular cases first', () => {
    expect(
      buildStyleCaseOptions([
        { styleCase: '技术分享、产品发布' },
        { styleCase: '技术分享、年度总结' },
        { styleCase: '' }
      ])
    ).toEqual([
      { label: '技术分享', count: 2 },
      { label: '产品发布', count: 1 },
      { label: '年度总结', count: 1 }
    ])
  })

  it('filters styles by an exact style case tag', () => {
    const styles = [
      { id: 'one', styleCase: '技术分享、产品发布' },
      { id: 'two', styleCase: '产品发布会、年度总结' }
    ]

    expect(filterByStyleCase(styles, '产品发布')).toEqual([styles[0]])
    expect(filterByStyleCase(styles, '')).toEqual(styles)
  })

  // 风格库页（styles.tsx）的筛选契约：tag 栏来自 buildStyleCaseOptions，列表来自 filterByStyleCase。
  // 风格库现在是「每个风格 3 个用途」格式，需保证一个风格能从它挂的任意一个 tag 筛到。
  it('powers the styles page filter: a style is reachable from each of its tags', () => {
    const options = [
      { id: 'tokyo-night', label: '东京夜', styleCase: '技术分享、教学科普、产品发布' },
      { id: 'gold-ivory', label: '金象牙', styleCase: '餐饮美食、品牌营销、艺术视觉' },
      { id: 'minimal-white', label: '极简白', styleCase: '技术分享、商业汇报、教学科普' }
    ]

    // tag 栏聚合了所有出现过的用途，按命中数排序
    const tags = buildStyleCaseOptions(options).map((tag) => tag.label)
    expect(tags).toContain('技术分享')
    expect(tags).toContain('餐饮美食')
    expect(tags).toContain('商业汇报')

    // 技术分享 同时命中 tokyo-night 和 minimal-white
    expect(filterByStyleCase(options, '技术分享').map((o) => o.id)).toEqual([
      'tokyo-night',
      'minimal-white'
    ])
    // 餐饮美食 只命中 gold-ivory
    expect(filterByStyleCase(options, '餐饮美食').map((o) => o.id)).toEqual(['gold-ivory'])
    // 空标签 = 全部
    expect(filterByStyleCase(options, '')).toEqual(options)
    // 没有风格挂的用途 = 空列表（下拉显示「没有匹配的风格」）
    expect(filterByStyleCase(options, '融资路演')).toEqual([])
  })

  // StyleSelect 下拉的搜索框：按名称/描述/用途模糊匹配，与用途 tag 筛选叠加（AND）。
  it('filters styles by keyword over name, description and use cases', () => {
    const options = [
      { id: 'tokyo-night', label: '东京夜', description: '深色技术风', styleCase: '技术分享、教学科普' },
      { id: 'gold-ivory', label: '金象牙', description: '奢华品牌', styleCase: '餐饮美食、品牌营销' },
      { id: 'arctic-cool', label: '北极冷', description: '商业数据汇报', styleCase: '商业汇报' }
    ]

    // 命中名称
    expect(filterByStyleKeyword(options, '东京').map((o) => o.id)).toEqual(['tokyo-night'])
    // 命中描述
    expect(filterByStyleKeyword(options, '奢华').map((o) => o.id)).toEqual(['gold-ivory'])
    // 命中用途
    expect(filterByStyleKeyword(options, '商业').map((o) => o.id)).toEqual(['arctic-cool'])
    // 大小写无关 + 首尾空格容错；未命中返回空
    expect(filterByStyleKeyword(options, '  融资  ').map((o) => o.id)).toEqual([])
    // 空关键词 = 全部
    expect(filterByStyleKeyword(options, '')).toEqual(options)
    // 与 tag 筛选叠加：先按用途「品牌营销」再按关键词「金」
    expect(
      filterByStyleKeyword(filterByStyleCase(options, '品牌营销'), '金').map((o) => o.id)
    ).toEqual(['gold-ivory'])
  })
})
