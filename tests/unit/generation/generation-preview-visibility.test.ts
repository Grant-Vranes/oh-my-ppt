/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationPreviewGrid } from '../../../src/renderer/src/components/session-generating/GenerationPreviewGrid'
import { requireSlideSizePreset } from '../../../src/shared/slide-size'

vi.mock('../../../src/renderer/src/components/preview/PreviewIframe', () => ({
  PreviewIframe: () => React.createElement('div', { 'data-testid': 'generation-preview' })
}))

describe('generation preview visibility', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not mount preview webviews while the app is minimized or hidden', async () => {
    let visibilityState: DocumentVisibilityState = 'hidden'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const slideSize = requireSlideSizePreset('wide-16-9')
    const pages = [
      {
        id: 'page-1',
        pageNumber: 1,
        pageId: 'page-1',
        title: 'Page 1',
        status: 'completed' as const,
        htmlPath: '/tmp/page-1.html'
      }
    ]

    await act(async () => {
      root.render(React.createElement(GenerationPreviewGrid, { pages, slideSize }))
    })
    expect(container.querySelector('[data-testid="generation-preview"]')).toBeNull()

    visibilityState = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(container.querySelector('[data-testid="generation-preview"]')).not.toBeNull()

    visibilityState = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(container.querySelector('[data-testid="generation-preview"]')).toBeNull()

    await act(async () => root.unmount())
  })
})
