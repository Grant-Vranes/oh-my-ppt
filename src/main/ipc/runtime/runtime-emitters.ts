import type { BrowserWindow } from 'electron'
import log from 'electron-log/main.js'
import type { GenerateChunkEvent } from '@shared/generation'
import { progressDisplayLabel, type AppLocale } from '@shared/progress'
import { TypedEventBus, type RuntimeDomain } from '../../agent-runtime'
import { isCancellationMessage } from '../../generation/status-utils'
import {
  revealGenerationWindow,
  shouldRevealGenerationWindow
} from '../../generation/generation-window-policy'
import {
  getSessionRunPageCounts,
  runtimeDomainForSessionRun,
  type SessionRunState,
  type SessionRunStateStore
} from './session-run-state'

export type RuntimeJobStartedArgs = {
  sessionId: string
  jobId: string
  domain?: RuntimeDomain
}

export type RuntimeJobTerminalArgs = {
  sessionId: string
  jobId: string
  domain?: RuntimeDomain
  status: 'completed' | 'failed' | 'cancelled'
  errorCode?: string
  errorMessage?: string
  cancellationReason?: 'user' | 'timeout' | 'shutdown'
}

export type LlmStatusEmissionSnapshot = {
  stage: string
  label: string
  detail: string
  progress: number | null
  emittedAt: number
}

export type RuntimeEmitters = {
  emitSessionRunLifecycle(state: SessionRunState): void
  emitGenerateChunk(sessionId: string, chunk: GenerateChunkEvent): void
  emitRuntimeJobStarted(args: RuntimeJobStartedArgs): void
  emitRuntimeJobTerminal(args: RuntimeJobTerminalArgs): void
  createDeckProgressEmitter(
    sessionId: string,
    appLocale?: AppLocale
  ): (chunk: GenerateChunkEvent) => void
}

const LLM_STATUS_MIN_PROGRESS_DELTA = 5

export function getDeckProgressStageBounds(stage: string): { min: number; max: number } {
  if (stage === 'preflight' || stage === 'planning') return { min: 0, max: 10 }
  if (stage === 'rendering') return { min: 10, max: 90 }
  if (stage === 'finalizing') return { min: 80, max: 100 }
  return { min: 0, max: 90 }
}

export function shouldEmitLlmStatusUpdate(
  previous: LlmStatusEmissionSnapshot | null,
  next: Omit<LlmStatusEmissionSnapshot, 'emittedAt'>,
  now: number
): boolean {
  if (!previous) return true
  if (
    previous.stage !== next.stage ||
    previous.label !== next.label ||
    previous.detail !== next.detail
  ) {
    return true
  }
  if (
    next.progress !== null &&
    (previous.progress === null || next.progress - previous.progress >= LLM_STATUS_MIN_PROGRESS_DELTA)
  ) {
    return true
  }
  void now
  return false
}

const summarizeGenerateChunk = (chunk: GenerateChunkEvent): Record<string, unknown> => {
  switch (chunk.type) {
    case 'stage_started':
    case 'stage_progress':
      return {
        type: chunk.type,
        stage: chunk.payload.stage,
        label: chunk.payload.label,
        progress: chunk.payload.progress ?? null,
        totalPages: chunk.payload.totalPages ?? null
      }
    case 'llm_status':
      return {
        type: chunk.type,
        stage: chunk.payload.stage,
        label: chunk.payload.label,
        detail: chunk.payload.detail ?? null,
        progress: chunk.payload.progress ?? null,
        totalPages: chunk.payload.totalPages ?? null,
        provider: chunk.payload.provider ?? null,
        model: chunk.payload.model ?? null
      }
    case 'page_generated':
    case 'page_updated':
      return {
        type: chunk.type,
        stage: chunk.payload.stage,
        pageNumber: chunk.payload.pageNumber,
        pageId: chunk.payload.pageId,
        title: chunk.payload.title,
        progress: chunk.payload.progress ?? null,
        htmlPath: chunk.payload.htmlPath ?? null
      }
    case 'page_planned':
    case 'page_started':
    case 'page_failed':
      return {
        type: chunk.type,
        stage: chunk.payload.stage,
        pageNumber: chunk.payload.pageNumber,
        pageId: chunk.payload.pageId,
        title: chunk.payload.title,
        progress: chunk.payload.progress ?? null,
        error: chunk.payload.error ?? null
      }
    case 'run_completed':
      return {
        type: chunk.type,
        totalPages: chunk.payload.totalPages,
        completedPageCount: chunk.payload.completedPageCount ?? null,
        failedPageCount: chunk.payload.failedPageCount ?? null,
        activityKind: chunk.payload.activityKind ?? null
      }
    case 'run_error':
      return {
        type: chunk.type,
        message: chunk.payload.message,
        activityKind: chunk.payload.activityKind ?? null
      }
    default:
      return { type: chunk.type }
  }
}

export function createRuntimeEmitters(args: {
  mainWindow: BrowserWindow
  runtimeEvents: TypedEventBus
  sessionRuns: SessionRunStateStore
}): RuntimeEmitters {
  const { mainWindow, runtimeEvents, sessionRuns } = args

  const emitSessionRunLifecycle = (state: SessionRunState): void => {
    runtimeEvents.emit({
      type: state.status === 'queued' ? 'job.queued' : 'job.started',
      payload: {},
      jobId: state.runId,
      domain: runtimeDomainForSessionRun(state),
      owner: { sessionId: state.sessionId },
      audience: { kind: 'broadcast' },
      occurredAt: state.startedAt
    })
  }

  const emitGenerateChunk = (sessionId: string, chunk: GenerateChunkEvent): void => {
    let enrichedChunk = {
      ...chunk,
      payload: {
        ...chunk.payload,
        sessionId,
        timestamp: new Date().toISOString()
      }
    } as GenerateChunkEvent
    if (enrichedChunk.type === 'run_error') {
      enrichedChunk = {
        ...enrichedChunk,
        payload: {
          ...enrichedChunk.payload,
          cancelled:
            enrichedChunk.payload.cancelled ??
            isCancellationMessage(enrichedChunk.payload.message || '')
        }
      }
    }

    sessionRuns.trackSessionRunChunk(sessionId, enrichedChunk)
    const state = sessionRuns.sessionRunStates.get(sessionId)
    if (state?.runId === enrichedChunk.payload.runId) {
      const pageCounts = getSessionRunPageCounts(state)
      enrichedChunk = {
        ...enrichedChunk,
        payload: {
          ...enrichedChunk.payload,
          activityKind: state.activityKind,
          completedPageCount: pageCounts.completedPageCount,
          failedPageCount: pageCounts.failedPageCount
        }
      } as GenerateChunkEvent
    }

    if (
      enrichedChunk.type === 'stage_started' ||
      enrichedChunk.type === 'stage_progress' ||
      enrichedChunk.type === 'llm_status' ||
      enrichedChunk.type === 'page_planned' ||
      enrichedChunk.type === 'page_started' ||
      enrichedChunk.type === 'page_generated' ||
      enrichedChunk.type === 'page_updated' ||
      enrichedChunk.type === 'page_failed' ||
      enrichedChunk.type === 'run_completed' ||
      enrichedChunk.type === 'run_error'
    ) {
      log.info('[generate:chunk] emit', summarizeGenerateChunk(enrichedChunk))
    }

    if (shouldRevealGenerationWindow(enrichedChunk, state)) {
      revealGenerationWindow(mainWindow)
    }

    runtimeEvents.emit({
      type: 'generation.chunk',
      payload: enrichedChunk,
      jobId: enrichedChunk.payload.runId,
      domain: runtimeDomainForSessionRun(state),
      owner: { sessionId },
      audience: { kind: 'broadcast' },
      occurredAt: Date.now()
    })
  }

  const emitRuntimeJobTerminal = (event: RuntimeJobTerminalArgs): void => {
    const domain =
      event.domain || runtimeDomainForSessionRun(sessionRuns.sessionRunStates.get(event.sessionId))
    runtimeEvents.emit({
      type:
        event.status === 'completed'
          ? 'job.completed'
          : event.status === 'cancelled'
            ? 'job.cancelled'
            : 'job.failed',
      payload:
        event.status === 'completed'
          ? {}
          : event.status === 'cancelled'
            ? { reason: event.cancellationReason || 'user' }
            : {
                errorCode: event.errorCode || 'generation_failed',
                errorMessage: event.errorMessage || 'Generation failed'
              },
      jobId: event.jobId,
      domain,
      owner: { sessionId: event.sessionId },
      audience: { kind: 'broadcast' },
      occurredAt: Date.now()
    })
  }

  const emitRuntimeJobStarted = (event: RuntimeJobStartedArgs): void => {
    runtimeEvents.emit({
      type: 'job.started',
      payload: {},
      jobId: event.jobId,
      domain:
        event.domain || runtimeDomainForSessionRun(sessionRuns.sessionRunStates.get(event.sessionId)),
      owner: { sessionId: event.sessionId },
      audience: { kind: 'broadcast' },
      occurredAt: Date.now()
    })
  }

  const createDeckProgressEmitter = (
    sessionId: string,
    appLocale?: AppLocale
  ): ((chunk: GenerateChunkEvent) => void) => {
    let normalizedProgress = 0
    let lastLlmStatusEmission: LlmStatusEmissionSnapshot | null = null

    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, Math.round(value)))

    return (chunk: GenerateChunkEvent): void => {
      if (chunk.type === 'run_completed') {
        normalizedProgress = 100
        emitGenerateChunk(sessionId, chunk)
        return
      }

      if (
        chunk.type !== 'stage_started' &&
        chunk.type !== 'stage_progress' &&
        chunk.type !== 'llm_status' &&
        chunk.type !== 'page_started' &&
        chunk.type !== 'page_generated' &&
        chunk.type !== 'page_updated' &&
        chunk.type !== 'page_failed'
      ) {
        emitGenerateChunk(sessionId, chunk)
        return
      }

      const { min, max } = getDeckProgressStageBounds(chunk.payload.stage)
      const rawProgress =
        typeof chunk.payload.progress === 'number' && Number.isFinite(chunk.payload.progress)
          ? chunk.payload.progress
          : normalizedProgress
      const bounded = clamp(rawProgress, min, max)
      normalizedProgress = Math.max(normalizedProgress, bounded)

      const normalizedChunk = {
        ...chunk,
        payload: {
          ...chunk.payload,
          label: progressDisplayLabel(appLocale, chunk.payload.label),
          progress: normalizedProgress
        }
      } as GenerateChunkEvent

      if (normalizedChunk.type === 'llm_status') {
        const now = Date.now()
        const next = {
          stage: normalizedChunk.payload.stage,
          label: normalizedChunk.payload.label,
          detail: normalizedChunk.payload.detail || '',
          progress:
            typeof normalizedChunk.payload.progress === 'number'
              ? normalizedChunk.payload.progress
              : null
        }
        if (!shouldEmitLlmStatusUpdate(lastLlmStatusEmission, next, now)) return
        lastLlmStatusEmission = { ...next, emittedAt: now }
      }

      emitGenerateChunk(sessionId, normalizedChunk)
    }
  }

  return {
    emitSessionRunLifecycle,
    emitGenerateChunk,
    emitRuntimeJobStarted,
    emitRuntimeJobTerminal,
    createDeckProgressEmitter
  }
}
