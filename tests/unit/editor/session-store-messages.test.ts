import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionMessages: vi.fn()
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    getSession: ipcMocks.getSession,
    getSessionMessages: ipcMocks.getSessionMessages
  }
}))

import { useSessionStore, type Message } from '@renderer/store/sessionStore'

const message: Message = {
  id: 'message-1',
  session_id: 'session-1',
  chat_scope: 'page',
  page_id: 'page-1',
  role: 'user',
  content: '保留这条消息',
  type: 'text',
  tool_name: null,
  tool_call_id: null,
  token_count: null,
  created_at: 1
}

describe('session store messages', () => {
  beforeEach(() => {
    ipcMocks.getSession.mockReset()
    ipcMocks.getSessionMessages.mockReset()
    useSessionStore.setState({
      currentSession: null,
      currentMessages: [],
      currentGeneratedPages: [],
      loading: false,
      error: null
    })
  })

  it('preserves the active conversation when session data is refreshed after cancellation', async () => {
    useSessionStore.getState().addMessage(message)
    ipcMocks.getSession.mockResolvedValue({
      session: {
        id: 'session-1',
        title: 'Session',
        topic: null,
        styleId: null,
        page_count: 1,
        status: 'completed',
        provider: 'test',
        model: 'test',
        created_at: 1,
        updated_at: 1,
        metadata: null
      },
      generatedPages: []
    })

    await useSessionStore.getState().loadSession('session-1')

    expect(useSessionStore.getState().currentMessages).toEqual([message])
  })

  it('keeps process and tool records out of the visible chat conversation', async () => {
    ipcMocks.getSessionMessages.mockResolvedValue([
      message,
      { ...message, id: 'assistant-1', role: 'assistant', content: 'AI 最终回复' },
      { ...message, id: 'system-1', role: 'system', content: '正在准备画布' },
      { ...message, id: 'tool-1', role: 'tool', content: '已更新 page-1' }
    ])

    await useSessionStore.getState().loadMessages({
      sessionId: 'session-1',
      chatType: 'page',
      pageId: 'page-1'
    })

    expect(useSessionStore.getState().currentMessages.map((item) => item.role)).toEqual([
      'user',
      'assistant'
    ])
  })

  it('ignores a stale session response without clearing the active request loading state', async () => {
    let resolveOld: ((value: unknown) => void) | undefined
    let resolveNew: ((value: unknown) => void) | undefined
    const oldRequest = new Promise((resolve) => {
      resolveOld = resolve
    })
    const newRequest = new Promise((resolve) => {
      resolveNew = resolve
    })
    ipcMocks.getSession.mockImplementation((sessionId: string) =>
      sessionId === 'session-old' ? oldRequest : newRequest
    )
    let activeSessionId = 'session-old'
    const oldLoad = useSessionStore
      .getState()
      .loadSession('session-old', () => activeSessionId === 'session-old')

    activeSessionId = 'session-new'
    const newLoad = useSessionStore
      .getState()
      .loadSession('session-new', () => activeSessionId === 'session-new')
    resolveNew?.({
      session: { id: 'session-new' },
      generatedPages: [{ id: 'page-new' }]
    })
    await newLoad

    resolveOld?.({
      session: { id: 'session-old' },
      generatedPages: [{ id: 'page-old' }]
    })
    await oldLoad

    expect(useSessionStore.getState().currentSession?.id).toBe('session-new')
    expect(useSessionStore.getState().currentGeneratedPages).toEqual([{ id: 'page-new' }])
    expect(useSessionStore.getState().loading).toBe(false)
  })
})
