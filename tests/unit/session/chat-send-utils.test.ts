import { describe, expect, it } from 'vitest'
import {
  isChatSendBlocked,
  resolveChatSendContext
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

})
