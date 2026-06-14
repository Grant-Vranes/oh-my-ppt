import { describe, expect, it } from 'vitest'
import { progressDisplayLabel } from '../../../src/shared/progress'

describe('progressDisplayLabel', () => {
  it('preserves page-specific completion labels', () => {
    expect(progressDisplayLabel('zh', 'P3 编辑完成')).toBe('P3 编辑完成')
    expect(progressDisplayLabel('zh', 'P3 当前步骤完成，正在校验页面')).toBe(
      'P3 当前步骤完成，正在校验页面'
    )
    expect(progressDisplayLabel('zh', '第 3 页重试成功')).toBe('第 3 页重试成功')
  })

  it('still normalizes generic labels', () => {
    expect(progressDisplayLabel('zh', '已完成')).toBe('已完成')
    expect(progressDisplayLabel('zh', '正在改写页面')).toBe('生成页面')
    expect(progressDisplayLabel('en', '正在校验')).toBe('Checking pages')
  })
})
