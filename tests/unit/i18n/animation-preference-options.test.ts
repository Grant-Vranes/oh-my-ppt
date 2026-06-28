import { describe, expect, it } from 'vitest'
import { zh } from '../../../src/renderer/src/i18n/zh'
import { en } from '../../../src/renderer/src/i18n/en'
import type { AnimationPreferenceId } from '../../../src/shared/generation'

const EXPECTED_IDS: AnimationPreferenceId[] = [
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'scale-in',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'fly-in',
  'wipe',
  'zoom-in',
  'spin-in',
  'pulse-soft',
  'pulse',
  'pulse-strong',
  'grow-shrink-soft',
  'grow-shrink',
  'grow-shrink-strong'
]

describe('animation preference option i18n', () => {
  it('every preference id has a zh + en label', () => {
    const zhOptions = zh.home.animationPreferenceOptions as Record<string, string>
    const enOptions = en.home.animationPreferenceOptions as Record<string, string>
    for (const id of EXPECTED_IDS) {
      expect(zhOptions[id], `missing zh label for ${id}`).toBeTruthy()
      expect(enOptions[id], `missing en label for ${id}`).toBeTruthy()
    }
  })

  it('zh and en expose the same set of option keys', () => {
    expect(Object.keys(zh.home.animationPreferenceOptions).sort()).toEqual(
      Object.keys(en.home.animationPreferenceOptions).sort()
    )
  })

  it('has a limit-reached toast in both langs', () => {
    expect(zh.home.animationPreferenceLimitReached).toBeTruthy()
    expect(en.home.animationPreferenceLimitReached).toBeTruthy()
  })
})
