import { renderPromptTemplate, type PromptTemplateVars } from './render'

export type PromptCatalog<PromptVarsById extends Record<string, PromptTemplateVars>> = {
  render<I extends keyof PromptVarsById & string>(id: I, vars: PromptVarsById[I]): string
}

/**
 * Creates a catalog whose prompt id determines the allowed variable shape.
 * Templates remain static strings; callers use a composer before this boundary
 * when a prompt needs conditionals, arrays or JSON serialization.
 */
export const createPromptCatalog = <PromptVarsById extends Record<string, PromptTemplateVars>>(
  templates: { [I in keyof PromptVarsById]: string }
): PromptCatalog<PromptVarsById> => ({
  render<I extends keyof PromptVarsById & string>(id: I, vars: PromptVarsById[I]): string {
    return renderPromptTemplate(templates[id], vars)
  }
})
