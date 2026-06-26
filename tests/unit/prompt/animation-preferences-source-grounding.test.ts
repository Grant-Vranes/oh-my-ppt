import { describe, expect, it } from 'vitest'
import {
  buildDesignContractUserPrompt,
  buildPlanningUserPrompt
} from '../../../src/main/prompt/runtime-user'

// Markers that only ever come from formatAnimationPreferencesForPageWriting.
// Their absence in upstream prompts proves animation preferences never leak
// into outline planning or the design contract (the feature's core boundary).
const ANIMATION_PREFERENCE_MARKERS = [
  'Animation preferences for page writing only',
  'data-anim-stagger',
  'pulse-soft',
  'animate the chart container only'
] as const

describe('animation preferences do not leak into planning or design prompts', () => {
  it('buildPlanningUserPrompt omits animation-preference guidance', () => {
    const prompt = buildPlanningUserPrompt({
      topic: 'Quarterly report',
      totalPages: 6,
      userMessage: 'Keep it concise and visually clear.',
      hasSourceMaterials: false
    })

    for (const marker of ANIMATION_PREFERENCE_MARKERS) {
      expect(prompt).not.toContain(marker)
    }
  })

  it('buildDesignContractUserPrompt omits animation-preference guidance', () => {
    const prompt = buildDesignContractUserPrompt()

    for (const marker of ANIMATION_PREFERENCE_MARKERS) {
      expect(prompt).not.toContain(marker)
    }
  })
})
