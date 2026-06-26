import { describe, expect, it } from 'vitest'
import {
  resolveInheritedAnimationPreferences,
  type AnimationPreferenceSourceRun
} from '../../../src/shared/generation'

describe('resolveInheritedAnimationPreferences', () => {
  it('returns null when there is no source run', () => {
    expect(resolveInheritedAnimationPreferences(null, 's1')).toBeNull()
    expect(resolveInheritedAnimationPreferences(undefined, 's1')).toBeNull()
  })

  it('returns null when the source run belongs to another session', () => {
    const run: AnimationPreferenceSourceRun = {
      session_id: 'other',
      animation_preferences: JSON.stringify({ ids: ['fade-up'] })
    }
    expect(resolveInheritedAnimationPreferences(run, 's1')).toBeNull()
  })

  it('inherits normalized preferences from a session-owned run', () => {
    const run: AnimationPreferenceSourceRun = {
      session_id: 's1',
      animation_preferences: JSON.stringify({ ids: ['fade-up', 'fade-up', 'wipe'] })
    }
    expect(resolveInheritedAnimationPreferences(run, 's1')).toEqual({
      ids: ['fade-up', 'wipe']
    })
  })

  it('returns null when the session-owned run has no stored preferences', () => {
    const run: AnimationPreferenceSourceRun = {
      session_id: 's1',
      animation_preferences: null
    }
    expect(resolveInheritedAnimationPreferences(run, 's1')).toBeNull()
  })

  it('returns null on malformed stored preferences instead of throwing', () => {
    const run: AnimationPreferenceSourceRun = {
      session_id: 's1',
      animation_preferences: '{not json'
    }
    expect(() => resolveInheritedAnimationPreferences(run, 's1')).not.toThrow()
    expect(resolveInheritedAnimationPreferences(run, 's1')).toBeNull()
  })
})
