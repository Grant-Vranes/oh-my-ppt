import fs from 'fs'
import path from 'path'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { writeContextMd, writeThinkingMd } from './workspace'
import { isValidTransition, VALID_TRANSITIONS } from './stage-manager'
import type { ThinkingStage } from '@shared/thinking'

const THINKING_STAGES = ['collect', 'outline', 'draft', 'refine', 'ready'] as const

export interface ThinkingWorkflowState {
  contextUpdated: boolean
  thinkingUpdated: boolean
  thinkingStaged: boolean
  contextUpdateCount: number
  thinkingUpdateCount: number
  requestedStage: ThinkingStage | null
}

export type StagedThinkingFinalizeResult =
  | { status: 'none' }
  | { status: 'incomplete'; reason: string; pageCount: number; expectedPageCount: number | null }
  | { status: 'committed'; length: number; pageCount: number }
  | { status: 'discarded'; reason: string; pageCount: number; expectedPageCount: number | null }

const pageRoleSchema = z.enum(['cover', 'section', 'content', 'case', 'comparison', 'data', 'summary'])

const contextDecisionSchema = z.union([
  z.string(),
  z.record(z.string(), z.coerce.string())
])

const contextDocumentSchema = z.object({
  topic: z.string().optional().describe('Presentation topic when known.'),
  userIntent: z
    .string()
    .optional()
    .describe('Short markdown summary of what the user wants and what has been learned.'),
  confirmedDecisions: z
    .array(contextDecisionSchema)
    .optional()
    .describe(
      'Confirmed durable decisions. Each item may be a concise string or a flat key-value object. Omit to preserve existing decisions; pass [] to clear them. Do not include guesses.'
    ),
  openQuestions: z
    .array(z.string())
    .optional()
    .describe(
      'Only unresolved questions that still matter. Omit to preserve existing questions; pass [] to clear them.'
    ),
  sourceNotes: z
    .array(z.string())
    .optional()
    .describe(
      'Facts or observations from uploaded/source materials. Omit to preserve existing notes; pass [] to clear them.'
    ),
  latestDirection: z
    .string()
    .optional()
    .describe('Latest user message or direction, summarized without tool chatter.'),
  stage: z
    .enum(THINKING_STAGES)
    .optional()
    .describe(
      'Transition to this stage. Only set when the user explicitly requests or when requirements for the next stage are met.'
    )
})

const thinkingDocumentSchema = z.object({
  topic: z.string().optional(),
  audience: z.string().optional(),
  setting: z.string().optional(),
  tone: z.string().optional(),
  keyDecisions: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  style: z.string().optional(),
  font: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe('Font preference. Use "auto" or a FontSelection JSON object with mode/title/body.'),
  pageCount: z.coerce.number().int().positive().optional(),
  pageStart: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'When passing a page batch, this is the 1-based page number for the first item in pages. With pageStart, pages is merged into an in-memory draft and is not written to thinking.md until commit is true.'
    ),
  commit: z
    .boolean()
    .optional()
    .describe(
      'Set true on the final page batch to write the fully merged in-memory thinking document to thinking.md. For pageStart batches, omit/false means stage only.'
    ),
  pages: z
    .array(
      z.object({
        title: z.string().min(1),
        role: pageRoleSchema.describe('Page role in the narrative structure.'),
        objective: z.string().min(1).describe('What this page must accomplish for the audience.'),
        summary: z.string().min(1),
        keyPoints: z.array(z.string().min(1)).min(1)
      })
    )
    .optional()
    .describe('Ordered slide/page plan. If pageStart is omitted, pages replaces all existing pages immediately. If pageStart is provided, pages is staged as a batch until commit is true.')
})

type ContextDocumentInput = z.infer<typeof contextDocumentSchema>
type ThinkingDocumentInput = z.infer<typeof thinkingDocumentSchema>

const THINKING_SECTION_ORDER = [
  'Topic',
  'Audience',
  'Setting',
  'Tone',
  'Key Decisions',
  'Open Questions',
  'Style',
  'Font',
  'Page Count'
]

function bulletList(items: string[] | undefined): string {
  return (items || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('- ') ? item : `- ${item}`))
    .join('\n')
}

function contextDecisionList(items: ContextDocumentInput['confirmedDecisions']): string {
  return (items || [])
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      return Object.entries(item)
        .map(([key, value]) => `${key.trim()}: ${value.trim()}`)
        .filter((item) => !item.endsWith(': '))
        .join('；')
    })
    .filter(Boolean)
    .map((item) => (item.startsWith('- ') ? item : `- ${item}`))
    .join('\n')
}

function optionalSection(title: string, content: string | undefined): string {
  const value = content?.trim()
  return value ? `## ${title}\n${value}\n\n` : ''
}

function upsertSection(markdown: string, heading: string, content: string): string {
  const normalizedContent = content.trim()
  if (!normalizedContent) return markdown
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRegex = new RegExp(`^##\\s*${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`, 'm')
  const nextSection = `## ${heading}\n${normalizedContent}\n\n`
  if (sectionRegex.test(markdown)) {
    return markdown.replace(sectionRegex, nextSection.trimEnd() + '\n\n')
  }

  for (let index = THINKING_SECTION_ORDER.indexOf(heading) - 1; index >= 0; index -= 1) {
    const previous = THINKING_SECTION_ORDER[index]
    const previousRegex = new RegExp(
      `^##\\s*${previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`,
      'm'
    )
    const match = markdown.match(previousRegex)
    if (match?.[0]) {
      const insertAt = (match.index || 0) + match[0].length
      return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
    }
  }

  const titleMatch = markdown.match(/^# .+$/m)
  if (titleMatch) {
    const insertAt = (titleMatch.index || 0) + titleMatch[0].length
    return `${markdown.slice(0, insertAt).trimEnd()}\n\n${nextSection}${markdown.slice(insertAt).trimStart()}`
  }
  return `# Thinking Brief\n\n${nextSection}${markdown.trim()}`
}

function stripPageSections(markdown: string): string {
  return markdown.replace(/\n*##\s*Page\s+\d+\s*:[\s\S]*$/m, '').trimEnd() + '\n'
}

type ThinkingPageInput = {
  title: string
  role: z.infer<typeof pageRoleSchema>
  objective: string
  summary: string
  keyPoints: string[]
}

function buildPageSection(page: ThinkingPageInput, pageNumber: number): string {
  const title = page.title.trim()
  const role = page.role.trim()
  const objective = page.objective.trim()
  const summary = page.summary.trim()
  const keyPoints = bulletList(page.keyPoints)

  if (!title) {
    throw new Error(`Page ${pageNumber} must have a real title.`)
  }
  if (!role) {
    throw new Error(`Page ${pageNumber} must have a role.`)
  }
  if (!objective) {
    throw new Error(`Page ${pageNumber} must have an objective.`)
  }
  if (!summary) {
    throw new Error(`Page ${pageNumber} must have a non-empty summary. Do not write placeholder pages.`)
  }
  if (!keyPoints) {
    throw new Error(`Page ${pageNumber} must include substantive keyPoints. Do not write placeholder pages.`)
  }

  return [
    `## Page ${pageNumber}: ${title}`,
    `- Role: ${role}`,
    `- Objective: ${objective}`,
    '',
    summary,
    '',
    keyPoints,
    ''
  ].join('\n')
}

function buildPageSections(
  pages: ThinkingPageInput[],
  startPageNumber = 1
): string {
  return pages
    .map((page, index) => buildPageSection(page, startPageNumber + index))
    .join('\n')
    .trimEnd()
}

function getPageSectionEntries(markdown: string): Array<{
  pageNumber: number
  content: string
}> {
  const headingRegex = /^##\s*Page\s+(\d+)\s*:/gm
  const headings = Array.from(markdown.matchAll(headingRegex))
  return headings.flatMap((heading, index) => {
    const pageNumber = Number.parseInt(heading[1], 10)
    if (!Number.isFinite(pageNumber)) return []
    const start = heading.index || 0
    const next = headings[index + 1]
    const end = typeof next?.index === 'number' ? next.index : markdown.length
    return [{ pageNumber, content: markdown.slice(start, end).trimEnd() }]
  })
}

function mergePageBatch(
  markdown: string,
  pages: ThinkingPageInput[],
  pageStart: number
): string {
  const existingPages = new Map<number, string>()
  for (const entry of getPageSectionEntries(markdown)) {
    existingPages.set(entry.pageNumber, entry.content)
  }
  pages.forEach((page, index) => {
    const pageNumber = pageStart + index
    existingPages.set(pageNumber, buildPageSection(page, pageNumber).trimEnd())
  })

  const pageSections = Array.from(existingPages.entries())
    .sort(([a], [b]) => a - b)
    .map(([, content]) => content)
    .join('\n\n')

  return `${stripPageSections(markdown).trimEnd()}\n\n${pageSections}`.trimEnd()
}

function readMarkdownSection(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const inline = markdown.match(new RegExp(`^##\\s*${escaped}\\s*:\\s*(.+)`, 'm'))
  if (inline?.[1]?.trim()) return inline[1].trim()
  const block = markdown.match(
    new RegExp(`^##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'm')
  )
  return block?.[1]?.trim() || ''
}

function readDeclaredPageCount(markdown: string): number | null {
  const raw = readMarkdownSection(markdown, 'Page Count')
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

function hasCompletePageSection(pageSection: string): boolean {
  const hasTitle = /^##\s*Page\s+\d+\s*:\s*\S+/m.test(pageSection)
  const hasRole = /^-\s*Role:\s*\S+/mi.test(pageSection)
  const hasObjective = /^-\s*Objective:\s*\S+/mi.test(pageSection)
  const contentLines = pageSection
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^##\s*Page\s+\d+\s*:/i.test(line))
    .filter((line) => !/^-\s*(Role|Objective):/i.test(line))
  const hasSummary = contentLines.some((line) => !line.startsWith('- '))
  const hasKeyPoints = contentLines.some((line) => /^-\s+\S+/.test(line))
  return hasTitle && hasRole && hasObjective && hasSummary && hasKeyPoints
}

function resolveStagedCompletion(markdown: string): {
  complete: boolean
  reason: string
  pageCount: number
  expectedPageCount: number | null
} {
  const expectedPageCount = readDeclaredPageCount(markdown)
  const pages = getPageSectionEntries(markdown)
  if (!expectedPageCount) {
    return {
      complete: false,
      reason: 'missing page count',
      pageCount: pages.length,
      expectedPageCount
    }
  }

  const byNumber = new Map(pages.map((page) => [page.pageNumber, page.content]))
  for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 1) {
    const section = byNumber.get(pageNumber)
    if (!section) {
      return {
        complete: false,
        reason: `missing page ${pageNumber}`,
        pageCount: pages.length,
        expectedPageCount
      }
    }
    if (!hasCompletePageSection(section)) {
      return {
        complete: false,
        reason: `incomplete page ${pageNumber}`,
        pageCount: pages.length,
        expectedPageCount
      }
    }
  }

  return {
    complete: true,
    reason: 'complete',
    pageCount: pages.length,
    expectedPageCount
  }
}

async function readExistingThinkingMd(thinkingDir: string): Promise<string> {
  const filePath = path.join(thinkingDir, 'thinking.md')
  try {
    if (fs.existsSync(filePath)) {
      return fs.promises.readFile(filePath, 'utf-8')
    }
  } catch {
    // Fall through to a fresh document.
  }
  return '# Thinking Brief\n'
}

function formatFontSection(font: ThinkingDocumentInput['font']): string | undefined {
  if (typeof font === 'string') return font
  if (font && typeof font === 'object') return JSON.stringify(font)
  return undefined
}

function buildContextMd(args: {
  stage: ThinkingStage
  topic?: string
  userIntent?: string
  confirmedDecisions?: ContextDocumentInput['confirmedDecisions']
  openQuestions?: string[]
  latestDirection?: string
  sourceNotes?: string[]
}): string {
  const topic = args.topic?.trim()
  const confirmedDecisions = contextDecisionList(args.confirmedDecisions)
  const openQuestions = bulletList(args.openQuestions)
  const sourceNotes = bulletList(args.sourceNotes)
  const userIntent = args.userIntent?.trim() || (topic ? `- Topic: ${topic}` : '')

  return [
    `## Stage: ${args.stage}`,
    '',
    topic ? `## Topic\n${topic}\n` : '',
    optionalSection('User Intent', userIntent),
    optionalSection('Confirmed Decisions', confirmedDecisions),
    optionalSection('Open Questions', openQuestions),
    optionalSection('Source Notes', sourceNotes),
    optionalSection('Latest Direction', args.latestDirection)
  ]
    .join('\n')
    .trimEnd() + '\n'
}

function removeSection(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRegex = new RegExp(
    `^##\\s*${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s+|(?![\\s\\S]))`,
    'm'
  )
  return markdown.replace(sectionRegex, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function mergeContextMd(
  baseMarkdown: string,
  input: ContextDocumentInput,
  currentStage: ThinkingStage
): string {
  let next = baseMarkdown.trim() || `## Stage: ${currentStage}`
  if (/^## Stage:\s*\S+/m.test(next)) {
    next = next.replace(/^## Stage:\s*\S+/m, `## Stage: ${currentStage}`)
  } else {
    next = `## Stage: ${currentStage}\n\n${next}`
  }

  const updates: Array<[string, string | undefined]> = [
    ['Topic', input.topic],
    ['User Intent', input.userIntent],
    [
      'Confirmed Decisions',
      input.confirmedDecisions === undefined
        ? undefined
        : contextDecisionList(input.confirmedDecisions)
    ],
    [
      'Open Questions',
      input.openQuestions === undefined ? undefined : bulletList(input.openQuestions)
    ],
    [
      'Source Notes',
      input.sourceNotes === undefined ? undefined : bulletList(input.sourceNotes)
    ],
    ['Latest Direction', input.latestDirection]
  ]

  for (const [heading, content] of updates) {
    if (content === undefined) continue
    next = content.trim()
      ? upsertSection(next, heading, content)
      : removeSection(next, heading)
  }

  return next.trimEnd() + '\n'
}

async function mergeThinkingMdFromBase(
  baseMarkdown: string,
  input: ThinkingDocumentInput
): Promise<string> {
  let next = baseMarkdown.trim() || '# Thinking Brief'
  const pages = input.pages
  const pageStart = input.pageStart && input.pageStart > 0 ? input.pageStart : undefined
  const isPageBatch = Boolean(pageStart)

  const simpleSections: Array<[string, string | undefined]> = [
    ['Topic', input.topic],
    ['Audience', input.audience],
    ['Setting', input.setting],
    ['Tone', input.tone],
    ['Key Decisions', bulletList(input.keyDecisions)],
    ['Open Questions', bulletList(input.openQuestions)],
    ['Style', input.style],
    ['Font', formatFontSection(input.font)],
    [
      'Page Count',
      input.pageCount ? String(input.pageCount) : !isPageBatch && pages?.length ? String(pages.length) : undefined
    ]
  ]

  for (const [title, content] of simpleSections) {
    if (content?.trim()) {
      next = upsertSection(next, title, content)
    }
  }

  if (Array.isArray(pages)) {
    const pageSections = pageStart ? mergePageBatch(next, pages, pageStart) : buildPageSections(pages)
    if (pageSections) {
      next = pageStart ? pageSections : `${stripPageSections(next).trimEnd()}\n\n${pageSections}`
    }
  }

  return next.trimEnd() + '\n'
}

async function mergeThinkingMd(thinkingDir: string, input: ThinkingDocumentInput): Promise<string> {
  return mergeThinkingMdFromBase(await readExistingThinkingMd(thinkingDir), input)
}

export function createThinkingWorkflowTools(args: {
  thinkingDir: string
  currentStage: ThinkingStage
}): {
  tools: StructuredToolInterface[]
  state: ThinkingWorkflowState
  finalizeStagedThinkingDocument: (options?: {
    discardIncomplete?: boolean
  }) => Promise<StagedThinkingFinalizeResult>
} {
  const state: ThinkingWorkflowState = {
    contextUpdated: false,
    thinkingUpdated: false,
    thinkingStaged: false,
    contextUpdateCount: 0,
    thinkingUpdateCount: 0,
    requestedStage: null
  }
  let stagedThinkingMd: string | null = null

  const finalizeStagedThinkingDocument = async (
    options: { discardIncomplete?: boolean } = {}
  ): Promise<StagedThinkingFinalizeResult> => {
    if (!stagedThinkingMd) return { status: 'none' }

    const completion = resolveStagedCompletion(stagedThinkingMd)
    if (!completion.complete) {
      if (options.discardIncomplete === false) {
        return {
          status: 'incomplete',
          reason: completion.reason,
          pageCount: completion.pageCount,
          expectedPageCount: completion.expectedPageCount
        }
      }

      stagedThinkingMd = null
      state.thinkingStaged = false
      return {
        status: 'discarded',
        reason: completion.reason,
        pageCount: completion.pageCount,
        expectedPageCount: completion.expectedPageCount
      }
    }

    await writeThinkingMd(args.thinkingDir, stagedThinkingMd)
    state.thinkingUpdated = true
    state.thinkingStaged = false
    state.thinkingUpdateCount += 1
    const length = stagedThinkingMd.length
    stagedThinkingMd = null
    return {
      status: 'committed',
      length,
      pageCount: completion.expectedPageCount || completion.pageCount
    }
  }

  const updateContextDocument = tool(
    async (input: ContextDocumentInput & { stage?: ThinkingStage }) => {
      const requestedStage = input.stage
      let stageNote = ''
      if (requestedStage && isValidTransition(args.currentStage, requestedStage)) {
        state.requestedStage = requestedStage
      } else if (requestedStage) {
        const validTargets = VALID_TRANSITIONS[args.currentStage].join(', ')
        stageNote = ` Requested stage ${requestedStage} was ignored because it is not a valid transition from ${args.currentStage}. Valid targets: ${validTargets}.`
      }
      const contextPath = path.join(args.thinkingDir, 'context.md')
      const existingContext = fs.existsSync(contextPath)
        ? await fs.promises.readFile(contextPath, 'utf-8')
        : buildContextMd({ stage: args.currentStage })
      const content = mergeContextMd(existingContext, input, args.currentStage)
      await writeContextMd(args.thinkingDir, content)
      state.contextUpdated = true
      state.contextUpdateCount += 1
      return `context.md updated for stage ${args.currentStage}.${stageNote}`
    },
    {
      name: 'update_context_document',
      description:
        'Required thinking workflow tool. Merge rolling conversation memory into /context.md every turn: user intent, confirmed decisions, open questions, source notes, and latest direction. Omitted fields are preserved; pass an empty array only when a list section should be cleared. Optionally set `stage` to transition to a new stage when the user explicitly requests it or requirements for the next stage are met. Use this instead of write_file/edit_file for context.md.',
      schema: contextDocumentSchema
    }
  )

  const updateThinkingDocument = tool(
    async (input: ThinkingDocumentInput) => {
      const isPageBatch = Boolean(input.pageStart && input.pageStart > 0)
      if (isPageBatch) {
        const pageStart = input.pageStart as number
        const base = stagedThinkingMd ?? (await readExistingThinkingMd(args.thinkingDir))
        stagedThinkingMd = await mergeThinkingMdFromBase(base, input)
        state.thinkingStaged = true
        if (!input.commit) {
          return `thinking.md staged pages ${pageStart}-${pageStart + (input.pages?.length || 0) - 1}`
        }
        const result = await finalizeStagedThinkingDocument({ discardIncomplete: false })
        if (result.status === 'committed') {
          return `thinking.md updated from staged batches (${result.length} chars)`
        }
        if (result.status === 'incomplete') {
          const expected = result.expectedPageCount
            ? `${result.pageCount}/${result.expectedPageCount} pages staged`
            : `${result.pageCount} pages staged`
          return `thinking.md is still staged; ${result.reason} (${expected}). Continue submitting the missing page batches, then call update_thinking_document with commit=true again.`
        }
        return 'thinking.md is still staged; no staged document was ready to commit. Continue submitting page batches, then call update_thinking_document with commit=true again.'
      }

      const content = await mergeThinkingMd(args.thinkingDir, input)
      await writeThinkingMd(args.thinkingDir, content)
      state.thinkingUpdated = true
      state.thinkingUpdateCount += 1
      return 'thinking.md updated'
    },
    {
      name: 'update_thinking_document',
      description:
        'Thinking document workflow tool. Merge updates into /thinking.md when the user asks for an outline, page plan, draft, style/font preference, or refined plan. Omit unchanged fields. Existing sections are preserved unless replaced. For large outlines, submit pages in batches: pass pageStart with 5-10 pages at a time. Batched calls are merged in memory and do not write thinking.md until the final batch sets commit=true. If pageStart is omitted, pages replaces all existing pages immediately. Every page must have a real title, role, objective, summary, and substantive keyPoints. Never write placeholder pages. Use this instead of write_file/edit_file for thinking.md.',
      schema: thinkingDocumentSchema
    }
  )

  return {
    tools: [updateContextDocument, updateThinkingDocument],
    state,
    finalizeStagedThinkingDocument
  }
}
