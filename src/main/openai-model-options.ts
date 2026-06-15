export interface OpenAIModelOptionsInput {
  model: string
  apiKey: string
  baseUrl: string
  temperatureOptions: { temperature?: number }
  maxTokens: number
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

export const buildOpenAIModelOptions = ({
  model,
  apiKey,
  baseUrl,
  temperatureOptions,
  maxTokens
}: OpenAIModelOptionsInput) => {
  const disableCompatibleThinking = shouldDisableOpenAICompatibleThinking(baseUrl)

  return {
    model,
    apiKey,
    ...temperatureOptions,
    maxTokens,
    configuration: baseUrl ? { baseURL: baseUrl } : undefined,
    modelKwargs: disableCompatibleThinking ? { thinking: { type: 'disabled' } } : {}
  }
}
