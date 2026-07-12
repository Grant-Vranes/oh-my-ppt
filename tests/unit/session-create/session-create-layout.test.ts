/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { readFileSync } from 'fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { SessionCreatePage } from '../../../src/renderer/src/pages/session-create'
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({
  listStyles: vi.fn(async () => ({
    items: [
      {
        id: 'style-1',
        label: 'Style One',
        description: '',
        createdAt: 1,
        updatedAt: 1
      }
    ]
  })),
  listFonts: vi.fn(async () => ({ googleFonts: [], userFonts: [] })),
  translate: vi.fn((key: string) => key),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

vi.mock('../../../src/renderer/src/store', () => ({
  useSessionStore: () => ({
    createSession: vi.fn(),
    loading: false
  }),
  useSettingsStore: () => ({
    settings: {
      storagePath: '/tmp'
    }
  }),
  useToastStore: () => ({
    success: state.success,
    error: state.error,
    warning: state.warning
  })
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    listStyles: state.listStyles,
    listFonts: state.listFonts
  }
}))

vi.mock('@renderer/i18n', () => ({
  useT: () => state.translate
}))

vi.mock('../../../src/renderer/src/hooks/useModelAction', () => ({
  useModelAction: () => ({
    modelConfigs: [{ id: 'model-1', apiKey: 'key', model: 'model' }],
    selectedModelConfigId: 'model-1',
    ensureModelActive: vi.fn(async (id: string) => id)
  })
}))

vi.mock('../../../src/renderer/src/components/style/StyleSelect', () => ({
  StyleSelect: ({
    className,
    dropdownAlign,
    dropdownClassName
  }: {
    className?: string
    dropdownAlign?: string
    dropdownClassName?: string
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        className,
        'data-dropdown-align': dropdownAlign,
        'data-dropdown-class': dropdownClassName
      },
      'style-select'
    )
}))

vi.mock('../../../src/renderer/src/components/model/ModelActionButton', () => ({
  ModelSplitButton: ({ ariaLabel, className }: { ariaLabel: string; className?: string }) =>
    React.createElement('button', { type: 'button', className, 'aria-label': ariaLabel }, ariaLabel)
}))

vi.mock(
  '../../../src/renderer/src/components/session-create/SessionCreateSuggestionDialog',
  () => ({
    buildSuggestionDraft: vi.fn(),
    formatSourceOutlineBriefText: vi.fn(),
    SessionCreateSuggestionDialog: () => null
  })
)

describe('SessionCreatePage layout', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('groups content and generation settings into one responsive two-column workspace', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(SessionCreatePage)))
      await Promise.resolve()
      await Promise.resolve()
    })

    const main = container.querySelector('[data-session-create-main]')
    const settings = container.querySelector('[data-session-create-settings]')
    const page = container.querySelector('.session-create-page')

    expect(page).toBeTruthy()
    expect(main).toBeTruthy()
    expect(settings).toBeTruthy()
    expect(main?.parentElement).toBe(settings?.parentElement)
    expect(main?.parentElement?.className).toContain('lg:grid-cols-')
    expect(main?.className).toContain('bg-transparent')
    expect(settings?.className).toContain('bg-transparent')
    expect(main?.closest('[data-session-create-workspace]')?.className).toContain(
      'border-[#ded8cb]'
    )

    expect(main?.querySelector('input[placeholder="home.topicPlaceholder"]')).toBeTruthy()
    expect(main?.querySelector('textarea[placeholder="home.briefPlaceholder"]')).toBeTruthy()
    const createButton = main?.querySelector('button[aria-label="home.createAndStart"]')
    expect(createButton).toBeTruthy()
    expect(createButton?.className).toContain('w-full')

    const referenceActions = main?.querySelector('[data-session-create-reference-actions]')
    expect(referenceActions).toBeTruthy()
    expect(referenceActions?.className).toContain('justify-end')
    expect(referenceActions?.previousElementSibling?.querySelector('textarea')).toBeTruthy()
    expect(settings?.querySelector('[data-session-create-reference-actions]')).toBeNull()

    const styleSelect = settings?.querySelector('[data-dropdown-align="end"]')
    expect(styleSelect).toBeTruthy()
    expect(styleSelect?.className).toContain('h-8')
    expect(styleSelect?.getAttribute('data-dropdown-class')).toContain('700px')
    expect(settings?.querySelector('input[inputmode="numeric"]')).toBeTruthy()

    const animationButtons = settings?.querySelectorAll('button[aria-pressed]')
    expect(animationButtons).toHaveLength(20)
    expect(animationButtons?.[0]?.parentElement?.className).toContain('grid-cols-2')

    await act(async () => root.unmount())
  })

  it('caps the attached file name at 150px with ellipsis', () => {
    const source = readFileSync('src/renderer/src/pages/session-create.tsx', 'utf8')

    expect(source).toContain('w-[150px] min-w-0 max-w-[150px] truncate text-left hover:underline')
  })
})
