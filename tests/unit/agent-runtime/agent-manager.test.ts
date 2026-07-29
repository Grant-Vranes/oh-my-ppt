import { describe, expect, it, vi } from 'vitest'

const logMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({ default: logMocks }))

import { AgentManager } from '../../../src/main/agent-runtime/agent/manager'

describe('AgentManager', () => {
  it('keeps session and agent cache ownership without owning run cancellation', () => {
    const manager = new AgentManager()
    const entry = manager.ensureSession({
      sessionId: 'session-1',
      provider: 'openai',
      model: 'gpt-test',
      projectDir: '/tmp/session-1'
    })
    const pageAgent = { stream: vi.fn() }

    manager.setPageAgent('session-1', 'page-1', pageAgent)
    expect(entry.pageAgents.get('page-1')).toBe(pageAgent)

    manager.clearCachedAgents('session-1')
    expect(entry.pageAgents.size).toBe(0)
    expect(entry.agent).toBeNull()

    manager.removeSession('session-1')
    expect(manager.getSession('session-1')).toBeUndefined()
  })

  it('creates an in-memory cache entry without a database dependency', () => {
    const manager = new AgentManager()

    const entry = manager.ensureSession({
      sessionId: 'session-2',
      provider: 'anthropic',
      model: ' claude-test ',
      projectDir: '/tmp/session-2'
    })

    expect(entry).toMatchObject({
      provider: 'anthropic',
      model: 'claude-test',
      projectDir: '/tmp/session-2'
    })
  })
})
