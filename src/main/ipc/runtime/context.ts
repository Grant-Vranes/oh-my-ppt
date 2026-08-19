import type { BrowserWindow } from 'electron'
import type { GenerateChunkEvent } from '@shared/generation'
import type { AppLocale } from '@shared/progress'
import type { PPTDatabase } from '../../db/database'
import type { AgentManager } from '../../agent-runtime/agent'
import type { LoggerService } from '../../logging/logger-service'
import { TypedEventBus, type RuntimeDomain } from '../../agent-runtime'
import type { ModelRuntimeConfig } from '../../agent-runtime/model'
import { createRuntimeCredentials, type RuntimeCredentials } from './credentials'
import { createRuntimeLocalFiles, type RuntimeLocalFiles } from './local-files'
import { createPageExport, type PageExport, type SessionPageFile } from './page-export'
import {
  createRuntimeEmitters,
  getDeckProgressStageBounds,
  shouldEmitLlmStatusUpdate,
  type LlmStatusEmissionSnapshot,
  type RuntimeEmitters
} from './runtime-emitters'
import {
  createSessionProjectResolver,
  type SessionGenerationSnapshot,
  type SessionProjectResolver
} from './session-project'
import { createSessionScaffold, type SessionScaffold } from './session-scaffold'
import {
  createSessionRunStateStore,
  getSessionRunPageCounts,
  type BeginSessionRunStateArgs,
  type SessionRunState,
  type SessionRunStateStore
} from './session-run-state'

export {
  getDeckProgressStageBounds,
  getSessionRunPageCounts,
  shouldEmitLlmStatusUpdate
}
export type {
  BeginSessionRunStateArgs,
  LlmStatusEmissionSnapshot,
  SessionGenerationSnapshot,
  SessionPageFile,
  SessionRunState
}

/**
 * Compatibility facade for existing handlers. Its members are assembled from
 * focused runtime capabilities; new domains should depend on their narrow
 * capability rather than growing this interface.
 */
export interface IpcContext
  extends SessionProjectResolver,
    RuntimeLocalFiles,
    RuntimeCredentials,
    SessionScaffold,
    PageExport {
  mainWindow: BrowserWindow
  db: PPTDatabase
  logger: LoggerService
  agentManager: AgentManager
  modelRuntime: ModelRuntimeConfig
  sessionRuns: SessionRunStateStore
  runtimeEmitters: RuntimeEmitters
  sessionProject: SessionProjectResolver
  localFiles: RuntimeLocalFiles
  credentials: RuntimeCredentials
  sessionScaffold: SessionScaffold
  sessionRunStates: Map<string, SessionRunState>
  pruneFinishedSessionRunStates(now?: number): void
  beginSessionRunState(args: BeginSessionRunStateArgs): void
  trackSessionRunChunk(sessionId: string, chunk: GenerateChunkEvent): void
  emitGenerateChunk(sessionId: string, chunk: GenerateChunkEvent): void
  emitRuntimeJobStarted(args: {
    sessionId: string
    jobId: string
    domain?: RuntimeDomain
  }): void
  emitRuntimeJobTerminal(args: {
    sessionId: string
    jobId: string
    domain?: RuntimeDomain
    status: 'completed' | 'failed' | 'cancelled'
    errorCode?: string
    errorMessage?: string
    cancellationReason?: 'user' | 'timeout' | 'shutdown'
  }): void
  createDeckProgressEmitter(
    sessionId: string,
    appLocale?: AppLocale
  ): (chunk: GenerateChunkEvent) => void
  PLANNER_TEMPERATURE: number
  DESIGN_CONTRACT_TEMPERATURE: number
  PAGE_GENERATION_TEMPERATURE: number
  PAGE_EDIT_WITH_SELECTOR_TEMPERATURE: number
  PAGE_EDIT_DEFAULT_TEMPERATURE: number
}

const PLANNER_TEMPERATURE = 0.1
const DESIGN_CONTRACT_TEMPERATURE = 0.25
const PAGE_GENERATION_TEMPERATURE = 0.65
const PAGE_EDIT_WITH_SELECTOR_TEMPERATURE = 0.15
const PAGE_EDIT_DEFAULT_TEMPERATURE = 0.45

export function createIpcContext(
  mainWindow: BrowserWindow,
  db: PPTDatabase,
  agentManager: AgentManager,
  runtimeEvents = new TypedEventBus(),
  modelRuntime: ModelRuntimeConfig = { recorder: null },
  logger: LoggerService
): IpcContext {
  const sessionProject = createSessionProjectResolver({ db })
  const localFiles = createRuntimeLocalFiles({ db, sessionProject })
  const sessionRuns = createSessionRunStateStore()
  const runtimeEmitters = createRuntimeEmitters({ mainWindow, runtimeEvents, sessionRuns })
  const credentials = createRuntimeCredentials()
  const scaffold = createSessionScaffold()
  const pageExport = createPageExport({ db, localFiles, sessionProject })

  const beginSessionRunState = (args: BeginSessionRunStateArgs): void => {
    const state = sessionRuns.beginSessionRunState(args)
    runtimeEmitters.emitSessionRunLifecycle(state)
  }

  return {
    mainWindow,
    db,
    logger,
    agentManager,
    modelRuntime,
    sessionRuns,
    runtimeEmitters,
    sessionProject,
    localFiles,
    credentials,
    sessionScaffold: scaffold,
    ...sessionProject,
    ...localFiles,
    ...credentials,
    ...scaffold,
    ...pageExport,
    sessionRunStates: sessionRuns.sessionRunStates,
    pruneFinishedSessionRunStates: sessionRuns.pruneFinishedSessionRunStates,
    beginSessionRunState,
    trackSessionRunChunk: sessionRuns.trackSessionRunChunk,
    emitGenerateChunk: runtimeEmitters.emitGenerateChunk,
    emitRuntimeJobStarted: runtimeEmitters.emitRuntimeJobStarted,
    emitRuntimeJobTerminal: runtimeEmitters.emitRuntimeJobTerminal,
    createDeckProgressEmitter: runtimeEmitters.createDeckProgressEmitter,
    PLANNER_TEMPERATURE,
    DESIGN_CONTRACT_TEMPERATURE,
    PAGE_GENERATION_TEMPERATURE,
    PAGE_EDIT_WITH_SELECTOR_TEMPERATURE,
    PAGE_EDIT_DEFAULT_TEMPERATURE
  }
}
