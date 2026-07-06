/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { ModelSplitButton } from '../../../src/renderer/src/components/model/ModelActionButton'
import type { ModelActionState } from '../../../src/renderer/src/hooks/useModelAction'

vi.mock('@renderer/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('../../../src/renderer/src/components/ui/DropdownMenu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DropdownMenuItem: ({
    children,
    onSelect,
    className
  }: {
    children: React.ReactNode
    onSelect?: () => void
    className?: string
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        className,
        onClick: () => onSelect?.()
      },
      children
    )
}))

const createModelAction = (
  ensureModelActive: ModelActionState['ensureModelActive']
): ModelActionState => ({
  modelConfigs: [
    {
      id: 'model-a',
      name: 'Model A',
      provider: 'openai',
      model: 'gpt-a',
      apiKey: 'key-a',
      baseUrl: '',
      maxTokens: 4096,
      disableTemperature: false,
      thinkingParameterMode: 'auto',
      active: true,
      createdAt: 1,
      updatedAt: 1
    },
    {
      id: 'model-b',
      name: 'Model B',
      provider: 'openai',
      model: 'gpt-b',
      apiKey: 'key-b',
      baseUrl: '',
      maxTokens: 4096,
      disableTemperature: false,
      thinkingParameterMode: 'auto',
      active: false,
      createdAt: 2,
      updatedAt: 2
    }
  ],
  selectedModelConfigId: 'model-a',
  activatingModelConfigId: null,
  hasMultipleModelConfigs: true,
  currentModelConfig: null,
  ensureModelActive
})

describe('ModelSplitButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('runs with the model chosen from its menu instead of the previously selected model', async () => {
    const ensureModelActive = vi.fn(async (modelConfigId?: string) => modelConfigId || null)
    const onRun = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(ModelSplitButton, {
          modelAction: createModelAction(ensureModelActive),
          label: 'Continue',
          onRun
        })
      )
    })

    try {
      const modelBButton = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Model B')
      ) as HTMLButtonElement | undefined
      const continueButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Continue'
      ) as HTMLButtonElement | undefined

      expect(modelBButton).toBeTruthy()
      expect(continueButton).toBeTruthy()

      await act(async () => {
        modelBButton!.click()
      })

      expect(ensureModelActive).not.toHaveBeenCalled()

      await act(async () => {
        continueButton!.click()
        await Promise.resolve()
      })

      expect(ensureModelActive).toHaveBeenCalledTimes(1)
      expect(ensureModelActive).toHaveBeenCalledWith('model-b')
      expect(onRun).toHaveBeenCalledTimes(1)
      expect(onRun).toHaveBeenCalledWith('model-b')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
