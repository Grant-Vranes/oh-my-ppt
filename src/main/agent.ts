// Thinking compatibility facade. Keep this model-only so Thinking does not load
// DeepAgent factories, page tools, prompts, or product-skill adapters.
export { resolveModel } from './agent-runtime/model/resolve'
export type { ModelRuntimeConfig } from './agent-runtime/model/usage'
