import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'
import log from 'electron-log/main.js'
import type { PPTDatabase } from './db/database'

export interface ExtractedModelUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  source: 'provider' | 'estimated'
}

type UnknownRecord = Record<string, unknown>

let usageDb: PPTDatabase | null = null

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null

const readNumber = (record: UnknownRecord | null, keys: string[]): number | null => {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value)
    }
  }
  return null
}

const readUsageRecord = (value: unknown): ExtractedModelUsage | null => {
  const record = asRecord(value)
  if (!record) return null
  const inputTokens = readNumber(record, ['input_tokens', 'inputTokens', 'promptTokens'])
  const outputTokens = readNumber(record, [
    'output_tokens',
    'outputTokens',
    'completionTokens'
  ])
  const totalTokens = readNumber(record, ['total_tokens', 'totalTokens'])
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null

  const input = inputTokens ?? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0))
  const output = outputTokens ?? Math.max(0, (totalTokens ?? 0) - input)
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: totalTokens ?? input + output,
    source: 'provider'
  }
}

const countEstimatedTokens = (value: string): number => {
  if (!value) return 0
  return Math.max(1, Math.ceil(value.length / 4))
}

const serializeMessages = (messages: BaseMessage[][]): string =>
  JSON.stringify(
    messages.map((batch) =>
      batch.map((message) => ({
        role: message.getType(),
        content: message.content,
        additionalKwargs: message.additional_kwargs
      }))
    )
  )

export const extractModelUsage = (output: LLMResult): ExtractedModelUsage => {
  const generationUsages = output.generations
    .flat()
    .map((generation) => {
      const message = asRecord((generation as unknown as UnknownRecord).message)
      return (
        readUsageRecord(message?.usage_metadata) ||
        readUsageRecord(asRecord(message?.response_metadata)?.tokenUsage)
      )
    })
    .filter((usage): usage is ExtractedModelUsage => usage !== null)

  if (generationUsages.length > 0) {
    return generationUsages.reduce<ExtractedModelUsage>(
      (total, usage) => ({
        inputTokens: total.inputTokens + usage.inputTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
        totalTokens: total.totalTokens + usage.totalTokens,
        source: 'provider'
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'provider' }
    )
  }

  const llmOutput = asRecord(output.llmOutput)
  return (
    readUsageRecord(llmOutput?.tokenUsage) ||
    readUsageRecord(llmOutput?.usage) ||
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'estimated' }
  )
}

export const configureModelUsageRecorder = (db: PPTDatabase): void => {
  usageDb = db
}

export class ModelUsageCallbackHandler extends BaseCallbackHandler {
  name = 'ohmyppt-model-usage'
  private readonly estimatedInputByRun = new Map<string, number>()

  constructor(
    private readonly context: {
      provider: string
      model: string
      modelConfigId?: string
    }
  ) {
    super({ _awaitHandler: true })
  }

  copy(): this {
    return this
  }

  handleLLMStart(_llm: unknown, prompts: string[], runId: string): void {
    this.estimatedInputByRun.set(runId, countEstimatedTokens(prompts.join('\n')))
  }

  handleChatModelStart(_llm: unknown, messages: BaseMessage[][], runId: string): void {
    this.estimatedInputByRun.set(runId, countEstimatedTokens(serializeMessages(messages)))
  }

  handleLLMError(_error: unknown, runId: string): void {
    this.estimatedInputByRun.delete(runId)
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    if (!usageDb) {
      this.estimatedInputByRun.delete(runId)
      return
    }
    const providerUsage = extractModelUsage(output)
    const usage =
      providerUsage.source === 'provider'
        ? providerUsage
        : (() => {
            const inputTokens = this.estimatedInputByRun.get(runId) ?? 0
            const outputTokens = countEstimatedTokens(
              output.generations.flat().map((generation) => generation.text).join('\n')
            )
            return {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              source: 'estimated' as const
            }
          })()
    this.estimatedInputByRun.delete(runId)
    try {
      await usageDb.recordModelUsage({
        ...this.context,
        ...usage
      })
    } catch (error) {
      log.warn('[model-usage] failed to persist usage', {
        provider: this.context.provider,
        model: this.context.model,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
