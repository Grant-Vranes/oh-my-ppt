import { ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

const THINKING_WORKFLOW_TOOL_NAMES = new Set([
  'update_context_document',
  'update_thinking_document'
])

function readErrorChain(error: unknown): string {
  const messages: string[] = []
  const seen = new Set<object>()
  let current: unknown = error

  while (current && typeof current === 'object' && !seen.has(current as object)) {
    seen.add(current as object)
    const record = current as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : ''
    const message = typeof record.message === 'string' ? record.message : ''
    if (name || message) messages.push(`${name}: ${message}`)
    current = record.cause
  }

  return messages.join('\n')
}

export function isThinkingToolInputError(error: unknown): boolean {
  return /ToolInvocationError|ToolInputParsingException|Received tool input did not match expected schema/i.test(
    readErrorChain(error)
  )
}

export function createThinkingToolInputRecoveryMiddleware() {
  const recoveredToolNames = new Set<string>()

  return createMiddleware({
    name: 'thinkingToolInputRecovery',
    wrapToolCall: async (request, handler) => {
      try {
        return await handler(request)
      } catch (error) {
        const toolName = String(request.toolCall?.name || '')
        if (
          !THINKING_WORKFLOW_TOOL_NAMES.has(toolName) ||
          recoveredToolNames.has(toolName) ||
          !isThinkingToolInputError(error)
        ) {
          throw error
        }

        recoveredToolNames.add(toolName)
        return new ToolMessage({
          name: toolName,
          tool_call_id: String(request.toolCall?.id || ''),
          status: 'error',
          content: [
            error instanceof Error ? error.message : String(error),
            'Fix the tool arguments so they match the declared schema, then call the same tool again.'
          ].join('\n\n')
        })
      }
    }
  })
}
