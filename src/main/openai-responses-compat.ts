import { ChatOpenAIResponses } from '@langchain/openai'
import type { OpenAI } from 'openai'

export const OPENAI_RESPONSES_FORMAT_ERROR_ZH =
  '当前 provider 返回的不是 OpenAI Responses API 格式。请确认 base_url 填写到 /v1（不要追加 /responses），并确认该服务支持 /v1/responses；如果只支持 /v1/chat/completions，请选择 OpenAI / 兼容 Chat Completions。'
export const OPENAI_RESPONSES_FORMAT_ERROR_EN =
  'The provider did not return an OpenAI Responses API payload. Use a base_url ending at /v1, confirm the service supports /v1/responses, or choose OpenAI / compatible Chat Completions if it only supports /v1/chat/completions.'

export const OPENAI_RESPONSES_FORMAT_ERROR_CODE = 'OPENAI_RESPONSES_INVALID_PAYLOAD'

export class OpenAIResponsesFormatError extends Error {
  constructor() {
    super(OPENAI_RESPONSES_FORMAT_ERROR_ZH)
    this.name = OPENAI_RESPONSES_FORMAT_ERROR_CODE
  }
}

export const isOpenAIResponsesFormatError = (error: unknown): boolean => {
  if (error instanceof OpenAIResponsesFormatError) return true
  if (error instanceof Error && error.name === OPENAI_RESPONSES_FORMAT_ERROR_CODE) return true
  const message = error instanceof Error ? error.message : ''
  return /Cannot read propert(?:y|ies).*undefined.*map|Cannot read propert(?:y|ies).*map.*undefined/i.test(
    message
  )
}

export class CompatibleChatOpenAIResponses extends ChatOpenAIResponses {
  async completionWithRetry(
    request: OpenAI.Responses.ResponseCreateParamsStreaming,
    requestOptions?: OpenAI.RequestOptions
  ): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent>>
  async completionWithRetry(
    request: OpenAI.Responses.ResponseCreateParamsNonStreaming,
    requestOptions?: OpenAI.RequestOptions
  ): Promise<OpenAI.Responses.Response>
  async completionWithRetry(
    request: OpenAI.Responses.ResponseCreateParams,
    requestOptions?: OpenAI.RequestOptions
  ): Promise<AsyncIterable<OpenAI.Responses.ResponseStreamEvent> | OpenAI.Responses.Response> {
    const response = await super.completionWithRetry(request as never, requestOptions)
    if (request?.stream === true) {
      return response as AsyncIterable<OpenAI.Responses.ResponseStreamEvent>
    }

    const responseRecord = response as { output?: unknown }
    if (!responseRecord || !Array.isArray(responseRecord.output)) {
      throw new OpenAIResponsesFormatError()
    }
    return response
  }
}
