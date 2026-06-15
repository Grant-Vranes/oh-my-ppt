import { describe, expect, it } from 'vitest'
import { validateHtmlContent } from '../../src/main/tools/html-utils'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('PR#107 Integration Tests - Real File Validation', () => {
  it('validates the complete test-animation-pr107 fragment', () => {
    const testHtml = readFileSync(join(__dirname, '../../test-animation-pr107-fragment.html'), 'utf-8')
    const result = validateHtmlContent(testHtml)

    if (!result.valid) {
      console.log('Validation errors:', result.errors)
    }

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

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
