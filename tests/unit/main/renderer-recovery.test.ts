import { describe, expect, it } from 'vitest'
import {
  isRepeatedRendererCrash,
  RENDERER_CRASH_WINDOW_MS,
  shouldRecoverRenderer
} from '../../../src/main/renderer-recovery'

describe('renderer recovery', () => {
  it('recovers crashes and OOM exits but ignores intentional exits', () => {
    expect(shouldRecoverRenderer('crashed')).toBe(true)
    expect(shouldRecoverRenderer('oom')).toBe(true)
    expect(shouldRecoverRenderer('abnormal-exit')).toBe(true)
    expect(shouldRecoverRenderer('clean-exit')).toBe(false)
    expect(shouldRecoverRenderer('killed')).toBe(false)
  })

  it('detects repeated crashes inside the recovery window', () => {
    expect(isRepeatedRendererCrash(0, RENDERER_CRASH_WINDOW_MS)).toBe(false)
    expect(isRepeatedRendererCrash(1_000, 1_000 + RENDERER_CRASH_WINDOW_MS)).toBe(true)
    expect(isRepeatedRendererCrash(1_000, 1_001 + RENDERER_CRASH_WINDOW_MS)).toBe(false)
  })
})
