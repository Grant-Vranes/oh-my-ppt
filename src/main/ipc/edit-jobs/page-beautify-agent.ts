import { tool } from '@langchain/core/tools'
import { createDeepAgent, FilesystemBackend, type EditResult, type WriteResult } from 'deepagents'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { resolveModel } from '../../agent'
import { validateHtmlContent } from '../../tools/html-utils'
import { attachProductSkillsBackend } from '../../skills/product-skills-backend'
import type { RequiredProductSkillName } from '../../skills/skill-contract'
import { resolveModelTimeoutMs, type ModelTimeoutProfile } from '@shared/model-timeout'
import {
  buildPageBeautifyCanvasContract,
  buildPageBeautifySystemPrompt,
  type PageBeautifyPromptArgs
} from './page-beautify-prompt'

export { buildPageBeautifySystemPrompt } from './page-beautify-prompt'

// Applied only when the selected model configuration supports temperature. Beautify
// needs enough latitude to materially recompose an overcrowded page instead of
// preserving the existing layout with superficial class changes.
const PAGE_BEAUTIFY_TEMPERATURE = 0.5

// LangChain's `createAgent` accepts the chat model produced here, but the project's
// resolveModel return type is narrower than BaseChatModel in some introspection
// paths. This keeps the interface honest without a broader resolveModel refactor.
type AgentModel = ReturnType<typeof resolveModel>

export type PageBeautifyAgentArgs = PageBeautifyPromptArgs & {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens: number
  modelTimeoutMs: Record<ModelTimeoutProfile, number>
  signal: AbortSignal
  // Absolute path to the persisted page HTML on disk. The agent reads this file
  // in full (head + body + inline scripts/styles) so it can reason about fonts,
  // global CSS, root background, and embedded chart data before beautifying.
  targetHtmlPath: string
  // Monotonic 0..1 progress hint. Emitted on every agent stream update so the
  // caller can render a smooth progress bar; capped under 0.85 because the
  // final 15% belongs to post-agent work (validate, write, commit, persist).
  onProgress?: (ratio: number) => void
  // Set only for the single host-validation retry. The page on disk is unchanged,
  // so the agent can reread it and correct the rejected candidate from scratch.
  retryFeedback?: string
}

// Backend that rejects every write/edit. Beautify's only persist path is the
// save_current_page_content tool, which validates and stores the fragment in
// memory. Letting the model edit the page file directly would bypass content
// manifest guards, so the filesystem tools are read-only by construction.
class ReadOnlyProjectBackend extends FilesystemBackend {
  async write(filePath: string, _content: string): Promise<WriteResult> {
    return { error: `Beautify is read-only: write_file is disabled (${filePath})` }
  }
  async edit(
    filePath: string,
    _oldString: string,
    _newString: string,
    _replaceAll?: boolean
  ): Promise<EditResult> {
    return { error: `Beautify is read-only: edit_file is disabled (${filePath})` }
  }
}

type StreamUpdateChunk = [namespace: unknown, mode: string, data: unknown]

const isUpdatesChunk = (chunk: unknown): chunk is StreamUpdateChunk =>
  Array.isArray(chunk) &&
  chunk.length >= 3 &&
  typeof chunk[1] === 'string' &&
  chunk[1] === 'updates'

const inferCancellationReason = (
  error: unknown,
  timeoutMs: number,
  userSignal: AbortSignal
): 'cancelled' | 'timeout' | null => {
  if (userSignal.aborted) return 'cancelled'
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout'
  if (/timed?\s*out|aborted|cancel/i.test(message)) return 'timeout'
  // Heuristic: if the failure happened close to the wall-clock budget and the message
  // looks like a transport error, treat it as a timeout so the user gets a clearer hint.
  void timeoutMs
  return null
}

export async function runPageBeautifyAgent(args: PageBeautifyAgentArgs): Promise<string> {
  let hasReadCurrentPage = false
  let savedContent: string | null = null
  let savedReported = false
  let modelUpdateCount = 0
  const canvasContract = buildPageBeautifyCanvasContract(args.slideSize)

  // Beautify uses the same DeepAgents + product-skills machinery as the deck/edit
  // pipelines: a read-only project backend plus attachProductSkillsBackend, which
  // mounts the layout skill for this slide size and injects the skill-index into
  // the system prompt. The model then `read_file`s SKILL.md / references on demand.
  const projectBackend = new ReadOnlyProjectBackend({
    rootDir: path.dirname(args.targetHtmlPath),
    virtualMode: true
  })
  const requiredSkillNames: readonly RequiredProductSkillName[] = [args.layoutSkillName]
  const agentBackend = attachProductSkillsBackend(projectBackend, 'page-beautify', requiredSkillNames)

  const agent = createDeepAgent({
    model: resolveModel(
      args.provider,
      args.apiKey,
      args.model,
      args.baseUrl,
      PAGE_BEAUTIFY_TEMPERATURE,
      args.maxTokens
    ) as AgentModel,
    backend: agentBackend.backend,
    middleware: agentBackend.middleware as any,
    tools: [
      tool(
        async () => {
          if (hasReadCurrentPage) {
            return 'You have already read the full page HTML. Proceed directly to beautifying and saving the updated .ppt-page-content fragment.'
          }
          hasReadCurrentPage = true
          // Read the full persisted page HTML (head + body + inline scripts/styles)
          // so the model can reason about fonts, global CSS, root background, and
          // embedded chart data. The save tool still only accepts the inner
          // .ppt-page-content fragment, so the shell stays immutable in practice.
          const html = await fs.promises.readFile(args.targetHtmlPath, 'utf-8')
          return `${canvasContract}\n\n## Current persisted page HTML\n${html}`
        },
        {
          name: 'read_page_html',
          description:
            'Read the complete persisted HTML of the selected current page (head, body, inline styles, scripts, and chart data). Call this once to understand the page context before beautifying.',
          schema: z.object({})
        }
      ),
      tool(
        async (input: { content: string }) => {
          if (!hasReadCurrentPage) {
            return 'Call read_page_html before saving the page.'
          }
          if (savedContent !== null) {
            return 'The page has already been submitted. Do not save it again.'
          }
          const validation = validateHtmlContent(input.content)
          if (!validation.valid) {
            return `The page fragment was rejected: ${validation.errors.join('；')}。修正后再次调用 save_current_page_content。`
          }
          savedContent = input.content
          return 'The current-page content fragment was submitted for host validation.'
        },
        {
          name: 'save_current_page_content',
          description:
            'Submit the complete beautified creative HTML fragment for the selected current page. The host preserves and reuses the injected page shell.',
          schema: z.object({
            content: z.string().min(1).describe('Complete creative HTML fragment for the current page')
          })
        }
      )
    ],
    systemPrompt: buildPageBeautifySystemPrompt(args)
  })
  const timeoutMs = resolveModelTimeoutMs(args.modelTimeoutMs.agent, 'agent')
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
  const streamSignal = AbortSignal.any([timeoutController.signal, args.signal])

  let stream: AsyncIterable<unknown>
  try {
    stream = await agent.stream(
      {
        messages: [
          {
            role: 'user',
            content: args.retryFeedback
              ? `${canvasContract}\n\nThe previous candidate was rejected by host validation: ${args.retryFeedback}\n\nThis is your one correction retry. Produce a visibly new creative version of the page within the selected style, not a text or formatting-only correction. Read the layout skill and page HTML again, re-layout and audit the finished composition for fit, hierarchy, overlap, and clipping, then submit only the complete fragment.`
              : `${canvasContract}${args.layoutAudit ? `\n\nThe current page's browser-measured layout audit is in your system instructions. Resolve every reported defect.` : ''}\n\nProduce a visibly new creative version of the selected current page within its established style. This is not proofreading: do not submit a text, number-format, comment, animation, attribute, color, or isolated CSS-only change. Read the layout skill first, then the page HTML, re-layout and audit the finished composition for fit, hierarchy, overlap, and clipping, then submit only the complete fragment.`
          }
        ]
      },
      {
        streamMode: ['updates', 'messages'],
        subgraphs: true,
        signal: streamSignal
      }
    )
  } catch (error) {
    clearTimeout(timer)
    const reason = inferCancellationReason(error, timeoutMs, args.signal)
    if (reason === 'cancelled') throw new Error('生成已取消')
    if (reason === 'timeout')
      throw new Error(`模型响应超时（${Math.round(timeoutMs / 1000)}s），请重试。`)
    throw error
  }

  // Heartbeat: the agent goes silent while the model reads the (large) page HTML and waits
  // for first-token. During that window there are no `updates` chunks, so the asymptotic
  // formula below would never fire and the bar would freeze at 20% for 10–30s. This timer
  // pushes progress forward based on elapsed wall-clock until the first real model update
  // arrives, then stops. Capped at 0.4 so model-update-driven progress always overtakes it.
  let heartbeatRatio = 0
  const heartbeatStartedAt = Date.now()
  const heartbeat = setInterval(() => {
    if (modelUpdateCount > 0 || savedContent !== null) return
    const elapsedMs = Date.now() - heartbeatStartedAt
    // Ease toward 0.4 with a 1/(1+t) curve: fast early movement, gentle near the cap.
    heartbeatRatio = Math.min(0.4, 0.4 - 0.4 / (1 + elapsedMs / 4000))
    if (heartbeatRatio > 0.02) args.onProgress?.(heartbeatRatio)
  }, 800)

  try {
    for await (const chunk of stream as AsyncIterable<unknown>) {
      if (!isUpdatesChunk(chunk)) continue
      const updates = chunk[2]
      if (!updates || typeof updates !== 'object' || !('model' in updates)) continue

      // Once the agent has called save_current_page_content we know authoring is
      // done; jump to the post-agent ceiling regardless of further chunks.
      if (savedContent !== null) {
        if (!savedReported) {
          savedReported = true
          args.onProgress?.(0.82)
        }
        continue
      }
      modelUpdateCount += 1
      // Asymptotic growth inside (0.25, 0.75): each model update advances a bit
      // less, so a long iteration still converges instead of pinning at the cap.
      // The floor of 0.25 guarantees the first real update overtakes the heartbeat
      // (which is capped at 0.4) once model output starts flowing.
      const ratio = Math.min(0.75, 0.25 + (1 - 1 / (modelUpdateCount + 1)) * 0.5)
      args.onProgress?.(Math.max(ratio, heartbeatRatio))
    }
  } catch (error) {
    const reason = inferCancellationReason(error, timeoutMs, args.signal)
    if (reason === 'cancelled') throw new Error('生成已取消')
    if (reason === 'timeout')
      throw new Error(`模型响应超时（${Math.round(timeoutMs / 1000)}s），请重试。`)
    throw error
  } finally {
    clearInterval(heartbeat)
    clearTimeout(timer)
  }

  if (!savedContent) throw new Error('一键美化未提交有效页面内容，请重试。')
  return savedContent
}
