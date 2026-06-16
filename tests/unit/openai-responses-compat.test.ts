import { describe, expect, it, vi } from 'vitest'
import {
  CompatibleChatOpenAIResponses,
  OPENAI_RESPONSES_FORMAT_ERROR_CODE,
  isOpenAIResponsesFormatError
} from '../../src/main/openai-responses-compat'

describe('CompatibleChatOpenAIResponses', () => {
  it('passes through non-stream Responses API payloads with output arrays', async () => {
    const model = new CompatibleChatOpenAIResponses({
      model: 'gpt-5.1',
      apiKey: 'secret'
    })
    const payload = { id: 'resp_1', output: [] }
    vi.spyOn(Object.getPrototypeOf(CompatibleChatOpenAIResponses.prototype), 'completionWithRetry')
      .mockResolvedValueOnce(payload)

    await expect(
      model.completionWithRetry({ model: 'gpt-5.1', input: 'OK', stream: false })
    ).resolves.toBe(payload)
  })

  it('throws a stable error when non-stream payloads are missing output arrays', async () => {
    const model = new CompatibleChatOpenAIResponses({
      model: 'gpt-5.1',
      apiKey: 'secret'
    })
    vi.spyOn(Object.getPrototypeOf(CompatibleChatOpenAIResponses.prototype), 'completionWithRetry')
      .mockResolvedValueOnce({ id: 'chatcmpl_1', choices: [] })

    await expect(
      model.completionWithRetry({ model: 'gpt-5.1', input: 'OK', stream: false })
    ).rejects.toMatchObject({
      name: OPENAI_RESPONSES_FORMAT_ERROR_CODE
    })
  })

  it('skips payload validation for streams', async () => {
    const model = new CompatibleChatOpenAIResponses({
      model: 'gpt-5.1',
      apiKey: 'secret'
    })
    const stream = (async function* () {
      yield { type: 'response.created' }
    })()
    vi.spyOn(Object.getPrototypeOf(CompatibleChatOpenAIResponses.prototype), 'completionWithRetry')
      .mockResolvedValueOnce(stream)

    await expect(
      model.completionWithRetry({ model: 'gpt-5.1', input: 'OK', stream: true })
    ).resolves.toBe(stream)
  })
})

describe('isOpenAIResponsesFormatError', () => {
  it('matches current and older V8 undefined map errors', () => {
    expect(
      isOpenAIResponsesFormatError(
        new TypeError("Cannot read properties of undefined (reading 'map')")
      )
    ).toBe(true)
    expect(isOpenAIResponsesFormatError(new TypeError("Cannot read property 'map' of undefined"))).toBe(
      true
    )
  })
})
