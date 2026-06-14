/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { SessionsPage } from '../../../src/renderer/src/pages/sessions'

const state = vi.hoisted(() => ({
  fetchSessions: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
  updateSessionTitle: vi.fn(async () => undefined),
  importSessionFile: vi.fn(async () => ({ cancelled: true })),
  createTemplateFromSession: vi.fn(async () => 'template-1'),
  listActiveGenerateRuns: vi.fn(async () => []),
  onGenerateChunk: vi.fn(() => () => undefined),
  onHtmlThumbnailChanged: vi.fn(() => () => undefined)
}))

vi.mock('../../../src/renderer/src/store', () => ({
  useSessionStore: () => ({
    sessions: [
      {
        id: 'session-1',
        title: 'Quarterly Review',
        topic: 'Review',
        styleId: 'style-1',
        page_count: 6,
        status: 'completed',
        provider: 'openai',
        model: 'model',
        created_at: 1,
        updated_at: 2,
        metadata: '{}',
        generated_count: 6,
        failed_count: 0,
        thumbnailPath: '/cache/session-1.png'
      },
      {
        id: 'session-2',
        title: 'Draft Session',
        topic: 'Draft',
        styleId: 'style-1',
        page_count: 0,
        status: 'active',
        provider: 'openai',
        model: 'model',
        created_at: 1,
        updated_at: 1,
        metadata: '{}',
        generated_count: 0,
        failed_count: 0,
        thumbnailPath: null
      }
    ],
    fetchSessions: state.fetchSessions,
    deleteSession: state.deleteSession,
    updateSessionTitle: state.updateSessionTitle,
    importSessionFile: state.importSessionFile
  }),
  useTemplateStore: () => ({ createTemplateFromSession: state.createTemplateFromSession }),
  useToastStore: () => ({
    success: vi.fn(),
    error: vi.fn()
  })
}))
vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    listActiveGenerateRuns: state.listActiveGenerateRuns,
    onGenerateChunk: state.onGenerateChunk,
    onHtmlThumbnailChanged: state.onHtmlThumbnailChanged
  }
}))
vi.mock('@renderer/i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../../../src/renderer/src/components/templates/SaveTemplateDialog', () => ({
  SaveTemplateDialog: () => null
}))

describe('SessionsPage rendering', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('keeps one session per row with a PNG preview and all actions', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(SessionsPage)))
      await Promise.resolve()
    })

    const card = container.querySelector('[data-session-card-id="session-1"]')
    expect(card).toBeTruthy()
    expect(card?.querySelector('.sm\\:flex-row')).toBeTruthy()
    expect(card?.querySelectorAll('img')).toHaveLength(1)
    expect(card?.querySelectorAll('iframe')).toHaveLength(0)
    const placeholderImage = container.querySelector(
      '[data-session-card-id="session-2"] img'
    ) as HTMLImageElement | null
    expect(placeholderImage?.src).toContain('space.webp')
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
    expect(container.textContent).toContain('Quarterly Review')
    expect(
      container.querySelector('button[aria-label="sessions.editTitleTooltip"]')
    ).toBeTruthy()
    expect(
      container.querySelector('button[aria-label="sessions.saveTemplateTooltip"]')
    ).toBeTruthy()
    expect(container.querySelector('button[aria-label="common.delete"]')).toBeTruthy()

    await act(async () => root.unmount())
  })
})
