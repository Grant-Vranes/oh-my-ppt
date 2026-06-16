export interface OpenAIModelOptionsInput {
  model: string
  apiKey: string
  baseUrl: string
  temperatureOptions: { temperature?: number }
  maxTokens: number
  useResponsesApi?: boolean
}

export const shouldDisableOpenAICompatibleThinking = (baseUrl: string): boolean => {
  const resolvedBaseUrl = baseUrl.trim()
  if (!resolvedBaseUrl) return false

  try {
    const hostname = new URL(resolvedBaseUrl).hostname.toLowerCase().replace(/\.$/, '')
    return hostname !== 'api.openai.com'
  } catch {
    return true
  }
}

export const normalizeOpenAIBaseUrl = (baseUrl: string, useResponsesApi = false): string => {
  const resolvedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  if (!useResponsesApi) return resolvedBaseUrl
  return resolvedBaseUrl.replace(/\/responses$/i, '')
}

export const buildOpenAIModelOptions = ({
  model,
  apiKey,
  baseUrl,
  temperatureOptions,
  maxTokens,
  useResponsesApi = false
}: OpenAIModelOptionsInput) => {
  const resolvedBaseUrl = normalizeOpenAIBaseUrl(baseUrl, useResponsesApi)
  const disableCompatibleThinking = shouldDisableOpenAICompatibleThinking(resolvedBaseUrl)

  return {
    model,
    apiKey,
    ...temperatureOptions,
    maxTokens,
    configuration: resolvedBaseUrl ? { baseURL: resolvedBaseUrl } : undefined,
    // Some OpenAI-compatible Chat Completions endpoints reject reasoning/thinking params.
    // Responses API has a different payload shape, so keep this compatibility shim off there.
    modelKwargs:
      disableCompatibleThinking && !useResponsesApi ? { thinking: { type: 'disabled' } } : {}
  }
}

export const isOpenAIResponsesProvider = (provider: string): boolean => {
  return provider === 'openai-responses'
}
