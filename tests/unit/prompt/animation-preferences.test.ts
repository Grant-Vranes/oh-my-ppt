import { describe, expect, it } from 'vitest'
import {
  buildDeckAgentSystemPrompt,
  buildSinglePageGenerationPrompt,
  formatAnimationPreferencesForPageWriting
} from '../../../src/main/prompt'
import type { SessionDeckGenerationContext } from '../../../src/main/tools/types'
import { resolveSlideSize } from '../../../src/shared/slide-size'

const baseContext: SessionDeckGenerationContext = {
  sessionId: 'session-1',
  projectDir: '/tmp/project',
  indexPath: '/tmp/project/index.html',
  pageFileMap: { 'page-1': '/tmp/project/page-1.html' },
  topic: 'Quarterly report',
  deckTitle: 'Quarterly report',
  styleId: 'test-style',
  styleSkillPrompt: 'Use a clean business style.',
  userMessage: 'Create a quarterly report.',
  outlineTitles: ['Overview'],
  outlineItems: [{ title: 'Overview', contentOutline: 'Summarize the quarter.' }],
  slideSize: resolveSlideSize({ id: 'wide-16-9' }),
  appLocale: 'en'
}

describe('animation preferences prompt', () => {
  it('formats selected preferences as page-writing-only guidance', () => {
    const prompt = formatAnimationPreferencesForPageWriting({
      ids: ['fade-up', 'wipe', 'pulse-soft']
    })

    expect(prompt).toContain('oh-my-ppt-data-anim')
    expect(prompt).toContain('Do not change slide outline, page count, slide titles')
    expect(prompt).toContain('data-anim="fade-up"')
    expect(prompt).toContain('data-anim="wipe"')
    expect(prompt).toContain('data-anim="pulse-soft"')
    expect(prompt).not.toContain('process')
  })

  it('does not emit an addendum for empty preferences', () => {
    expect(formatAnimationPreferencesForPageWriting(null)).toBe('')
    expect(formatAnimationPreferencesForPageWriting({ ids: [] })).toBe('')
  })

  it('injects animation preferences into the deck system prompt only', () => {
    const deckPrompt = buildDeckAgentSystemPrompt('test-style', {
      ...baseContext,
      animationPreferences: { ids: ['fade'] }
    })
    const pagePrompt = buildSinglePageGenerationPrompt({
      topic: 'Quarterly report',
      deckTitle: 'Quarterly report',
      pageId: 'page-1',
      pageNumber: 1,
      pageTitle: 'Overview',
      pageOutline: 'Summarize the quarter.',
      slideSize: baseContext.slideSize
    })

    expect(deckPrompt).toContain('## Animation preferences for page writing only')
    expect(deckPrompt).toContain('data-anim="fade"')
    expect(pagePrompt).not.toContain('Animation preferences for page writing only')
    expect(pagePrompt).not.toContain('quiet text blocks')
  })
})
