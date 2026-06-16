import { describe, expect, it } from 'vitest'
import { validateHtmlContent } from '../../src/main/tools/html-utils'

describe('PR#107 Integration Tests - Animation Attribute Validation', () => {
  it('correctly accepts data-anim-sequence="with"', () => {
    const html = '<div data-anim="fade" data-anim-sequence="with" data-anim-delay="100">Test</div>'
    const result = validateHtmlContent(html)
    expect(result.valid).toBe(true)
  })

  it('correctly accepts data-anim-sequence="after"', () => {
    const html = '<div data-anim="fade-up" data-anim-sequence="after">Test</div>'
    const result = validateHtmlContent(html)
    expect(result.valid).toBe(true)
  })

  it('correctly accepts data-anim-stagger', () => {
    const html = '<div data-anim="fade-up" data-anim-stagger="90">Test</div>'
    const result = validateHtmlContent(html)
    expect(result.valid).toBe(true)
  })
})
