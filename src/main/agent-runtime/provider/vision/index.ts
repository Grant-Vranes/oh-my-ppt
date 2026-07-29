import { HumanMessage } from '@langchain/core/messages'
import { isSupportedImageMimeType, normalizeImageMimeType } from '@shared/image-mime'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import log from 'electron-log/main.js'
import { extractModelText } from '../../model/result'
import { resolveModel } from '../../model/resolve'
import type { ModelRuntimeConfig } from '../../model/usage'

const combineAbortSignals = (signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } => {
  if (signals.length === 1) return { signal: signals[0], dispose: () => undefined }

  const controller = new AbortController()
  const abort = (signal: AbortSignal): void => controller.abort(signal.reason)
  const listeners = signals.map((signal) => {
    const listener = (): void => abort(signal)
    if (signal.aborted) listener()
    else signal.addEventListener('abort', listener, { once: true })
    return { signal, listener }
  })
  return {
    signal: controller.signal,
    dispose: () => {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener('abort', listener)
      }
    }
  }
}

export async function invokeVisionModelText(args: {
  imageBase64: string
  mimeType: string
  prompt: string
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens?: number
  modelRuntime?: ModelRuntimeConfig
  modelTimeoutMs: number
  logTag: string
  signal?: AbortSignal
}): Promise<string> {
  const mimeType = normalizeImageMimeType(args.mimeType)
  const imageBase64 = String(args.imageBase64 || '').trim()
  if (!isSupportedImageMimeType(args.mimeType)) {
    throw new Error(`不支持的图片格式：${mimeType || 'unknown'}`)
  }
  if (!imageBase64) {
    throw new Error('图片数据为空')
  }

  const imageBytes = Buffer.byteLength(imageBase64, 'base64')
  log.info(`[${args.logTag}] invoke vision model`, {
    provider: args.provider,
    model: args.model,
    mimeType,
    imageBytes
  })

  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    0.2,
    args.maxTokens,
    args.modelRuntime
  )
  const imageUrl = `data:${mimeType};base64,${imageBase64}`
  const timeoutSignal = AbortSignal.timeout(resolveModelTimeoutMs(args.modelTimeoutMs, 'document'))
  const combinedSignal = combineAbortSignals(
    args.signal ? [args.signal, timeoutSignal] : [timeoutSignal]
  )
  try {
    const result = await model.invoke(
      [
        new HumanMessage({
          content: [
            { type: 'text', text: args.prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        })
      ],
      { signal: combinedSignal.signal }
    )
    return extractModelText(result)
  } finally {
    combinedSignal.dispose()
  }
}
