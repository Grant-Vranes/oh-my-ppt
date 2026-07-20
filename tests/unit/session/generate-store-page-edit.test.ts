import { beforeEach, describe, expect, it } from 'vitest'
import {
  hydrateStyleSwitchJob,
  isStyleSwitchJobActive,
  isStyleSwitchPageLocked,
  useGenerateStore
} from '../../../src/renderer/src/store/generateStore'

describe('generateStore page edit job', () => {
  const sessionId = 'session-1'

  beforeEach(() => {
    useGenerateStore.getState().reset()
  })

  it('tracks a page edit without enabling the global generation lock', () => {
    useGenerateStore.getState().startPageEdit(sessionId, { pageId: 'page-2', pageNumber: 2 })
    useGenerateStore.getState().updatePageEdit(sessionId, {
      runId: 'run-edit-1',
      status: 'running',
      label: '正在编辑第 2 页',
      progress: 55
    })

    expect(useGenerateStore.getState()).toMatchObject({
      isGenerating: false,
      pageEditJobs: {
        [sessionId]: {
          pageId: 'page-2',
          pageNumber: 2,
          runId: 'run-edit-1',
          status: 'running',
          progress: 55
        }
      }
    })

    useGenerateStore.getState().finishPageEdit(sessionId)
    expect(useGenerateStore.getState().pageEditJobs[sessionId]).toBeUndefined()
  })

  it('keeps a page-edit plan pending without creating a page job', () => {
    useGenerateStore.getState().startPageEditPlanning(sessionId, 'page-2')
    useGenerateStore.getState().setPendingPageEditPlan(sessionId, {
      targetPageId: 'page-2',
      targetPageNumber: 2,
      payload: {
        sessionId: 'session-1',
        userMessage: '把标题改成更简洁的表达',
        type: 'page',
        chatType: 'page',
        selectedPageId: 'page-2'
      },
      plan: {
        intent: 'content',
        target: '第 2 页标题',
        summary: '精简标题并保持现有布局。',
        changes: ['缩短标题文案'],
        confirmationQuestion: '确认按此计划修改吗？'
      }
    })
    useGenerateStore.getState().finishPageEditPlanning(sessionId)

    expect(useGenerateStore.getState()).toMatchObject({
      isGenerating: false,
      pageEditJobs: {},
      pageEditPlanning: {
        [sessionId]: {
          isAssessing: false,
          pendingPlan: {
            targetPageId: 'page-2',
            plan: { intent: 'content' }
          }
        }
      }
    })

    useGenerateStore.getState().clearPendingPageEditPlan(sessionId)
    expect(useGenerateStore.getState().pageEditPlanning[sessionId]?.pendingPlan).toBeNull()
  })

  it('tracks a deck edit by session without clearing the current pages', () => {
    useGenerateStore.getState().setPages([
      {
        id: 'page-record-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Page 1',
        html: '<div>Page</div>'
      }
    ])
    useGenerateStore.getState().startDeckEdit(sessionId, { totalPages: 3 })
    useGenerateStore.getState().updateDeckEdit(sessionId, {
      runId: 'deck-edit-run-1',
      status: 'running',
      label: '正在编辑主会话',
      progress: 40,
      totalPages: 3
    })

    expect(useGenerateStore.getState()).toMatchObject({
      isGenerating: false,
      currentPages: [{ pageId: 'page-1' }],
      deckEditJobs: {
        [sessionId]: {
          runId: 'deck-edit-run-1',
          totalPages: 3,
          progress: 40
        }
      }
    })

    useGenerateStore.getState().finishDeckEdit(sessionId)
    expect(useGenerateStore.getState()).toMatchObject({
      isGenerating: false,
      deckEditJobs: {},
      currentPages: [{ pageId: 'page-1' }]
    })
  })

  it('keeps jobs and plans isolated between sessions', () => {
    useGenerateStore.getState().startPageEdit('session-a', { pageId: 'page-a', pageNumber: 1 })
    useGenerateStore.getState().startDeckEdit('session-b', { totalPages: 2 })
    useGenerateStore.getState().setPendingPageEditPlan('session-a', {
      targetPageId: 'page-a',
      payload: { sessionId: 'session-a', userMessage: '改标题', type: 'page', chatType: 'page' },
      plan: {
        intent: 'content',
        target: '标题',
        summary: '更新标题',
        changes: ['替换标题文本'],
        confirmationQuestion: '确认修改吗？'
      }
    })

    expect(useGenerateStore.getState().pageEditJobs['session-b']).toBeUndefined()
    expect(useGenerateStore.getState().deckEditJobs['session-a']).toBeUndefined()
    expect(useGenerateStore.getState().pageEditPlanning['session-b']).toBeUndefined()
    expect(useGenerateStore.getState().pageEditPlanning['session-a']?.pendingPlan).not.toBeNull()
  })

  it('does not let an older assessment finish a newer assessment', () => {
    useGenerateStore.getState().startPageEditPlanning(sessionId, 'page-2', 'assessment-old')
    useGenerateStore.getState().startPageEditPlanning(sessionId, 'page-2', 'assessment-new')

    useGenerateStore.getState().finishPageEditPlanning(sessionId, 'assessment-old')
    expect(useGenerateStore.getState().pageEditPlanning[sessionId]).toMatchObject({
      assessmentId: 'assessment-new',
      isAssessing: true
    })

    useGenerateStore.getState().finishPageEditPlanning(sessionId, 'assessment-new')
    expect(useGenerateStore.getState().pageEditPlanning[sessionId]?.isAssessing).toBe(false)
  })

  it('keeps session errors isolated and clears only the session that starts a new job', () => {
    useGenerateStore.getState().setSessionError('session-a', 'A failed')
    useGenerateStore.getState().setSessionError('session-b', 'B failed')

    useGenerateStore.getState().startPageEdit('session-a', { pageId: 'page-a', pageNumber: 1 })

    expect(useGenerateStore.getState().sessionErrors).toEqual({
      'session-b': 'B failed'
    })

    useGenerateStore.getState().clearSessionError('session-b')
    expect(useGenerateStore.getState().sessionErrors).toEqual({})
  })

  it('keeps a cancelling edit job locked until a terminal event removes it', () => {
    useGenerateStore.getState().startDeckEdit(sessionId, { totalPages: 2 })
    useGenerateStore.getState().updateDeckEdit(sessionId, {
      status: 'cancelling',
      label: '正在取消并恢复修改前内容'
    })

    expect(useGenerateStore.getState().deckEditJobs[sessionId]).toMatchObject({
      status: 'cancelling'
    })

    useGenerateStore.getState().finishDeckEdit(sessionId)
    expect(useGenerateStore.getState().deckEditJobs[sessionId]).toBeUndefined()
  })

  it('unlocks only pages with a committed style-switch result', () => {
    useGenerateStore.getState().startStyleSwitch(sessionId, {
      styleId: 'style-new',
      styleName: 'New style',
      totalPages: 2,
      pages: [
        {
          pageId: 'page-1',
          pageNumber: 1,
          title: 'Page 1',
          status: 'pending',
          error: null,
          retryCount: 0
        },
        {
          pageId: 'page-2',
          pageNumber: 2,
          title: 'Page 2',
          status: 'pending',
          error: null,
          retryCount: 0
        }
      ]
    })
    useGenerateStore.getState().updateStyleSwitchJob(sessionId, {
      runId: 'style-run-1',
      status: 'running'
    })
    const job = useGenerateStore.getState().styleSwitchJobs[sessionId]

    expect(isStyleSwitchJobActive(job)).toBe(true)
    expect(isStyleSwitchPageLocked(job, 'page-1')).toBe(true)
    expect(isStyleSwitchPageLocked(job, 'page-2')).toBe(true)

    useGenerateStore.getState().updateStyleSwitchPage(sessionId, 'page-1', {
      status: 'completed',
      error: null
    })
    const afterFirstCommit = useGenerateStore.getState().styleSwitchJobs[sessionId]
    expect(isStyleSwitchPageLocked(afterFirstCommit, 'page-1')).toBe(false)
    expect(isStyleSwitchPageLocked(afterFirstCommit, 'page-2')).toBe(true)

    useGenerateStore.getState().finishStyleSwitch(sessionId, { status: 'partial', error: null })
    expect(isStyleSwitchJobActive(useGenerateStore.getState().styleSwitchJobs[sessionId])).toBe(
      false
    )
    expect(
      isStyleSwitchPageLocked(useGenerateStore.getState().styleSwitchJobs[sessionId], 'page-2')
    ).toBe(true)
  })

  it('replaces an optimistic style-switch job with the persisted active run', () => {
    useGenerateStore.getState().startStyleSwitch(sessionId, {
      styleId: 'style-new',
      totalPages: 1,
      pages: [
        {
          pageId: 'page-1',
          pageNumber: 1,
          title: 'Optimistic page',
          status: 'pending',
          error: null,
          retryCount: 0
        }
      ]
    })

    hydrateStyleSwitchJob(sessionId, {
      runId: 'persisted-run',
      status: 'running',
      progress: 40,
      totalPages: 2,
      targetStyleId: 'style-existing',
      targetStyleName: 'Existing style',
      error: null,
      pages: [
        {
          pageId: 'page-1',
          pageNumber: 1,
          title: 'Persisted page',
          status: 'completed',
          error: null,
          retryCount: 1
        },
        {
          pageId: 'page-2',
          pageNumber: 2,
          title: 'Running page',
          status: 'running',
          error: null,
          retryCount: 0
        }
      ]
    })

    expect(useGenerateStore.getState().styleSwitchJobs[sessionId]).toMatchObject({
      runId: 'persisted-run',
      status: 'running',
      styleId: 'style-existing',
      totalPages: 2
    })
    expect(
      isStyleSwitchPageLocked(useGenerateStore.getState().styleSwitchJobs[sessionId], 'page-1')
    ).toBe(false)
    expect(
      isStyleSwitchPageLocked(useGenerateStore.getState().styleSwitchJobs[sessionId], 'page-2')
    ).toBe(true)
  })
})
