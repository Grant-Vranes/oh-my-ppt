import type { ImageGenerationResult } from '../types'

export const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export const readString = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === 'string' ? String(record[key]).trim() : ''

export const joinUrl = (baseUrl: string, path: string): string => {
  const base = baseUrl.replace(/\/+$/, '')
  if (!base) return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

const mimeToExt = (mimeType: string): string => {
  if (/jpeg/i.test(mimeType)) return '.jpg'
  if (/webp/i.test(mimeType)) return '.webp'
  return '.png'
}

const dataUrlToResult = (value: string): ImageGenerationResult | null => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(value.trim())
  if (!match) return null
  const mimeType = match[1] || 'image/png'
  return {
    bytes: Buffer.from(match[2], 'base64'),
    mimeType,
    extension: mimeToExt(mimeType)
  }
}

const base64ToResult = (value: string): ImageGenerationResult => ({
  bytes: Buffer.from(value, 'base64'),
  mimeType: 'image/png',
  extension: '.png'
})

const downloadImage = async (
  url: string,
  signal?: AbortSignal
): Promise<ImageGenerationResult> => {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`)
  const mimeType = response.headers.get('content-type')?.split(';', 1)[0] || 'image/png'
  const arrayBuffer = await response.arrayBuffer()
  return {
    bytes: Buffer.from(arrayBuffer),
    mimeType,
    extension: mimeToExt(mimeType)
  }
}

const collectCandidate = (candidate: unknown, candidates: string[]): void => {
  if (typeof candidate === 'string' && candidate.trim()) {
    candidates.push(candidate.trim())
    return
  }
  const record = readRecord(candidate)
  const b64 = readString(record, 'b64_json') || readString(record, 'base64')
  const url = readString(record, 'url')
  if (b64) candidates.push(b64)
  if (url) candidates.push(url)
}

export const collectImageResults = async (
  payload: unknown,
  signal?: AbortSignal
): Promise<ImageGenerationResult[]> => {
  const record = readRecord(payload)
  const output = readRecord(record.output)
  const candidates: string[] = []

  for (const item of Array.isArray(record.data) ? record.data : []) {
    collectCandidate(item, candidates)
  }
  for (const item of Array.isArray(output.results) ? output.results : []) {
    collectCandidate(item, candidates)
  }
  for (const item of Array.isArray(output.images) ? output.images : []) {
    collectCandidate(item, candidates)
  }

  const collected: ImageGenerationResult[] = []
  for (const candidate of candidates) {
    const dataUrl = dataUrlToResult(candidate)
    if (dataUrl) {
      collected.push(dataUrl)
    } else if (/^https?:\/\//i.test(candidate)) {
      collected.push(await downloadImage(candidate, signal))
    } else {
      collected.push(base64ToResult(candidate))
    }
  }
  return collected
}

export const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Image generation failed: ${response.status}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Image generation returned invalid JSON')
  }
}
