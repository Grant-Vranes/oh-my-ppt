/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { TemplatesPage } from '../../../src/renderer/src/pages/templates'

const state = vi.hoisted(() => ({
  fetchTemplates: vi.fn(async () => undefined),
  applyTemplateThumbnail: vi.fn(),
  createEditableSessionFromTemplate: vi.fn(),
  importPptxAsTemplate: vi.fn(),
  updateTemplateMetadata: vi.fn(),
  deleteTemplate: vi.fn(),
  onTemplatePptxImportProgress: vi.fn(() => () => undefined)
}))

vi.mock('../../../src/renderer/src/store', () => ({
  useTemplateStore: () => ({
    templates: [
      {
        id: 'template-1',
        name: 'Template One',
        description: '',
        source: 'user',
        pageCount: 1,
        tags: [],
        previewHtmlPath: '/templates/template-1/page-1.html',
        thumbnailPath: '/cache/template-1.png',
        previewPages: [],
        createdAt: 1,
        updatedAt: 1
      }
    ],
    loading: false,
    fetchTemplates: state.fetchTemplates,
    applyTemplateThumbnail: state.applyTemplateThumbnail,
    createEditableSessionFromTemplate: state.createEditableSessionFromTemplate,
    importPptxAsTemplate: state.importPptxAsTemplate,
    updateTemplateMetadata: state.updateTemplateMetadata,
    deleteTemplate: state.deleteTemplate
  }),
  useToastStore: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  })
}))
vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    onTemplatePptxImportProgress: state.onTemplatePptxImportProgress
  }
}))
vi.mock('@renderer/hooks/useThumbnailUpdates', () => ({ useThumbnailUpdates: vi.fn() }))
vi.mock('@renderer/hooks/useModelAction', () => ({
  useModelAction: () => ({ ensureModelActive: vi.fn() })
}))
vi.mock('@renderer/i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../../../src/renderer/src/components/model/ModelActionButton', () => ({
  ModelSplitButton: () => null
}))
vi.mock('../../../src/renderer/src/components/templates/TemplateCard', () => ({
  TemplateCard: () => React.createElement('div', { 'data-testid': 'template-card' }),
  TemplateEmptyState: () => null
}))
vi.mock('../../../src/renderer/src/components/templates/TemplateUseDialog', () => ({
  TemplateUseDialog: () => null
}))
vi.mock('../../../src/renderer/src/components/templates/SaveTemplateDialog', () => ({
  SaveTemplateDialog: () => null
}))

describe('TemplatesPage rendering', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('uses a three-column desktop grid for template cards', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(TemplatesPage)))
      await Promise.resolve()
    })

    const card = container.querySelector('[data-testid="template-card"]')
    expect(card?.parentElement?.className).toContain('lg:grid-cols-3')
    await act(async () => root.unmount())
  })

  it('disables playback animations in template previews', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/renderer/src/pages/templates.tsx'),
      'utf8'
    )

    expect(source).toContain('print=1&thumbnail=1&fit=off&pptPlayback=0')
  })
})
