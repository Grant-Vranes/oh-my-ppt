export type PromptTemplateVars = Record<string, string | number | boolean>

const PLACEHOLDER_RE = /{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g
const RESIDUAL_PLACEHOLDER_RE = /{{[^{}]*}}/

const collectPlaceholderNames = (template: string): Set<string> => {
  const names = new Set<string>()
  PLACEHOLDER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
    names.add(match[1])
  }
  return names
}

/**
 * Render a static prompt template. Composition (branches, arrays and JSON) stays
 * in TypeScript composers; this function deliberately supports scalar replacement
 * only so typos fail before a request reaches a model.
 */
export const renderPromptTemplate = (template: string, vars: PromptTemplateVars): string => {
  const expected = collectPlaceholderNames(template)
  const unknown = Object.keys(vars).filter((key) => !expected.has(key))
  if (unknown.length > 0) {
    throw new Error(`Prompt template received unknown variables: ${unknown.join(', ')}`)
  }

  const missing = Array.from(expected).filter(
    (key) => !Object.prototype.hasOwnProperty.call(vars, key)
  )
  if (missing.length > 0) {
    throw new Error(`Prompt template is missing variables: ${missing.join(', ')}`)
  }

  const rendered = template.replace(PLACEHOLDER_RE, (_match, key: string) => String(vars[key]))
  if (RESIDUAL_PLACEHOLDER_RE.test(rendered)) {
    throw new Error('Prompt template contains an invalid or unresolved {{...}} placeholder')
  }
  return rendered
}
