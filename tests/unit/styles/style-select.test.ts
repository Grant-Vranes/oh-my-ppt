/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { StyleSelect } from '../../../src/renderer/src/components/style/StyleSelect'

vi.mock('@renderer/i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('@renderer/lib/ipc', () => ({
  ipc: {
    onHtmlThumbnailChanged: vi.fn(() => () => undefined)
  }
}))

async function renderStyleSelect(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(StyleSelect, {
        value: 'normal',
        onChange: vi.fn(),
        options: [
          {
            id: 'normal',
            label: 'Normal Style',
            description: 'Regular option'
          },
          {
            id: 'favorite-old',
            label: 'Favorite Old',
            description: 'Older favorite',
            favoriteAt: 10
          },
          {
            id: 'favorite-new',
            label: 'Favorite New',
            description: 'Newer favorite',
            favoriteAt: 20
          }
        ]
      })
    )
  })
  return { container, root }
}

describe('StyleSelect', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('shows favorite styles first with a filled star', async () => {
    const { container, root } = await renderStyleSelect()
    try {
      await act(async () => {
        container.querySelector('button')?.click()
        await new Promise((resolve) => window.setTimeout(resolve, 5))
      })

      const optionButtons = Array.from(document.body.querySelectorAll('button')).filter((button) =>
        /Favorite|Normal/.test(button.textContent || '')
      )
      expect(optionButtons.map((button) => button.textContent)).toEqual([
        'Normal Style',
        'Favorite NewNewer favorite',
        'Favorite OldOlder favorite',
        'Normal StyleRegular option'
      ])

      const newestFavorite = optionButtons[1]
      expect(newestFavorite?.querySelector('svg')?.getAttribute('class')).toContain('fill-[#d6a942]')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
