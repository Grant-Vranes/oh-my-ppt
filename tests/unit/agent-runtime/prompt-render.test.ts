import { describe, expect, it } from 'vitest'
import { createPromptCatalog } from '../../../src/main/agent-runtime/prompt/catalog'
import { renderPromptTemplate } from '../../../src/main/agent-runtime/prompt/render'

describe('prompt template rendering', () => {
  it('renders every declared scalar placeholder', () => {
    expect(renderPromptTemplate('Topic: {{ topic }} / count={{count}}', { topic: 'AI', count: 3 })).toBe(
      'Topic: AI / count=3'
    )
  })

  it('rejects missing, unknown and malformed placeholders', () => {
    expect(() => renderPromptTemplate('Hello {{name}}', {})).toThrow('missing variables: name')
    expect(() => renderPromptTemplate('Hello {{name}}', { name: 'Ada', typo: 'x' })).toThrow(
      'unknown variables: typo'
    )
    expect(() => renderPromptTemplate('Hello {{ }}', {})).toThrow('invalid or unresolved')
  })

  it('binds a prompt id to its typed variable shape', () => {
    const catalog = createPromptCatalog<{ greeting: { name: string }; count: { total: number } }>({
      greeting: 'Hello {{name}}',
      count: 'Total {{total}}'
    })

    expect(catalog.render('greeting', { name: 'Ada' })).toBe('Hello Ada')
    expect(catalog.render('count', { total: 2 })).toBe('Total 2')
  })
})
