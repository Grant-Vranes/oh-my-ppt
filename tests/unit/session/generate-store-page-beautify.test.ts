import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerateStore } from '../../../src/renderer/src/store/generateStore'

describe('generateStore page beautify job', () => {
  const sessionId = 'session-1'

  beforeEach(() => {
    useGenerateStore.getState().reset()
  })

  it('tracks a target page without enabling the global generation lock', () => {
    useGenerateStore.getState().startPageBeautify(sessionId, { pageId: 'page-2', pageNumber: 2 })
    useGenerateStore.getState().updatePageBeautify(sessionId, {
      runId: 'run-beautify-1',
      status: 'running',
      label: '正在美化第 2 页',
      progress: 55
    })

    expect(useGenerateStore.getState()).toMatchObject({
      isGenerating: false,
      pageBeautifyJobs: {
        [sessionId]: {
          pageId: 'page-2',
          pageNumber: 2,
          runId: 'run-beautify-1',
          status: 'running',
          progress: 55
        }
      }
    })

    useGenerateStore.getState().finishPageBeautify(sessionId)
    expect(useGenerateStore.getState().pageBeautifyJobs[sessionId]).toBeUndefined()
  })
})
