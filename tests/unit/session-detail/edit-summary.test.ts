import { describe, expect, it, vi } from 'vitest'
import type { EditContext } from '../../../src/main/ipc/generation/types'
import type { EditedPageDescriptor } from '../../../src/main/ipc/generation/generation-utils'
import { buildLocalSuccessfulEditSummary } from '../../../src/main/ipc/generation/edit-summary-core'
import { emitSuccessfulEditSummary } from '../../../src/main/ipc/generation/edit-summary'

const changedPage = {
  pageNumber: 1
}

describe('edit summary', () => {
  it('builds deterministic selector summaries from verified changed pages', () => {
    expect(
      buildLocalSuccessfulEditSummary({
        appLocale: 'zh',
        editScope: 'selector',
        changedPages: [changedPage]
      })
    ).toBe('已完成第1页的选中元素修改。')
  })

  it('reports mixed deck outcomes from verified success and failure facts', () => {
    expect(
      buildLocalSuccessfulEditSummary({
        appLocale: 'zh',
        editScope: 'deck',
        changedPages: [changedPage],
        failedPageLabels: ['第3页']
      })
    ).toBe('部分修改完成：成功 第1页；失败 第3页。')
  })

  it('reports an all-failed deck edit instead of treating it as no change', () => {
    expect(
      buildLocalSuccessfulEditSummary({
        appLocale: 'zh',
        editScope: 'deck',
        changedPages: [],
        failedPageLabels: ['第1页', '第3页']
      })
    ).toBe('页面修改失败：第1页、第3页。')
  })

  it('keeps the no-change message for flows without failed pages', () => {
    expect(
      buildLocalSuccessfulEditSummary({
        appLocale: 'en',
        editScope: 'page',
        changedPages: []
      })
    ).toBe('No page changes needed to be saved this time.')
  })

  it('does not fail a completed edit when the assistant message cannot be stored', async () => {
    const emitAssistant = vi.fn().mockRejectedValue(new Error('message store unavailable'))
    const context = {
      appLocale: 'zh',
      sessionId: 'session-1',
      runId: 'run-1'
    } as EditContext
    const page = {
      ...changedPage,
      id: 'row-1',
      title: '封面',
      pageId: 'page-1',
      html: '<section></section>',
      htmlPath: '/tmp/page-1.html'
    } as EditedPageDescriptor

    await emitSuccessfulEditSummary(
      context,
      buildLocalSuccessfulEditSummary({
        appLocale: context.appLocale,
        changedPages: [page],
        editScope: 'page'
      }),
      emitAssistant
    )

    expect(emitAssistant).toHaveBeenCalledWith(context, '修改完成：第1页。')
  })
})
