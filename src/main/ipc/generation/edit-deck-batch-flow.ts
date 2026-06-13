import fs from 'fs'
import pLimit from 'p-limit'
import type { GenerateChunkEvent } from '@shared/generation'
import type { EditedPageDescriptor, InvalidEditedPage } from './generation-utils'
import { isCancellationMessage } from './status-utils'

export const BATCH_EDIT_CHUNK_SIZE = 3
export const BATCH_EDIT_LAUNCH_STAGGER_MS = 100

export type DeckEditBatchPageRef = {
  id: string
  pageNumber: number
  title: string
  pageId: string
  htmlPath: string
}

type FileSnapshot = {
  exists: boolean
  content: string
}

type DeckEditBatchSnapshot = {
  indexPath: string
  indexFile: FileSnapshot
  pages: Map<string, FileSnapshot>
}

export type DeckEditCompletedBatch = {
  status: 'completed'
  pageId: string
  changedPages: EditedPageDescriptor[]
  summary: string
  retryCount: number
}

export type DeckEditFailedBatch = {
  status: 'failed'
  pageId: string
  reason: string
  retryCount: number
}

export type DeckEditBatchResult = DeckEditCompletedBatch | DeckEditFailedBatch

export class DeckEditIndexMutationError extends Error {
  constructor() {
    super('主会话 deck 编辑不允许修改 index.html，本次检测到壳层变更并已恢复。')
    this.name = 'DeckEditIndexMutationError'
  }
}

class DeckEditNoChangeError extends Error {
  constructor() {
    super('当前页面编辑没有检测到落盘变化。')
    this.name = 'DeckEditNoChangeError'
  }
}

class DeckEditPageValidationError extends Error {
  constructor(readonly invalidPages: InvalidEditedPage[]) {
    super(
      invalidPages
        .map((item) => `${item.page.pageId}（${item.page.title}）：${item.reason}`)
        .join('；')
    )
    this.name = 'DeckEditPageValidationError'
  }
}

type RunPageAttemptArgs = {
  pageId: string
  pageNumber: number
  userMessage: string
  isRetry: boolean
  emit: (chunk: GenerateChunkEvent) => void
}

export type ExecuteDeckEditBatchFlowArgs = {
  pageRefs: DeckEditBatchPageRef[]
  indexPath: string
  originalUserMessage: string
  runId: string
  appLocale: 'zh' | 'en'
  signal?: AbortSignal
  launchStaggerMs?: number
  emit: (chunk: GenerateChunkEvent) => void
  runPageAttempt: (args: RunPageAttemptArgs) => Promise<string>
  validateChangedPages: (pages: EditedPageDescriptor[]) => InvalidEditedPage[]
  buildRetryMessage: (args: {
    baseMessage: string
    error: unknown
    kind: 'no_change' | 'validation' | 'agent'
  }) => string | null
  onPageCompleted?: (result: DeckEditCompletedBatch) => Promise<void>
  onPageFailed?: (result: DeckEditFailedBatch) => Promise<void>
}

export function buildDeckEditPageUserMessage(args: {
  originalUserMessage: string
  pageId: string
}): string {
  return [
    args.originalUserMessage,
    '',
    'Page edit context:',
    `- Edit ONLY this page: ${args.pageId}.`,
    '- You may read other pages for visual reference, but you must not write them.'
  ].join('\n')
}

const readFileSnapshot = async (filePath: string): Promise<FileSnapshot> => {
  if (!fs.existsSync(filePath)) return { exists: false, content: '' }
  return {
    exists: true,
    content: await fs.promises.readFile(filePath, 'utf-8')
  }
}

const captureSnapshot = async (
  pageRefs: DeckEditBatchPageRef[],
  indexPath: string
): Promise<DeckEditBatchSnapshot> => {
  const pages = new Map<string, FileSnapshot>()
  const pageSnapshots = await Promise.all(
    pageRefs.map(async (page) => ({
      pageId: page.pageId,
      file: await readFileSnapshot(page.htmlPath)
    }))
  )
  for (const page of pageSnapshots) pages.set(page.pageId, page.file)
  return {
    indexPath,
    indexFile: await readFileSnapshot(indexPath),
    pages
  }
}

const restoreFileSnapshot = async (filePath: string, snapshot: FileSnapshot): Promise<void> => {
  if (snapshot.exists) {
    await fs.promises.writeFile(filePath, snapshot.content, 'utf-8')
    return
  }
  await fs.promises.rm(filePath, { force: true })
}

const restoreSnapshot = async (
  snapshot: DeckEditBatchSnapshot,
  pageRefs: DeckEditBatchPageRef[]
): Promise<void> => {
  await Promise.all(
    pageRefs.map((page) =>
      restoreFileSnapshot(
        page.htmlPath,
        snapshot.pages.get(page.pageId) || { exists: false, content: '' }
      )
    )
  )
  await restoreFileSnapshot(snapshot.indexPath, snapshot.indexFile)
}

const restorePageSnapshots = async (
  snapshot: DeckEditBatchSnapshot,
  pageRefs: DeckEditBatchPageRef[]
): Promise<void> => {
  await Promise.all(
    pageRefs.map((page) =>
      restoreFileSnapshot(
        page.htmlPath,
        snapshot.pages.get(page.pageId) || { exists: false, content: '' }
      )
    )
  )
}

const hasIndexChanged = async (snapshot: DeckEditBatchSnapshot): Promise<boolean> => {
  const current = await readFileSnapshot(snapshot.indexPath)
  return (
    current.exists !== snapshot.indexFile.exists || current.content !== snapshot.indexFile.content
  )
}

const readChangedPages = async (
  snapshot: DeckEditBatchSnapshot,
  pageRefs: DeckEditBatchPageRef[]
): Promise<EditedPageDescriptor[]> => {
  const changedPages: EditedPageDescriptor[] = []
  for (const page of pageRefs) {
    if (!fs.existsSync(page.htmlPath)) continue
    const html = await fs.promises.readFile(page.htmlPath, 'utf-8')
    const before = snapshot.pages.get(page.pageId)
    if (before?.exists && before.content === html) continue
    changedPages.push({ ...page, html })
  }
  return changedPages
}

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.length > 0 ? error.message : String(error || '未知错误')

const isCancellationError = (error: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) || isCancellationMessage(errorMessage(error))

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('生成已取消'))
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = (): void => {
      cleanup()
      reject(new Error('生成已取消'))
    }
    const cleanup = (): void => {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

const computeGlobalProgress = (totalPages: number, pageProgress: Map<string, number>): number => {
  const total = Math.max(1, totalPages)
  let sum = 0
  for (const progress of pageProgress.values()) {
    sum += Math.max(0, Math.min(100, progress))
  }
  return Math.round(10 + (sum / total) * 0.8)
}

const remapChunk = (
  chunk: GenerateChunkEvent,
  args: {
    totalPages: number
    pageNumber: number
    pageId: string
    appLocale?: 'zh' | 'en'
    pageProgress: Map<string, number>
    lastProgress: { value: number }
  }
): GenerateChunkEvent => {
  if (!('progress' in chunk.payload) || typeof chunk.payload.progress !== 'number') return chunk
  const previousPageProgress = args.pageProgress.get(args.pageId) || 0
  args.pageProgress.set(args.pageId, Math.max(previousPageProgress, chunk.payload.progress))
  const progress = Math.max(
    args.lastProgress.value,
    computeGlobalProgress(args.totalPages, args.pageProgress)
  )
  args.lastProgress.value = progress
  return {
    ...chunk,
    payload: {
      ...chunk.payload,
      label:
        chunk.type === 'llm_status' &&
        /理解|分析|规划|准备|启动|生成|编辑|完成|understand|analyz|plan|prepar|start|generat|edit|complet/i.test(
          chunk.payload.label
        )
          ? args.appLocale === 'en'
            ? `Editing P${args.pageNumber}`
            : `正在编辑 P${args.pageNumber}`
          : chunk.payload.label,
      progress,
      currentPage: args.pageNumber,
      totalPages: args.totalPages
    }
  } as GenerateChunkEvent
}

export async function executeDeckEditBatchFlow(
  args: ExecuteDeckEditBatchFlowArgs
): Promise<DeckEditBatchResult[]> {
  const totalPages = args.pageRefs.length
  const launchStaggerMs = Math.max(
    0,
    Math.floor(args.launchStaggerMs ?? BATCH_EDIT_LAUNCH_STAGGER_MS)
  )
  const operationSnapshot = await captureSnapshot(args.pageRefs, args.indexPath)
  const results: DeckEditBatchResult[] = []
  const lastProgress = { value: 10 }
  const pageProgress = new Map<string, number>()
  const limit = pLimit(BATCH_EDIT_CHUNK_SIZE)
  let fatalError: unknown = null

  const runPageWorker = async (
    page: DeckEditBatchPageRef,
    pageIndex: number
  ): Promise<DeckEditBatchResult> => {
    if (fatalError) throw fatalError
    if (args.signal?.aborted) throw new Error('生成已取消')
    const queueStaggerIndex = pageIndex % BATCH_EDIT_CHUNK_SIZE
    const pageSnapshot: DeckEditBatchSnapshot = {
      indexPath: operationSnapshot.indexPath,
      indexFile: operationSnapshot.indexFile,
      pages: new Map([
        [page.pageId, operationSnapshot.pages.get(page.pageId) || { exists: false, content: '' }]
      ])
    }
    const baseMessage = buildDeckEditPageUserMessage({
      originalUserMessage: args.originalUserMessage,
      pageId: page.pageId
    })
    let attemptMessage = baseMessage
    let retryUsed = false

    if (queueStaggerIndex > 0 && launchStaggerMs > 0) {
      await sleep(queueStaggerIndex * launchStaggerMs, args.signal)
    }

    while (true) {
      if (fatalError) throw fatalError
      try {
        const summary = await args.runPageAttempt({
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          userMessage: attemptMessage,
          isRetry: retryUsed,
          emit: (chunk) =>
            args.emit(
              remapChunk(chunk, {
                totalPages,
                pageNumber: page.pageNumber,
                pageId: page.pageId,
                appLocale: args.appLocale,
                pageProgress,
                lastProgress
              })
            )
        })
        if (args.signal?.aborted) throw new Error('生成已取消')
        if (await hasIndexChanged(operationSnapshot)) throw new DeckEditIndexMutationError()
        const changedPages = await readChangedPages(pageSnapshot, [page])
        if (changedPages.length === 0) throw new DeckEditNoChangeError()
        const invalidPages = args.validateChangedPages(changedPages)
        if (invalidPages.length > 0) throw new DeckEditPageValidationError(invalidPages)
        pageProgress.set(page.pageId, 100)
        return {
          status: 'completed',
          pageId: page.pageId,
          changedPages,
          summary,
          retryCount: retryUsed ? 1 : 0
        }
      } catch (error) {
        if (
          isCancellationError(error, args.signal) ||
          error instanceof DeckEditIndexMutationError
        ) {
          fatalError = error
          throw error
        }
        if (await hasIndexChanged(operationSnapshot)) {
          const indexMutationError = new DeckEditIndexMutationError()
          fatalError = indexMutationError
          throw indexMutationError
        }
        await restorePageSnapshots(pageSnapshot, [page])
        const retryMessage = !retryUsed
          ? args.buildRetryMessage({
              baseMessage,
              error,
              kind:
                error instanceof DeckEditNoChangeError
                  ? 'no_change'
                  : error instanceof DeckEditPageValidationError
                    ? 'validation'
                    : 'agent'
            })
          : null
        if (retryMessage) {
          retryUsed = true
          attemptMessage = retryMessage
          if (launchStaggerMs > 0) {
            await sleep((queueStaggerIndex + 1) * launchStaggerMs, args.signal)
          }
          continue
        }
        const failResult: DeckEditFailedBatch = {
          status: 'failed',
          pageId: page.pageId,
          reason: errorMessage(error),
          retryCount: retryUsed ? 1 : 0
        }
        return failResult
      }
    }
  }

  try {
    const settled = await Promise.allSettled(
      args.pageRefs.map((page, pageIndex) => limit(() => runPageWorker(page, pageIndex)))
    )
    const rejected = settled.find((item) => item.status === 'rejected')
    if (rejected?.status === 'rejected') throw rejected.reason
    if (await hasIndexChanged(operationSnapshot)) throw new DeckEditIndexMutationError()

    for (const item of settled) {
      results.push((item as PromiseFulfilledResult<DeckEditBatchResult>).value)
    }
  } catch (error) {
    await restoreSnapshot(operationSnapshot, args.pageRefs)
    throw error
  }

  // Publish only after every worker has settled and the final global invariant check passed.
  // Callback failures are persistence failures: do not roll back generated files or retry the model.
  for (const result of results) {
    if (result.status === 'completed') {
      await args.onPageCompleted?.(result)
    } else {
      await args.onPageFailed?.(result)
    }
  }

  return results
}
