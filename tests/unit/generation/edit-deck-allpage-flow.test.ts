import { describe, expect, it } from 'vitest'
import { resolveRemainingFailedPageInfo } from '../../../src/main/ipc/generation/edit-deck-failure-state'

describe('resolveRemainingFailedPageInfo', () => {
  it('keeps previous failures, adds new failures, and removes pages completed by this run', () => {
    const result = resolveRemainingFailedPageInfo({
      previousFailures: new Map([
        ['page-old', { title: '旧失败页', reason: '旧错误' }],
        ['page-recovered', { title: '已恢复页', reason: '旧错误' }]
      ]),
      failedResults: [
        {
          status: 'failed',
          pageId: 'page-new',
          reason: '本次错误',
          retryCount: 1
        }
      ],
      completedPageIds: new Set(['page-recovered']),
      pageRefs: [
        { pageId: 'page-old', title: '旧失败页' },
        { pageId: 'page-recovered', title: '已恢复页' },
        { pageId: 'page-new', title: '新失败页' }
      ]
    })

    expect(Array.from(result.entries())).toEqual([
      ['page-old', { title: '旧失败页', reason: '旧错误' }],
      ['page-new', { title: '新失败页', reason: '本次错误' }]
    ])
  })
})
