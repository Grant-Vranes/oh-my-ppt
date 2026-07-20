import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import { getSessionRunPageCounts, type IpcContext } from '../context'
import { createEmitAssistantMessage } from '../generation/generation-utils'
import { executeDeckGeneration, resolveDeckContext } from '../generation/deck-flow'
import {
  executeTemplateDeckGeneration,
  resolveTemplateDeckContext
} from '../generation/template-deck-flow'
import { executeRetryFailedPages, resolveRetryContext } from '../generation/retry-flow'
import type { DeckContext, RetryContext } from '../generation/types'
import {
  resolveAddPageContext,
  executeAddPageGeneration,
  type AddPageContext
} from '../generation/add-page-flow'
import {
  resolveRetrySinglePageContext,
  executeRetrySinglePageGeneration,
  type RetrySinglePageContext
} from '../generation/retry-single-page-flow'
import { finalizeGenerationFailure } from '../generation/finalization'
import { GenerateJobManager } from '../generation/job-manager'
import { SessionJobCoordinator } from '../edit-jobs/session-job-coordinator'
import type { DeckEditJobService } from '../edit-jobs/deck-edit-job-service'
import type { PageEditJobService } from '../edit-jobs/page-edit-job-service'
import type { StyleSwitchJobService } from '../edit-jobs/style-switch-job-service'

export function registerGenerationHandlers(
  ctx: IpcContext,
  coordinator: SessionJobCoordinator,
  styleSwitchJobs: StyleSwitchJobService,
  pageEditJobs?: PageEditJobService,
  deckEditJobs?: DeckEditJobService
): void {
  const {
    db,
    agentManager,
    sessionRunStates,
    pruneFinishedSessionRunStates,
    beginSessionRunState,
    emitGenerateChunk
  } = ctx
  const emitAssistant = createEmitAssistantMessage(db, emitGenerateChunk)
  const jobManager = new GenerateJobManager(ctx, coordinator)
  const interruptedJobsReady = jobManager
    .abortInterruptedJobs('应用退出导致生成中断，可继续生成')
    .catch((error) => {
      log.warn('[generate:job] failed to abort interrupted jobs', {
        message: error instanceof Error ? error.message : String(error)
      })
    })

  const logPreContextFailure = (operation: string, sessionId: string, error: unknown): void => {
    log.error(`[${operation}] failed before context`, {
      sessionId,
      message: error instanceof Error ? error.message : String(error)
    })
  }

  const getSessionPageStatusSnapshot = async (
    sessionId: string
  ): Promise<{ completed: number; failedKeys: string[] }> => {
    const pages = await db.listSessionPages(sessionId)
    return {
      completed: pages.filter((page) => page.status === 'completed').length,
      failedKeys: pages
        .filter((page) => page.status === 'failed')
        .map((page) => page.file_slug || page.legacy_page_id || page.id)
        .filter((pageKey) => pageKey.length > 0)
    }
  }

  ipcMain.handle('generate:state', async (_event, rawSessionId: unknown) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId.trim() : ''
    if (!sessionId) {
      throw new Error('sessionId 不能为空')
    }

    const activeState = sessionRunStates.get(sessionId)
    if (activeState) {
      const pageCounts = getSessionRunPageCounts(activeState)
      return {
        sessionId,
        runId: activeState.runId,
        status: activeState.status,
        hasActiveRun: activeState.status === 'queued' || activeState.status === 'running',
        progress: activeState.progress,
        totalPages: activeState.totalPages,
        completedPageCount: pageCounts.completedPageCount,
        failedPageCount: pageCounts.failedPageCount,
        events: activeState.events,
        error: activeState.error,
        startedAt: activeState.startedAt,
        updatedAt: activeState.updatedAt,
        kind: activeState.kind,
        targetPageId: activeState.targetPageId,
        targetPageNumber: activeState.targetPageNumber
      }
    }

    const latestJob = await db.getLatestSessionJob(sessionId, ['standard', 'template', 'retry'])
    if (latestJob) {
      const generationRun = await db.getGenerationRun(latestJob.id)
      const session = await db.getSession(sessionId)
      const sessionRecord = (session || {}) as Record<string, unknown>
      const pageCount = Number(sessionRecord.page_count ?? sessionRecord.pageCount ?? 1) || 1
      const status =
        latestJob.status === 'pending'
          ? 'queued'
          : latestJob.status === 'active'
            ? 'running'
            : latestJob.status === 'aborted'
              ? generationRun?.error && /取消|cancel/i.test(generationRun.error)
                ? 'cancelled'
                : 'failed'
              : generationRun?.status === 'completed'
                ? 'completed'
                : generationRun?.status === 'failed' || generationRun?.status === 'partial'
                  ? 'failed'
                  : 'idle'
      return {
        sessionId,
        runId: latestJob.id,
        status,
        hasActiveRun: latestJob.status === 'pending' || latestJob.status === 'active',
        progress: status === 'completed' ? 100 : 0,
        totalPages: Math.max(1, Math.floor(generationRun?.total_pages || pageCount)),
        completedPageCount: 0,
        failedPageCount: 0,
        events: [],
        error: generationRun?.error || latestJob.abort_reason || null,
        startedAt: (latestJob.activated_at || latestJob.created_at) * 1000,
        updatedAt: latestJob.updated_at * 1000,
        kind: latestJob.kind
      }
    }

    const session = await db.getSession(sessionId)
    const sessionRecord = (session || {}) as Record<string, unknown>
    const sessionStatus = String(sessionRecord.status || 'active')
    const normalizedStatus =
      sessionStatus === 'completed' ? 'completed' : sessionStatus === 'failed' ? 'failed' : 'idle'
    const pageCount = Number(sessionRecord.page_count ?? sessionRecord.pageCount ?? 1) || 1
    return {
      sessionId,
      runId: null,
      status: normalizedStatus,
      hasActiveRun: false,
      progress: normalizedStatus === 'completed' ? 100 : 0,
      totalPages: Math.max(1, Math.floor(pageCount)),
      completedPageCount: 0,
      failedPageCount: 0,
      events: [],
      error: null,
      startedAt: null,
      updatedAt: null
    }
  })

  ipcMain.handle('generate:listActive', async () => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const jobs = await db.listActiveSessionJobs(['standard', 'template', 'retry'])
    return jobs.flatMap((job) => {
      const state = sessionRunStates.get(job.session_id)
      if (state?.runId === job.id && state.status !== 'queued' && state.status !== 'running') {
        return []
      }
      return [
        {
          sessionId: job.session_id,
          runId: job.id,
          status: job.status === 'pending' ? 'queued' : 'running',
          hasActiveRun: true,
          progress: state?.progress ?? 0,
          totalPages: state?.totalPages ?? 1,
          ...(state
            ? getSessionRunPageCounts(state)
            : { completedPageCount: 0, failedPageCount: 0 }),
          events: state?.events ?? [],
          error: state?.error ?? null,
          startedAt: state?.startedAt ?? (job.activated_at || job.created_at) * 1000,
          updatedAt: state?.updatedAt ?? job.updated_at * 1000,
          kind: job.kind,
          targetPageId: state?.targetPageId,
          targetPageNumber: state?.targetPageNumber
        }
      ]
    })
  })

  ipcMain.handle('generate:start', async (event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const requestedSessionId =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { sessionId?: unknown }).sessionId === 'string'
        ? String((payload as { sessionId?: string }).sessionId).trim()
        : ''
    const reservation = requestedSessionId
      ? jobManager.reserve('generate:start', requestedSessionId)
      : null
    if (reservation?.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }
    const reserved = reservation?.alreadyRunning === false ? reservation.reservation : null

    let context: DeckContext | null = null
    let handedToBackground = false
    try {
      const requestedType =
        payload && typeof payload === 'object' && (payload as { type?: unknown }).type === 'page'
          ? 'page'
          : 'deck'
      const requestedChatType =
        payload &&
        typeof payload === 'object' &&
        (payload as { chatType?: unknown }).chatType === 'main'
          ? 'main'
          : 'page'
      if (requestedType === 'page' && requestedChatType === 'page') {
        throw new Error('单页编辑请使用 page-edit:start')
      }
      if (requestedType === 'page' && requestedChatType === 'main') {
        throw new Error('主会话编辑请使用 deck-edit:start')
      }
      context = await resolveDeckContext(ctx, event, payload)
      jobManager.assertNotCancelled(reserved)
      if (!reserved) throw new Error('生成任务 reservation 缺失')
      if (context.effectiveMode !== 'generate') {
        throw new Error('非主会话编辑不能进入通用生成队列')
      }
      const deckContext = context
      const result = await jobManager.enqueue({
        reservation: reserved,
        kind: 'standard',
        context: deckContext,
        totalPages: deckContext.totalPages,
        execute: (deckContext) => executeDeckGeneration(ctx, emitAssistant, deckContext)
      })
      handedToBackground = true
      return { success: true, runId: result.runId, queued: result.queued }
    } catch (error) {
      if (context && !handedToBackground) {
        await finalizeGenerationFailure(ctx, context, error)
      } else {
        logPreContextFailure('generate:start', requestedSessionId, error)
      }
      throw error
    } finally {
      if (!handedToBackground) {
        jobManager.release(reserved)
      }
      if (context && !handedToBackground) {
        agentManager.removeSession(context.sessionId)
      }
    }
  })

  ipcMain.handle('generate:switchStyle', async (event, payload) => {
    return styleSwitchJobs.start(event, payload)
  })

  ipcMain.handle('generate:retryStyleSwitch', async (event, payload) => {
    return styleSwitchJobs.retryFailed(event, payload)
  })

  ipcMain.handle('generate:retryDeckEdit', async (event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    if (!deckEditJobs) throw new Error('deck-edit job service is unavailable')
    return deckEditJobs.retry(event, payload)
  })

  ipcMain.handle('generate:startTemplate', async (event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const requestedSessionId =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { sessionId?: unknown }).sessionId === 'string'
        ? String((payload as { sessionId?: string }).sessionId).trim()
        : ''
    const reservation = requestedSessionId
      ? jobManager.reserve('generate:startTemplate', requestedSessionId)
      : null
    if (reservation?.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }
    const reserved = reservation?.alreadyRunning === false ? reservation.reservation : null

    let context: Awaited<ReturnType<typeof resolveTemplateDeckContext>> | null = null
    let handedToBackground = false
    try {
      context = await resolveTemplateDeckContext(ctx, event, payload)
      jobManager.assertNotCancelled(reserved)
      if (!reserved) throw new Error('生成任务 reservation 缺失')
      const templateBaseSnapshot = context.templateRetry
        ? await getSessionPageStatusSnapshot(context.sessionId)
        : { completed: 0, failedKeys: [] }
      const result = await jobManager.enqueue({
        reservation: reserved,
        kind: 'template',
        context,
        totalPages: context.totalPages,
        completedPageBaseCount: templateBaseSnapshot.completed,
        failedPageBaseKeys: templateBaseSnapshot.failedKeys,
        execute: (templateContext) =>
          executeTemplateDeckGeneration(ctx, emitAssistant, templateContext)
      })
      handedToBackground = true
      return { success: true, runId: result.runId, queued: result.queued }
    } catch (error) {
      if (context && !handedToBackground) {
        await finalizeGenerationFailure(ctx, context, error)
      } else {
        logPreContextFailure('generate:startTemplate', requestedSessionId, error)
      }
      throw error
    } finally {
      if (!handedToBackground) {
        jobManager.release(reserved)
      }
      if (context && !handedToBackground) {
        agentManager.removeSession(context.sessionId)
      }
    }
  })

  ipcMain.handle('generate:retryFailedPages', async (event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const requestedSessionId =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { sessionId?: unknown }).sessionId === 'string'
        ? String((payload as { sessionId?: string }).sessionId).trim()
        : ''
    const reservation = requestedSessionId
      ? jobManager.reserve('generate:retryFailedPages', requestedSessionId)
      : null
    if (reservation?.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }

    const reserved = reservation?.alreadyRunning === false ? reservation.reservation : null
    let context: RetryContext | null = null
    let handedToBackground = false
    try {
      context = await resolveRetryContext(ctx, event, payload)
      jobManager.assertNotCancelled(reserved)
      const retryTotalPages = Math.max(
        1,
        (await db.listLatestGenerationPageSnapshot(context.sessionId)).filter(
          (page) => page.status !== 'completed'
        ).length || context.totalPages
      )
      const retryBaseSnapshot = await getSessionPageStatusSnapshot(context.sessionId)
      jobManager.assertNotCancelled(reserved)
      if (!reserved) throw new Error('生成任务 reservation 缺失')
      const result = await jobManager.enqueue({
        reservation: reserved,
        kind: 'retry',
        context,
        totalPages: retryTotalPages,
        completedPageBaseCount: retryBaseSnapshot.completed,
        failedPageBaseKeys: retryBaseSnapshot.failedKeys,
        execute: (retryContext) => executeRetryFailedPages(ctx, emitAssistant, retryContext)
      })
      handedToBackground = true
      return { success: true, runId: result.runId, queued: result.queued }
    } catch (error) {
      if (context && !handedToBackground) {
        await finalizeGenerationFailure(ctx, context, error)
      } else {
        logPreContextFailure('generate:retryFailedPages', requestedSessionId, error)
      }
      throw error
    } finally {
      if (!handedToBackground) {
        jobManager.release(reserved)
      }
      if (context && !handedToBackground) {
        agentManager.removeSession(context.sessionId)
      }
    }
  })

  ipcMain.handle('generate:addPage', async (_event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const addPagePayload =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const requestedSessionId =
      typeof addPagePayload.sessionId === 'string' ? addPagePayload.sessionId.trim() : ''
    if (!requestedSessionId) {
      throw new Error('sessionId 不能为空')
    }
    const userMsg =
      typeof addPagePayload.userMessage === 'string' ? addPagePayload.userMessage.trim() : ''
    if (!userMsg) {
      throw new Error('userMessage is required for addPage')
    }

    const reservation = jobManager.reserve('generate:addPage', requestedSessionId)
    if (reservation.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }

    const reserved = reservation.reservation
    let addPageCtx: AddPageContext | null = null
    try {
      const insertAfter = Number(addPagePayload.insertAfterPageNumber) || 0

      // Resolve context independently — no shared resolveGenerationContext
      const modelConfigId =
        typeof addPagePayload.modelConfigId === 'string'
          ? addPagePayload.modelConfigId.trim()
          : undefined
      addPageCtx = await resolveAddPageContext(
        ctx,
        requestedSessionId,
        userMsg,
        insertAfter,
        modelConfigId
      )
      jobManager.assertNotCancelled(reserved)

      // Persist user message
      await db.addMessage(addPageCtx.sessionId, {
        role: 'user',
        content: userMsg,
        type: 'text',
        chat_scope: 'main' as const,
        run_model: addPageCtx.runModel
      })
      jobManager.assertNotCancelled(reserved)

      beginSessionRunState({
        sessionId: addPageCtx.sessionId,
        runId: addPageCtx.runId,
        mode: 'addPage',
        activityKind: 'addPage',
        previousSessionStatus: addPageCtx.previousSessionStatus,
        totalPages: 1
      })

      await executeAddPageGeneration(ctx, addPageCtx)
      return { success: true, runId: addPageCtx.runId }
    } catch (error) {
      if (addPageCtx) {
        await finalizeGenerationFailure(ctx, addPageCtx, error)
      } else {
        logPreContextFailure('generate:addPage', requestedSessionId, error)
      }
      throw error
    } finally {
      jobManager.release(reserved)
      if (addPageCtx) {
        agentManager.removeSession(addPageCtx.sessionId)
      }
    }
  })

  ipcMain.handle('generate:retrySinglePage', async (_event, payload) => {
    await interruptedJobsReady
    pruneFinishedSessionRunStates()
    const addPagePayload =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const requestedSessionId =
      typeof addPagePayload.sessionId === 'string' ? addPagePayload.sessionId.trim() : ''
    const requestedPageId =
      typeof addPagePayload.pageId === 'string' ? addPagePayload.pageId.trim() : ''
    if (!requestedSessionId) {
      throw new Error('sessionId 不能为空')
    }
    if (!requestedPageId) {
      throw new Error('pageId 不能为空')
    }

    const reservation = jobManager.reserve('generate:retrySinglePage', requestedSessionId)
    if (reservation.alreadyRunning) {
      return { success: true, runId: reservation.runId, alreadyRunning: true }
    }

    const reserved = reservation.reservation
    let retryCtx: RetrySinglePageContext | null = null
    try {
      const modelConfigId =
        typeof addPagePayload.modelConfigId === 'string'
          ? addPagePayload.modelConfigId.trim()
          : undefined
      retryCtx = await resolveRetrySinglePageContext(
        ctx,
        requestedSessionId,
        requestedPageId,
        modelConfigId
      )
      jobManager.assertNotCancelled(reserved)

      beginSessionRunState({
        sessionId: retryCtx.sessionId,
        runId: retryCtx.runId,
        mode: 'retrySinglePage',
        activityKind: 'single-page-retry',
        previousSessionStatus: retryCtx.previousSessionStatus,
        totalPages: 1
      })

      await executeRetrySinglePageGeneration(ctx, retryCtx)
      return { success: true, runId: retryCtx.runId }
    } catch (error) {
      if (retryCtx) {
        await finalizeGenerationFailure(ctx, retryCtx, error)
      } else {
        logPreContextFailure('generate:retrySinglePage', requestedSessionId, error)
      }
      throw error
    } finally {
      jobManager.release(reserved)
      if (retryCtx) {
        agentManager.removeSession(retryCtx.sessionId)
      }
    }
  })

  ipcMain.handle('generate:cancel', async (_event, sessionId) => {
    await interruptedJobsReady
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : ''
    const cancelSessionId = normalizedSessionId || String(sessionId || '')
    if (!cancelSessionId) return { success: true }
    if (await pageEditJobs?.cancel(cancelSessionId)) return { success: true }
    if (await deckEditJobs?.cancel(cancelSessionId)) return { success: true }
    const handledByJobManager = await jobManager.cancel(cancelSessionId)
    if (handledByJobManager) return { success: true }
    agentManager.cancelSession(cancelSessionId)
    const activeState = sessionRunStates.get(cancelSessionId)
    if (activeState?.status === 'queued' || activeState?.status === 'running') {
      emitGenerateChunk(cancelSessionId, {
        type: 'run_error',
        payload: {
          runId: activeState.runId,
          message: '生成已取消'
        }
      })
    }
    return { success: true }
  })
}
