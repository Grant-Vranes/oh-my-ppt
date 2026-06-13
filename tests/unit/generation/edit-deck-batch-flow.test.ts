import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BATCH_EDIT_CHUNK_SIZE,
  DeckEditIndexMutationError,
  buildDeckEditPageUserMessage,
  executeDeckEditBatchFlow,
  type DeckEditBatchPageRef
} from '../../../src/main/ipc/generation/edit-deck-batch-flow'

const tempDirs: string[] = []

const validPageHtml = (pageId: string, text: string): string => `<!doctype html>
<html>
  <body>
    <div class="ppt-page-root" data-ppt-guard-root="1" data-page-id="${pageId}">
      <div class="ppt-page-content">${text}</div>
    </div>
  </body>
</html>`

const createFixture = async (
  pageCount: number
): Promise<{
  projectDir: string
  indexPath: string
  pageRefs: DeckEditBatchPageRef[]
}> => {
  const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deck-edit-batch-'))
  tempDirs.push(projectDir)
  const indexPath = path.join(projectDir, 'index.html')
  await fs.promises.writeFile(indexPath, '<html><body>index</body></html>', 'utf-8')
  const pageRefs: DeckEditBatchPageRef[] = []
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1
    const pageId = `page-${pageNumber}`
    const htmlPath = path.join(projectDir, `${pageId}.html`)
    await fs.promises.writeFile(htmlPath, validPageHtml(pageId, `before-${pageId}`), 'utf-8')
    pageRefs.push({
      id: `id-${pageNumber}`,
      pageNumber,
      title: `Page ${pageNumber}`,
      pageId,
      htmlPath
    })
  }
  return { projectDir, indexPath, pageRefs }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.promises.rm(dir, { recursive: true, force: true }))
  )
})

describe('deck edit batch flow', () => {
  it('limits active page workers with p-limit and continues through the queue', async () => {
    const fixture = await createFixture(6)
    let activeWorkers = 0
    let maxActiveWorkers = 0
    const startedPages: string[] = []
    const releaseWorkers: Array<() => void> = []

    const waitForWorkerRelease = (): Promise<void> =>
      new Promise((resolve) => {
        releaseWorkers.push(resolve)
      })

    const flowPromise = executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-p-limit',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId }) => {
        startedPages.push(pageId)
        activeWorkers += 1
        maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers)
        await waitForWorkerRelease()
        activeWorkers -= 1
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        return 'done'
      }
    })

    await vi.waitFor(() => {
      expect(startedPages).toHaveLength(BATCH_EDIT_CHUNK_SIZE)
    })
    expect(startedPages).toEqual(['page-1', 'page-2', 'page-3'])
    expect(maxActiveWorkers).toBe(BATCH_EDIT_CHUNK_SIZE)

    releaseWorkers.splice(0, BATCH_EDIT_CHUNK_SIZE).forEach((release) => release())
    await vi.waitFor(() => {
      expect(startedPages).toHaveLength(6)
    })
    expect(startedPages).toEqual(['page-1', 'page-2', 'page-3', 'page-4', 'page-5', 'page-6'])
    releaseWorkers.splice(0).forEach((release) => release())

    const results = await flowPromise
    expect(results.every((result) => result.status === 'completed')).toBe(true)
    expect(maxActiveWorkers).toBe(BATCH_EDIT_CHUNK_SIZE)
  })

  it('builds a per-page edit message with the target page id', () => {
    const message = buildDeckEditPageUserMessage({
      originalUserMessage: '统一标题颜色',
      pageId: 'page-4'
    })
    expect(message).toContain('统一标题颜色')
    expect(message).toContain('Edit ONLY this page: page-4')
    expect(message).toContain('must not write them')
  })

  it('uses only one retry for a no-change page', async () => {
    const fixture = await createFixture(1)
    let attempts = 0
    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '修改第一页',
      runId: 'run-1',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: ({ baseMessage, kind }) =>
        kind === 'no_change' ? `${baseMessage}\nretry` : null,
      runPageAttempt: async ({ pageId, isRetry }) => {
        attempts += 1
        if (isRetry) {
          const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
          await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        }
        return 'done'
      }
    })

    expect(attempts).toBe(2)
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('completed')
  })

  it('does not start a third attempt when the retry also makes no changes', async () => {
    const fixture = await createFixture(1)
    let attempts = 0
    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '修改第一页',
      runId: 'run-no-third-attempt',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: ({ baseMessage, kind }) =>
        kind === 'no_change' ? `${baseMessage}\nretry` : null,
      runPageAttempt: async () => {
        attempts += 1
        return 'done'
      }
    })

    expect(attempts).toBe(2)
    expect(results[0]).toMatchObject({ status: 'failed', retryCount: 1 })
  })

  it('restores a failed page and continues with later pages', async () => {
    const fixture = await createFixture(7)
    const startedPages: string[] = []
    const emittedLabels: string[] = []
    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-2',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: (chunk) => {
        if ('label' in chunk.payload && typeof chunk.payload.label === 'string') {
          emittedLabels.push(chunk.payload.label)
        }
      },
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId, emit }) => {
        startedPages.push(pageId)
        emit({
          type: 'llm_status',
          payload: {
            runId: 'run-2',
            stage: 'editing',
            label: `编辑 ${pageId}`,
            progress: 50,
            currentPage: 1,
            totalPages: 1
          }
        })
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        const pageIndex = fixture.pageRefs.findIndex((ref) => ref.pageId === pageId)
        await fs.promises.writeFile(
          page.htmlPath,
          validPageHtml(page.pageId, `after-page-${pageIndex}`),
          'utf-8'
        )
        if (pageIndex >= 3 && pageIndex <= 5) throw new Error('provider unavailable')
        return `page-${pageIndex}`
      }
    })

    expect(startedPages).toEqual([
      'page-1',
      'page-2',
      'page-3',
      'page-4',
      'page-5',
      'page-6',
      'page-7'
    ])
    expect(results.map((result) => result.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'failed',
      'failed',
      'failed',
      'completed'
    ])
    expect(emittedLabels).toContain('正在编辑 P4')
    expect(emittedLabels).toContain('正在编辑 P7')
    expect(await fs.promises.readFile(fixture.pageRefs[3].htmlPath, 'utf-8')).toContain(
      'before-page-4'
    )
    expect(await fs.promises.readFile(fixture.pageRefs[6].htmlPath, 'utf-8')).toContain(
      'after-page-6'
    )
  })

  it('restores the whole operation when index.html is modified', async () => {
    const fixture = await createFixture(4)
    await expect(
      executeDeckEditBatchFlow({
        pageRefs: fixture.pageRefs,
        indexPath: fixture.indexPath,
        originalUserMessage: '批量修改',
        runId: 'run-3',
        appLocale: 'zh',
        launchStaggerMs: 0,
        emit: () => undefined,
        validateChangedPages: () => [],
        buildRetryMessage: () => null,
        runPageAttempt: async ({ pageId }) => {
          const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
          const pageIndex = fixture.pageRefs.findIndex((ref) => ref.pageId === pageId)
          await fs.promises.writeFile(
            page.htmlPath,
            validPageHtml(page.pageId, `after-page-${pageIndex}`),
            'utf-8'
          )
          if (pageIndex === 3) {
            await fs.promises.writeFile(fixture.indexPath, '<html>changed index</html>', 'utf-8')
          }
          return 'done'
        }
      })
    ).rejects.toBeInstanceOf(DeckEditIndexMutationError)

    expect(await fs.promises.readFile(fixture.indexPath, 'utf-8')).toBe(
      '<html><body>index</body></html>'
    )
    for (const page of fixture.pageRefs) {
      expect(await fs.promises.readFile(page.htmlPath, 'utf-8')).toContain(`before-${page.pageId}`)
    }
  })

  it('restores the whole operation when cancellation arrives after an agent attempt', async () => {
    const fixture = await createFixture(2)
    const controller = new AbortController()
    const publishedPages: string[] = []
    await expect(
      executeDeckEditBatchFlow({
        pageRefs: fixture.pageRefs,
        indexPath: fixture.indexPath,
        originalUserMessage: '批量修改',
        runId: 'run-cancelled',
        appLocale: 'zh',
        launchStaggerMs: 0,
        signal: controller.signal,
        emit: () => undefined,
        validateChangedPages: () => [],
        buildRetryMessage: () => null,
        runPageAttempt: async ({ pageId }) => {
          const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
          await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
          controller.abort()
          return 'done'
        },
        onPageCompleted: async (result) => {
          publishedPages.push(result.pageId)
        },
        onPageFailed: async (result) => {
          publishedPages.push(result.pageId)
        }
      })
    ).rejects.toThrow('生成已取消')

    expect(publishedPages).toEqual([])
    for (const page of fixture.pageRefs) {
      expect(await fs.promises.readFile(page.htmlPath, 'utf-8')).toContain(`before-${page.pageId}`)
    }
  })

  it('stagger-launches the three page requests to reduce provider 429 bursts', async () => {
    const fixture = await createFixture(3)
    const launchTimes: number[] = []
    const startedAt = Date.now()
    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-staggered',
      appLocale: 'zh',
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId }) => {
        launchTimes.push(Date.now() - startedAt)
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        return 'done'
      }
    })

    expect(results.every((result) => result.status === 'completed')).toBe(true)
    expect(launchTimes).toHaveLength(3)
    expect(launchTimes[1] - launchTimes[0]).toBeGreaterThanOrEqual(70)
    expect(launchTimes[2] - launchTimes[1]).toBeGreaterThanOrEqual(70)
  })

  it('removes abort listeners after stagger sleeps resolve', async () => {
    const fixture = await createFixture(3)
    const controller = new AbortController()
    const originalAddEventListener = controller.signal.addEventListener.bind(controller.signal)
    const originalRemoveEventListener = controller.signal.removeEventListener.bind(
      controller.signal
    )
    let abortListenerCount = 0

    controller.signal.addEventListener = ((type, listener, options) => {
      if (type === 'abort') abortListenerCount += 1
      return originalAddEventListener(type, listener, options)
    }) as AbortSignal['addEventListener']
    controller.signal.removeEventListener = ((type, listener, options) => {
      if (type === 'abort') abortListenerCount -= 1
      return originalRemoveEventListener(type, listener, options)
    }) as AbortSignal['removeEventListener']

    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-sleep-cleanup',
      appLocale: 'zh',
      signal: controller.signal,
      launchStaggerMs: 1,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId }) => {
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        return 'done'
      }
    })

    expect(results.every((result) => result.status === 'completed')).toBe(true)
    expect(abortListenerCount).toBe(0)
  })

  it('calls onPageCompleted for each completed page', async () => {
    const fixture = await createFixture(2)
    const completedPages: string[] = []
    const failedPages: string[] = []

    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-callbacks',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId }) => {
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        return 'done'
      },
      onPageCompleted: async (result) => {
        completedPages.push(result.pageId)
      },
      onPageFailed: async (result) => {
        failedPages.push(result.pageId)
      }
    })

    expect(results.every((r) => r.status === 'completed')).toBe(true)
    expect(completedPages.sort()).toEqual(['page-1', 'page-2'])
    expect(failedPages).toEqual([])
  })

  it('calls onPageFailed for each failed page', async () => {
    const fixture = await createFixture(2)
    const completedPages: string[] = []
    const failedPages: string[] = []

    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-callbacks-fail',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async () => {
        throw new Error('always fails')
      },
      onPageCompleted: async (result) => {
        completedPages.push(result.pageId)
      },
      onPageFailed: async (result) => {
        failedPages.push(result.pageId)
      }
    })

    expect(results.every((r) => r.status === 'failed')).toBe(true)
    expect(completedPages).toEqual([])
    expect(failedPages.sort()).toEqual(['page-1', 'page-2'])
  })

  it('calls both callbacks in mixed success/failure scenarios', async () => {
    const fixture = await createFixture(3)
    const completedPages: string[] = []
    const failedPages: string[] = []

    const results = await executeDeckEditBatchFlow({
      pageRefs: fixture.pageRefs,
      indexPath: fixture.indexPath,
      originalUserMessage: '批量修改',
      runId: 'run-callbacks-mixed',
      appLocale: 'zh',
      launchStaggerMs: 0,
      emit: () => undefined,
      validateChangedPages: () => [],
      buildRetryMessage: () => null,
      runPageAttempt: async ({ pageId }) => {
        const pageIndex = fixture.pageRefs.findIndex((item) => item.pageId === pageId)
        if (pageIndex === 1) throw new Error('page 2 fails')
        const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
        await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
        return 'done'
      },
      onPageCompleted: async (result) => {
        completedPages.push(result.pageId)
      },
      onPageFailed: async (result) => {
        failedPages.push(result.pageId)
      }
    })

    expect(results.filter((r) => r.status === 'completed')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'failed')).toHaveLength(1)
    expect(completedPages.sort()).toEqual(['page-1', 'page-3'])
    expect(failedPages).toEqual(['page-2'])
  })

  it('does not retry the model request when onPageCompleted persistence fails', async () => {
    const fixture = await createFixture(1)
    let attemptCount = 0
    let completedCallbackCount = 0

    await expect(
      executeDeckEditBatchFlow({
        pageRefs: fixture.pageRefs,
        indexPath: fixture.indexPath,
        originalUserMessage: '批量修改',
        runId: 'run-completed-callback-fails',
        appLocale: 'zh',
        launchStaggerMs: 0,
        emit: () => undefined,
        validateChangedPages: () => [],
        buildRetryMessage: () => 'retry model request',
        runPageAttempt: async ({ pageId }) => {
          attemptCount += 1
          const page = fixture.pageRefs.find((item) => item.pageId === pageId)!
          await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
          return 'done'
        },
        onPageCompleted: async () => {
          completedCallbackCount += 1
          throw new Error('persist failed')
        }
      })
    ).rejects.toThrow('persist failed')

    expect(attemptCount).toBe(1)
    expect(completedCallbackCount).toBe(1)
    expect(await fs.promises.readFile(fixture.pageRefs[0].htmlPath, 'utf-8')).toContain('after')
  })

  it('does not publish page callbacks when a later worker triggers global rollback', async () => {
    const fixture = await createFixture(4)
    const completedPages: string[] = []
    const failedPages: string[] = []

    await expect(
      executeDeckEditBatchFlow({
        pageRefs: fixture.pageRefs,
        indexPath: fixture.indexPath,
        originalUserMessage: '批量修改',
        runId: 'run-two-phase-rollback',
        appLocale: 'zh',
        launchStaggerMs: 0,
        emit: () => undefined,
        validateChangedPages: () => [],
        buildRetryMessage: () => null,
        runPageAttempt: async ({ pageId }) => {
          const pageIndex = fixture.pageRefs.findIndex((item) => item.pageId === pageId)
          const page = fixture.pageRefs[pageIndex]
          await fs.promises.writeFile(page.htmlPath, validPageHtml(page.pageId, 'after'), 'utf-8')
          if (pageIndex === 3) {
            await fs.promises.writeFile(fixture.indexPath, '<html>changed index</html>', 'utf-8')
          }
          return 'done'
        },
        onPageCompleted: async (result) => {
          completedPages.push(result.pageId)
        },
        onPageFailed: async (result) => {
          failedPages.push(result.pageId)
        }
      })
    ).rejects.toBeInstanceOf(DeckEditIndexMutationError)

    expect(completedPages).toEqual([])
    expect(failedPages).toEqual([])
    for (const page of fixture.pageRefs) {
      expect(await fs.promises.readFile(page.htmlPath, 'utf-8')).toContain(`before-${page.pageId}`)
    }
  })
})
