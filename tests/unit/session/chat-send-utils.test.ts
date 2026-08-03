import { describe, expect, it } from 'vitest'
import {
  isChatSendBlocked,
  isUnsupportedMainSessionPageStructureRequest,
  resolveChatSendContext,
  resolveMainSessionEdit
} from '../../../src/renderer/src/components/session-detail/hooks/chatSendUtils'
import type { SessionPreviewPage } from '../../../src/renderer/src/components/session-detail/shared/types'

const page = {
  id: 'page-record-2',
  pageId: 'page-2',
  pageNumber: 2,
  title: 'Second page',
  html: '<html></html>',
  htmlPath: '/tmp/page-2.html'
} satisfies SessionPreviewPage

describe('chat send utils', () => {
  it('blocks empty, duplicate, and in-progress sends', () => {
    expect(
      isChatSendBlocked({
        sessionId: 'session-1',
        sending: false,
        generating: false,
        input: '   ',
        pendingAssetCount: 0
      })
    ).toBe(true)
    expect(
      isChatSendBlocked({
        sessionId: 'session-1',
        sending: true,
        generating: false,
        input: 'Update this page',
        pendingAssetCount: 0
      })
    ).toBe(true)
    expect(
      isChatSendBlocked({
        sessionId: 'session-1',
        sending: false,
        generating: true,
        input: 'Update this page',
        pendingAssetCount: 0
      })
    ).toBe(true)
  })

  it('allows asset-only messages', () => {
    expect(
      isChatSendBlocked({
        sessionId: 'session-1',
        sending: false,
        generating: false,
        input: '',
        pendingAssetCount: 1
      })
    ).toBe(false)
  })

  it('forces selector messages into the selected page context', () => {
    expect(
      resolveChatSendContext({
        selectedSelector: '  [data-block-id="hero"]  ',
        chatType: 'main',
        selectedPage: page,
        firstPage: page
      })
    ).toEqual({
      ready: true,
      hasSelector: true,
      selector: '[data-block-id="hero"]',
      chatType: 'page',
      targetPageId: 'page-record-2',
      targetPagePath: '/tmp/page-2.html',
      messagePageId: 'page-record-2'
    })
  })

  it('rejects page chat when no page exists', () => {
    expect(
      resolveChatSendContext({
        selectedSelector: null,
        chatType: 'page',
        selectedPage: null,
        firstPage: null
      })
    ).toEqual({ ready: false })
  })

  it('infers explicit main-session page targets without editing the whole deck', () => {
    const pages = [
      { pageId: 'page-1', pageNumber: 1 },
      { pageId: 'page-2', pageNumber: 2 },
      { pageId: 'page-3', pageNumber: 3 }
    ]

    expect(resolveMainSessionEdit('只修改第 2 页的标题', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-2']
    })
    expect(resolveMainSessionEdit('只修改第三页的标题', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-3']
    })
    expect(resolveMainSessionEdit('不要改所有页面，只改第 2 页', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-2']
    })
    expect(resolveMainSessionEdit('调整当前页和 P3 的配色', pages, 'page-2')).toEqual({
      ready: true,
      selectPageIds: ['page-2', 'page-3']
    })
    expect(resolveMainSessionEdit('统一第 1-3 页的字体', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-1', 'page-2', 'page-3']
    })
  })

  it('supports Chinese page ranges and hundred-level page numbers', () => {
    const pages = Array.from({ length: 120 }, (_, index) => ({
      pageId: `page-${index + 1}`,
      pageNumber: index + 1
    }))

    expect(resolveMainSessionEdit('统一第十到第十二页的字体', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-10', 'page-11', 'page-12']
    })
    expect(resolveMainSessionEdit('修改第一百零一页的标题', pages, 'page-1')).toEqual({
      ready: true,
      selectPageIds: ['page-101']
    })
  })

  it('keeps an explicit all-pages request unscoped and rejects unknown pages', () => {
    const pages = [
      { pageId: 'intro', pageNumber: 1 },
      { pageId: 'summary', pageNumber: 2 }
    ]

    expect(resolveMainSessionEdit('统一所有页面的标题颜色', pages, 'intro')).toEqual({
      ready: true,
      selectPageIds: []
    })
    expect(resolveMainSessionEdit('修改第 9 页', pages, 'intro')).toEqual({
      ready: false,
      reason: 'page-not-found'
    })
  })

  it('blocks unsupported page structure operations without blocking edits inside a page', () => {
    const pages = [{ pageId: 'page-2', pageNumber: 2 }]

    expect(isUnsupportedMainSessionPageStructureRequest('删除第 2 页')).toBe(true)
    expect(isUnsupportedMainSessionPageStructureRequest('新增一页总结')).toBe(true)
    expect(isUnsupportedMainSessionPageStructureRequest('删除第 2 页的图表')).toBe(false)
    expect(isUnsupportedMainSessionPageStructureRequest('添加页面标题')).toBe(false)
    expect(isUnsupportedMainSessionPageStructureRequest('添加页面的标题')).toBe(false)
    expect(isUnsupportedMainSessionPageStructureRequest('add page title')).toBe(false)
    expect(isUnsupportedMainSessionPageStructureRequest("add page's title")).toBe(false)
    expect(resolveMainSessionEdit('删除第 2 页的图表', pages, 'page-2')).toEqual({
      ready: true,
      selectPageIds: ['page-2']
    })
  })
})
