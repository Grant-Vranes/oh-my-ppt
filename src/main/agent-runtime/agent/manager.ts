import log from 'electron-log/main.js'
import type { ModelRuntimeConfig } from '../model/usage'
import type { DeepAgentStreamResult } from './types'

export interface AgentSessionEntry {
  agent: DeepAgentStreamResult | null
  /** Per-page agents for concurrent generation (keyed by pageId). */
  pageAgents: Map<string, DeepAgentStreamResult>
  projectDir: string
  provider: string
  model: string
  baseUrl?: string
  temperature?: number
  modelRuntime?: ModelRuntimeConfig
}

export interface AgentSessionConfig {
  sessionId: string
  provider: string
  model: string
  baseUrl?: string
  temperature?: number
  projectDir: string
  modelRuntime?: ModelRuntimeConfig
}

export class AgentManager {
  private agents = new Map<string, AgentSessionEntry>()

  getSession(sessionId: string): AgentSessionEntry | undefined {
    return this.agents.get(sessionId)
  }

  setAgent(sessionId: string, agent: DeepAgentStreamResult): void {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.agent = agent
  }

  clearCachedAgent(sessionId: string): void {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.agent = null
  }

  /** Clear all cached agent instances without changing the job cancellation state. */
  clearCachedAgents(sessionId: string): void {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.agent = null
    entry.pageAgents.clear()
  }

  /** Store a per-page agent for concurrent generation. Does not overwrite the main agent. */
  setPageAgent(sessionId: string, pageId: string, agent: DeepAgentStreamResult): void {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.pageAgents.set(pageId, agent)
  }

  removePageAgent(sessionId: string, pageId: string): void {
    const entry = this.agents.get(sessionId)
    if (!entry) return
    entry.pageAgents.delete(pageId)
  }

  ensureSession(config: AgentSessionConfig): AgentSessionEntry {
    const existing = this.agents.get(config.sessionId)
    if (existing) {
      existing.provider = config.provider
      existing.model = config.model
      existing.baseUrl = config.baseUrl
      existing.temperature = config.temperature
      existing.projectDir = config.projectDir
      existing.modelRuntime = config.modelRuntime
      log.info('[agent] ensureSession hit existing', {
        sessionId: config.sessionId,
        provider: existing.provider,
        model: existing.model,
        baseUrl: existing.baseUrl || '',
        temperature: existing.temperature ?? null,
        projectDir: existing.projectDir
      })
      return existing
    }

    const model = config.model.trim()
    if (!model) throw new Error('恢复会话失败：model 不能为空。')
    const entry: AgentSessionEntry = {
      agent: null,
      pageAgents: new Map<string, DeepAgentStreamResult>(),
      projectDir: config.projectDir,
      provider: config.provider,
      model,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      modelRuntime: config.modelRuntime
    }

    log.info('[agent] ensureSession create entry', {
      sessionId: config.sessionId,
      provider: entry.provider,
      model,
      baseUrl: entry.baseUrl || '',
      temperature: entry.temperature ?? null,
      projectDir: entry.projectDir
    })

    this.agents.set(config.sessionId, entry)
    return entry
  }

  removeSession(sessionId: string): void {
    const entry = this.agents.get(sessionId)
    if (entry) {
      entry.agent = null
      entry.pageAgents.clear()
    }
    this.agents.delete(sessionId)
    log.info('[agent] removeSession', { sessionId })
  }
}
