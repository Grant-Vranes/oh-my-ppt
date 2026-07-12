import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import {
  listMergeSourcePages,
  listMergeSourceSessions,
  listMergeSourceTemplatePages,
  listMergeSourceTemplates,
  mergeSessionPages
} from './page-merge-service'
import { PageMergeError, type PageMergeErrorCode } from '../../../shared/page-merge'

const readString = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === 'string' ? record[key].trim() : ''

const runPageMergeRequest = async <T>(
  channel: string,
  context: Record<string, unknown>,
  task: () => Promise<T>
): Promise<T> => {
  const startedAt = Date.now()
  log.info('[page-merge:ipc]', { channel, stage: 'start', ...context })
  try {
    const result = await task()
    log.info('[page-merge:ipc]', {
      channel,
      stage: 'completed',
      durationMs: Date.now() - startedAt,
      ...context
    })
    return result
  } catch (error) {
    const code: PageMergeErrorCode =
      error instanceof PageMergeError ? error.code : 'PAGE_MERGE_INTERNAL_ERROR'
    log.warn('[page-merge:ipc]', {
      channel,
      stage: 'failed',
      code,
      durationMs: Date.now() - startedAt,
      ...context,
      error: error instanceof Error ? error.message : String(error)
    })
    throw new Error(code)
  }
}

export function registerPageMergeHandlers(ctx: IpcContext): void {
  ipcMain.handle('session:listMergeSources', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const targetSessionId = readString(record, 'targetSessionId')
    if (!targetSessionId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
    return runPageMergeRequest('session:listMergeSources', { targetSessionId }, () =>
      listMergeSourceSessions(ctx, targetSessionId)
    )
  })

  ipcMain.handle('session:listMergeSourceTemplates', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const targetSessionId = readString(record, 'targetSessionId')
    if (!targetSessionId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
    return runPageMergeRequest('session:listMergeSourceTemplates', { targetSessionId }, () =>
      listMergeSourceTemplates(ctx, targetSessionId)
    )
  })

  ipcMain.handle('session:listMergeSourcePages', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const targetSessionId = readString(record, 'targetSessionId')
    const sourceType = readString(record, 'sourceType') || 'session'
    if (!targetSessionId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
    if (sourceType === 'template') {
      const templateId = readString(record, 'templateId')
      if (!templateId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
      return runPageMergeRequest(
        'session:listMergeSourcePages',
        { targetSessionId, sourceType, templateId },
        () => listMergeSourceTemplatePages(ctx, targetSessionId, templateId)
      )
    }
    const sourceSessionId = readString(record, 'sourceSessionId')
    if (!sourceSessionId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
    if (targetSessionId === sourceSessionId) throw new Error('PAGE_MERGE_SAME_SESSION')
    return runPageMergeRequest(
      'session:listMergeSourcePages',
      { targetSessionId, sourceSessionId },
      () => listMergeSourcePages(ctx, sourceSessionId)
    )
  })

  ipcMain.handle('session:mergePages', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const targetSessionId = readString(record, 'targetSessionId')
    const sourceType = readString(record, 'sourceType') || 'session'
    const sourcePageIds = record.sourcePageIds
    if (
      !targetSessionId ||
      !Array.isArray(sourcePageIds) ||
      sourcePageIds.some((item) => typeof item !== 'string')
    ) {
      throw new Error('PAGE_MERGE_INVALID_REQUEST')
    }
    const selectedPageCount = sourcePageIds.length
    if (sourceType === 'template') {
      const sourceTemplateId = readString(record, 'templateId')
      if (!sourceTemplateId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
      return runPageMergeRequest(
        'session:mergePages',
        { targetSessionId, sourceType, sourceTemplateId, selectedPageCount },
        async () => {
          const result = await mergeSessionPages(ctx, {
            targetSessionId,
            sourceType: 'template',
            sourceTemplateId,
            sourcePageIds: sourcePageIds as string[]
          })
          return { ok: true, ...result }
        }
      )
    }
    const sourceSessionId = readString(record, 'sourceSessionId')
    if (!sourceSessionId) throw new Error('PAGE_MERGE_INVALID_REQUEST')
    return runPageMergeRequest(
      'session:mergePages',
      { targetSessionId, sourceType, sourceSessionId, selectedPageCount },
      async () => {
        const result = await mergeSessionPages(ctx, {
          targetSessionId,
          sourceType: 'session',
          sourceSessionId,
          sourcePageIds: sourcePageIds as string[]
        })
        return { ok: true, ...result }
      }
    )
  })
}
