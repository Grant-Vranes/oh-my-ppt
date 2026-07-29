import type { RuntimeEventEnvelope } from '../../agent-runtime'

export type LegacyRuntimeEventMessage = {
  channel: string
  payload: unknown
}

/**
 * Baseline-A compatibility table. Only generation historically had a push
 * channel; image generation returns from its invoke handler and exposes
 * images:getState for recovery, so it intentionally has no invented channel.
 */
export const translateLegacyRuntimeEvent = (
  event: RuntimeEventEnvelope
): LegacyRuntimeEventMessage | null =>
  event.type === 'generation.chunk'
    ? { channel: 'generate:chunk', payload: event.payload }
    : null
