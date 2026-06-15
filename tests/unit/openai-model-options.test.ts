import { describe, expect, it } from 'vitest'
import { buildOpenAIModelOptions } from '../../src/main/openai-model-options'

describe('buildOpenAIModelOptions', () => {
  it.each(['', 'https://api.openai.com', 'https://api.openai.com/v1', 'https://API.OPENAI.COM/v1/'])(
    'does not inject compatibility thinking parameters for official OpenAI: %s',
    (baseUrl) => {
      const options = buildOpenAIModelOptions({
        model: 'test-model',
        apiKey: 'secret',
        baseUrl,
        temperatureOptions: { temperature: 0.7 },
        maxTokens: 4096
      })

      expect(options).toEqual({
        model: 'test-model',
        apiKey: 'secret',
        temperature: 0.7,
        maxTokens: 4096,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelKwargs: {}
      })
    }
  )

  it('keeps thinking disabled for custom OpenAI-compatible endpoints', () => {
    expect(
      buildOpenAIModelOptions({
        model: 'test-model',
        apiKey: 'secret',
        baseUrl: 'https://api.example-compatible.com/v1',
        temperatureOptions: {},
        maxTokens: 2048
      })
    ).toEqual({
      model: 'test-model',
      apiKey: 'secret',
      maxTokens: 2048,
      configuration: { baseURL: 'https://api.example-compatible.com/v1' },
      modelKwargs: { thinking: { type: 'disabled' } }
    })
  })
})
