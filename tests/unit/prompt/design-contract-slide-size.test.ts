import { describe, expect, it } from 'vitest'
import { buildDesignContractSystemPrompt } from '../../../src/main/prompt/planning'
import { resolveSlideSize } from '../../../src/shared/slide-size'

describe('size-aware design contract prompt', () => {
  it('uses the exact target size to adapt layoutMotif without injecting layout skills', () => {
    const prompt = buildDesignContractSystemPrompt({
      styleSkill: 'A blue editorial style originally observed on a 16:9 canvas.',
      slideSize: resolveSlideSize({
        id: 'vertical-9-16',
        width: 1080,
        height: 1920
      })
    })

    expect(prompt).toContain('Slide size id: vertical-9-16')
    expect(prompt).toContain('Exact dimensions: 1080x1920')
    expect(prompt).toContain('Generate layoutMotif for this exact canvas')
    expect(prompt).toContain(
      'layoutMotif must combine the style specification with the exact target canvas above'
    )
    expect(prompt).not.toContain('layout-skill')
    expect(prompt).not.toContain('catalog')
    expect(prompt).not.toContain('checklist')
  })

  it('keeps square dimensions explicit for a square design contract', () => {
    const prompt = buildDesignContractSystemPrompt({
      styleSkill: 'Use restrained monochrome geometry.',
      slideSize: resolveSlideSize({ id: 'square-1-1' })
    })

    expect(prompt).toContain('Slide size id: square-1-1')
    expect(prompt).toContain('Exact dimensions: 1200x1200')
  })
})
