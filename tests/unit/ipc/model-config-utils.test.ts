import { describe, expect, it, vi } from 'vitest'

const modelRuntimeState = vi.hoisted(() => ({
  bindCurrentModelTemperatureControl: vi.fn()
}))

vi.mock('../../../src/main/ipc/config/locale-utils', () => ({
  readAppLocale: vi.fn(async () => 'zh'),
  uiText: vi.fn((_locale: string, zh: string) => zh)
}))

vi.mock('../../../src/main/model-runtime', () => ({
  bindCurrentModelTemperatureControl: modelRuntimeState.bindCurrentModelTemperatureControl
}))

vi.mock('@shared/model-timeout', () => ({
  MODEL_TIMEOUT_PROFILES: ['planning', 'design', 'agent', 'document'],
  resolveModelTimeoutMs: vi.fn(() => 1000)
}))

describe('resolveModelConfigForTask temperature control', () => {
  it('binds the selected model temperature setting to the current async task', async () => {
    modelRuntimeState.bindCurrentModelTemperatureControl.mockClear()
    const { resolveModelConfigForTask } =
      await import('../../../src/main/ipc/config/model-config-utils')
    const ctx = {
      db: {
        getModelConfig: vi.fn(async () => ({
          id: 'model-1',
          name: 'Reasoning model',
          provider: 'openai',
          model: 'reasoner',
          apiKey: 'secret',
          baseUrl: '',
          maxTokens: 4096,
          disableTemperature: 1,
          thinkingParameterMode: 'omit'
        }))
      },
      decryptApiKey: vi.fn((value: unknown) => String(value))
    }

    const config = await resolveModelConfigForTask(ctx as never, {
      modelConfigId: 'model-1',
      purpose: 'test'
    })
    await Promise.resolve()

    expect(config.disableTemperature).toBe(true)
    expect(config.thinkingParameterMode).toBe('omit')
    expect(modelRuntimeState.bindCurrentModelTemperatureControl).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model-1',
        disableTemperature: true,
        thinkingParameterMode: 'omit'
      })
    )
  })
})
