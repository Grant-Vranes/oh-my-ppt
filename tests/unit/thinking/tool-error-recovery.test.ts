import { ToolMessage } from '@langchain/core/messages'
import { describe, expect, it, vi } from 'vitest'
import {
  createThinkingToolInputRecoveryMiddleware,
  isThinkingToolInputError
} from '../../../src/main/thinking/tool-error-recovery'

type ToolHandler = (request: Record<string, unknown>) => Promise<ToolMessage>

describe('thinking tool input recovery', () => {
  it('recognizes workflow tool schema validation errors', () => {
    expect(
      isThinkingToolInputError(
        new Error(
          'Error invoking tool update_context_document: Received tool input did not match expected schema'
        )
      )
    ).toBe(true)
    expect(isThinkingToolInputError(new Error('disk write failed'))).toBe(false)
  })

  it('returns the first schema error to the model so it can correct the arguments', async () => {
    const middleware = createThinkingToolInputRecoveryMiddleware()
    const wrapToolCall = middleware.wrapToolCall as unknown as (
      request: Record<string, unknown>,
      handler: ToolHandler
    ) => Promise<ToolMessage>
    const parsingError = new Error('Received tool input did not match expected schema')
    const handler = vi.fn<ToolHandler>().mockRejectedValue(parsingError)
    const request = {
      toolCall: {
        name: 'update_context_document',
        id: 'call-1'
      }
    }

    const result = await wrapToolCall(request, handler)

    expect(ToolMessage.isInstance(result)).toBe(true)
    expect(result.status).toBe('error')
    expect(result.tool_call_id).toBe('call-1')
    expect(String(result.content)).toContain('match the declared schema')
    await expect(wrapToolCall(request, handler)).rejects.toBe(parsingError)
  })

  it('does not swallow non-schema errors or errors from unrelated tools', async () => {
    const middleware = createThinkingToolInputRecoveryMiddleware()
    const wrapToolCall = middleware.wrapToolCall as unknown as (
      request: Record<string, unknown>,
      handler: ToolHandler
    ) => Promise<ToolMessage>
    const runtimeError = new Error('disk write failed')
    const schemaError = new Error('Received tool input did not match expected schema')

    await expect(
      wrapToolCall(
        { toolCall: { name: 'update_context_document', id: 'call-1' } },
        vi.fn<ToolHandler>().mockRejectedValue(runtimeError)
      )
    ).rejects.toBe(runtimeError)
    await expect(
      wrapToolCall(
        { toolCall: { name: 'read_file', id: 'call-2' } },
        vi.fn<ToolHandler>().mockRejectedValue(schemaError)
      )
    ).rejects.toBe(schemaError)
  })
})
