import { describe, expect, it, vi } from 'vitest'
import {
  ModelUsageCallbackHandler,
  configureModelUsageRecorder,
  extractModelUsage
} from '../../src/main/model-usage'

describe('model usage tracking', () => {
  it('prefers provider-reported usage metadata', () => {
    const usage = extractModelUsage({
      generations: [
        [
          {
            text: 'done',
            message: {
              usage_metadata: {
                input_tokens: 120,
                output_tokens: 35,
                total_tokens: 155
              }
            }
          }
        ]
      ]
    } as never)

    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 35,
      totalTokens: 155,
      source: 'provider'
    })
  })

  it('uses heuristic estimates when the provider omits usage', async () => {
    const recordModelUsage = vi.fn(async () => undefined)
    configureModelUsageRecorder({ recordModelUsage } as never)
    const handler = new ModelUsageCallbackHandler({
      provider: 'openai',
      model: 'compatible-model'
    })

    handler.handleLLMStart({} as never, ['Create a concise presentation outline.'], 'run-1')
    await handler.handleLLMEnd(
      {
        generations: [[{ text: 'A short outline with three sections.' }]]
      },
      'run-1'
    )

    expect(recordModelUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'compatible-model',
        source: 'estimated',
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number)
      })
    )
    const recorded = recordModelUsage.mock.calls[0][0]
    expect(recorded.inputTokens).toBeGreaterThan(0)
    expect(recorded.outputTokens).toBeGreaterThan(0)
    expect(recorded.totalTokens).toBe(recorded.inputTokens + recorded.outputTokens)
  })
})
