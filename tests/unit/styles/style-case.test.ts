import { describe, expect, it } from 'vitest'
import {
  buildStyleCaseOptions,
  filterByStyleCase,
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
})
