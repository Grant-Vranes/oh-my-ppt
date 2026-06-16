/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { RendererErrorBoundary } from '../../../src/renderer/src/components/RendererErrorBoundary'

function BrokenPage(): React.JSX.Element {
  throw new Error('render failed')
}

describe('RendererErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('replaces a crashed React tree with a refresh action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(React.createElement(RendererErrorBoundary, null, React.createElement(BrokenPage)))
    })

    expect(container.textContent).toContain('页面遇到错误')
    expect(container.querySelector('button')?.textContent).toBe('刷新应用')

    await act(async () => {
      root.unmount()
    })
  })
})
