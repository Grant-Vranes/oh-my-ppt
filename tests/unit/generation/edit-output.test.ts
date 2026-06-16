import { describe, expect, it } from 'vitest'
import { stripInternalEditConfirmations } from '../../../src/shared/edit-output'

describe('stripInternalEditConfirmations', () => {
  it('removes internal file-scope confirmations from user-visible output', () => {
    expect(stripInternalEditConfirmations('已完成页面重绘。未修改 index.html 或其他页面。')).toBe(
      '已完成页面重绘。'
    )
    expect(
      stripInternalEditConfirmations(
        'Updated the slide. Did not modify index.html or other pages.'
      )
    ).toBe('Updated the slide.')
  })

  it('keeps useful edit summaries unchanged', () => {
    expect(stripInternalEditConfirmations('已统一标题字号并调整卡片间距。')).toBe(
      '已统一标题字号并调整卡片间距。'
    )
  })
})
