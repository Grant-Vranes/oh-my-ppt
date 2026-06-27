/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { AnimationToolRow } from '../../../src/renderer/src/components/session-detail/workspace/toolbar/tool-rows/AnimationToolRow'
import { useSessionDetailRuntimeStore } from '../../../src/renderer/src/store/sessionDetailRuntimeStore'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const translate = vi.hoisted(() => vi.fn((key: string) => key))
const refreshCurrentPreview = vi.hoisted(() => vi.fn())

vi.mock('@renderer/i18n', () => ({
  useT: () => translate
}))
vi.mock(
  '../../../src/renderer/src/components/session-detail/workspace/toolbar/tool-rows/ElementAnimationPicker',
  () => ({
    ElementAnimationPicker: () => React.createElement('div', { 'data-testid': 'element-animation' })
  })
)
vi.mock(
  '../../../src/renderer/src/components/session-detail/workspace/toolbar/tool-rows/IndexTransitionPicker',
  () => ({
    IndexTransitionPicker: () => React.createElement('div', { 'data-testid': 'index-transition' })
  })
)

async function renderRow(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AnimationToolRow, { disabled: false }))
    await Promise.resolve()
  })
  return { root, container }
}

describe('AnimationToolRow', () => {
  beforeEach(() => {
    refreshCurrentPreview.mockReset()
    useSessionDetailRuntimeStore
      .getState()
      .setRefreshCurrentPreviewHandler(refreshCurrentPreview)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('only refreshes the preview when clicking preview page', async () => {
    const { root, container } = await renderRow()
    try {
      const previewButton = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('sessionDetail.elementAnimationPreview')
      ) as HTMLButtonElement | undefined
      expect(previewButton).toBeTruthy()

      await act(async () => {
        previewButton!.click()
        await Promise.resolve()
      })

      expect(refreshCurrentPreview).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
