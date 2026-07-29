import { describe, expect, it } from 'vitest'
import { normalizeSelectedElementRuntimeContext } from '../../../src/main/generation/context'

describe('normalizeSelectedElementRuntimeContext', () => {
  it('accepts only the bounded safe property subset before an agent sees it', () => {
    expect(
      normalizeSelectedElementRuntimeContext({
        classList: ['metric-card', 'arcsin1-presentation-editor-selected'],
        attributes: {
          'data-block-id': 'revenue-card',
          onclick: 'ignore this',
          srcdoc: '<script>bad()</script>'
        },
        inlineStyle: {
          color: { value: '#18324a', priority: 'important' },
          'bad property': { value: 'ignore' }
        },
        computedStyle: {
          display: 'grid',
          'border-radius': '16px',
          cursor: 'pointer'
        },
        bounds: { x: -999999, y: 3.456, width: 450.123, height: -20 }
      })
    ).toEqual({
      classList: ['metric-card'],
      attributes: { 'data-block-id': 'revenue-card' },
      inlineStyle: { color: { value: '#18324a', priority: 'important' } },
      computedStyle: { display: 'grid', 'border-radius': '16px' },
      bounds: { x: -100000, y: 3.46, width: 450.12, height: 0 }
    })
  })
})
