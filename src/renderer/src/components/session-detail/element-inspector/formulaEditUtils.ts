import katex from 'katex'

export interface FormulaRenderResult {
  html: string
  error: string | null
}

export function renderFormulaToHtml(latex: string, displayMode: boolean): FormulaRenderResult {
  const source = latex.trim()
  if (!source) return { html: '', error: null }
  try {
    return {
      html: katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        strict: false,
        trust: false,
        output: 'htmlAndMathml'
      }),
      error: null
    }
  } catch (error) {
    return {
      html: '',
      error: error instanceof Error ? error.message : 'Invalid formula'
    }
  }
}
