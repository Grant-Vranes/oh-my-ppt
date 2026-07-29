import { describe, expect, it } from 'vitest'
import { buildPlanningSystemPrompt } from '../../../src/main/agent-runtime/prompt'

describe('planning prompt composer', () => {
  it('renders the static planning instructions from the Markdown template', () => {
    const prompt = buildPlanningSystemPrompt(7)

    expect(prompt).toContain('Return exactly 7 slide plans. The JSON array length must equal 7.')
    expect(prompt).toContain('Never return fewer or more than 7 items.')
    expect(prompt).toContain('if the material does not naturally fill 7 slides')
    expect(prompt).toContain('## Content language')
    expect(prompt).toContain('Each item must use exactly these fields: title, keyPoints, and layoutIntent.')
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/)
  })
})
