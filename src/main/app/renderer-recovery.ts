import type { RenderProcessGoneDetails } from 'electron'

const RECOVERABLE_REASONS = new Set<RenderProcessGoneDetails['reason']>([
  'abnormal-exit',
  'crashed',
  'oom'
])

export const RENDERER_CRASH_WINDOW_MS = 30_000

export function shouldRecoverRenderer(reason: RenderProcessGoneDetails['reason']): boolean {
  return RECOVERABLE_REASONS.has(reason)
}

export function isRepeatedRendererCrash(lastCrashAt: number, now: number): boolean {
  return lastCrashAt > 0 && now - lastCrashAt <= RENDERER_CRASH_WINDOW_MS
}
