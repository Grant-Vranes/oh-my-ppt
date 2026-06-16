/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { TemplateCard } from '../../../src/renderer/src/components/templates/TemplateCard'
import type { TemplateListItem } from '../../../src/renderer/src/lib/ipc'

vi.mock('@renderer/i18n', () => ({ useT: () => (key: string) => key }))

const createTemplate = (thumbnailPath: string | null): TemplateListItem => ({
  id: 'template-1',
  name: 'Quarterly Review',
  description: 'Template description',
  source: 'user',
  pageCount: 3,
  tags: [],
  previewHtmlPath: '/templates/template-1/page-1.html',
  thumbnailPath,
  previewPages: [
    {
      pageNumber: 1,
      pageId: 'page-1',
      title: 'Cover',
      htmlPath: '/templates/template-1/page-1.html'
    }
  ],
  createdAt: 1,
  updatedAt: 2
})

describe('TemplateCard rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders a cached PNG cover without mounting an iframe', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(TemplateCard, {
          template: createTemplate('/cache/template-1.png'),
          onUseDirect: vi.fn(),
          onUseGenerate: vi.fn(),
          onEdit: vi.fn(),
          onDelete: vi.fn(),
          onPreview: vi.fn()
        })
      )
    })

    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect((container.querySelector('img') as HTMLImageElement).src).toContain(
      '/cache/template-1.png'
    )
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/\d{2}:\d{2}/)
    await act(async () => root.unmount())
  })

  it('shows a generating placeholder while the cover is queued', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(TemplateCard, {
          template: createTemplate(null),
          onUseDirect: vi.fn(),
          onUseGenerate: vi.fn(),
          onEdit: vi.fn(),
          onDelete: vi.fn(),
          onPreview: vi.fn()
        })
      )
    })

    expect(container.textContent).toContain('templates.thumbnailGenerating')
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelectorAll('iframe')).toHaveLength(0)
    await act(async () => root.unmount())
  })
})
