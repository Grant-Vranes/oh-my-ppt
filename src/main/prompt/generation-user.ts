import type { SessionDeckGenerationContext } from '../tools/types'
import { formatLayoutIntentPrompt } from '@shared/layout-intent'
import { CHART_SKILL_NAME, formatSkillUsageRequirement } from '../skills/skill-contract'
import {
  CANVAS_CONSTRAINTS,
  CONTENT_EXPANSION_RULES,
  CONTENT_LANGUAGE_RULES,
  FRONTEND_CAPABILITIES,
  LAYOUT_COLLISION_RULES,
  LAYOUT_DELIVERY_GUARD,
  PAGE_SEMANTIC_STRUCTURE,
  SLIDE_THESIS_RULES,
  SOURCE_DOCUMENT_FACT_RULE,
  SOURCE_DOCUMENT_LOCATE_THEN_READ_RULE,
  SOURCE_DOCUMENT_READ_STRATEGY,
  SOURCE_GROUNDED_EXPANSION_RULES,
  SOURCE_UNSUPPORTED_CLAIMS,
  STABLE_HTML_FRAGMENT_PROTOCOL
} from './shared'

export function buildSinglePageGenerationPrompt(args: {
  topic: string
  deckTitle: string
  pageId: string
  pageNumber: number
  pageTitle: string
  pageOutline: string
  layoutIntent?: SessionDeckGenerationContext['outlineItems'][number]['layoutIntent']
  sourceDocumentPaths?: string[]
  referenceDocumentSnippets?: string
  isRetryMode?: boolean
  writeToolName?: 'update_single_page_file' | 'update_template_page_file'
  retryContext?: {
    attempt: number
    maxRetries: number
    previousError: string
  }
}): string {
  const writeToolName = args.writeToolName || 'update_single_page_file'
  const previousError = args.retryContext?.previousError || ''
  const shouldMentionChartFix =
    /chart|canvas|PPT\.createChart/i.test(previousError)
  const shouldMentionWriteToolFix =
    /页面未写入|没有成功调用|not written|update_single_page_file|update_template_page_file|占位|placeholder/i.test(
      previousError
    )
  const shouldMentionTemplateSkeletonFix =
    /模板骨架|skeleton|background\/decorative|背景\/装饰资源|CSS url|SVG image|local asset/i.test(
      previousError
    )
  const retryInstructions = args.retryContext
    ? [
        '',
        'Retry fixes to prioritize:',
        `- This is retry ${args.retryContext.attempt}/${args.retryContext.maxRetries}.`,
        `- Previous failure: ${previousError}`,
        '- Output only a complete creative page fragment. The write tool will add section/main/content semantics when they are missing. Do not output a full document, page shell, or runtime scripts.',
        shouldMentionWriteToolFix
          ? `- The previous attempt did not write the target page. You must call ${writeToolName}(pageId="${args.pageId}", content=...) before any final response; do not only describe the HTML in the final response.`
          : '',
        shouldMentionTemplateSkeletonFix
          ? '- The previous attempt dropped template skeleton resources. Reread the target template page, find the missing local asset references from the error, and include the corresponding background/decorative layers in the next write.'
          : '',
        '- Before calling the write tool, mentally validate that the main containers are closed and that no tag is left unfinished at the end.',
        '- If the previous issue was unclosed tags, do not patch the broken fragment. Rewrite a simpler, shallower fragment from scratch: one root div, no page shell (section[data-page-scaffold], main[data-role="content"], or runtime frame), grid/flex direct children, aim for 3 nesting levels and avoid exceeding 4, fewer wrappers, fewer modules.',
        '- If the previous issue was page shell structure, do not include .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root anywhere, including CSS selectors, class names, scripts, and comments.',
        shouldMentionChartFix
          ? `- The previous issue involved chart API usage. Before repairing or writing chart code: ${formatSkillUsageRequirement(CHART_SKILL_NAME)}`
          : ''
      ].filter(Boolean)
    : []
  const sourceDocumentInstructions =
    args.sourceDocumentPaths && args.sourceDocumentPaths.length > 0
      ? args.referenceDocumentSnippets && args.referenceDocumentSnippets.trim().length > 0
        ? [
            '',
            args.referenceDocumentSnippets.trim(),
            '',
            'Source document requirements:',
            '- This slide already has program-side retrieved snippets.',
            `- Source document paths: ${args.sourceDocumentPaths.join(', ')}`,
            SOURCE_DOCUMENT_READ_STRATEGY,
            SOURCE_DOCUMENT_FACT_RULE,
            SOURCE_GROUNDED_EXPANSION_RULES,
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : ''
          ].filter(Boolean)
        : [
            '',
            'Source document requirements:',
            `- Source document paths: ${args.sourceDocumentPaths.join(', ')}`,
            '- No retrieved snippets matched this slide.',
            SOURCE_DOCUMENT_LOCATE_THEN_READ_RULE,
            '- First extract keywords, business objects, time points, system names, and metrics from this slide title and content points; then match relevant source passages.',
            '- Do not copy the whole document indiscriminately.',
            SOURCE_DOCUMENT_FACT_RULE,
            SOURCE_GROUNDED_EXPANSION_RULES,
            args.isRetryMode
              ? '- This is a failed-slide retry. Match source material only around this slide title and content points; do not reconstruct the whole deck outline.'
              : ''
          ].filter(Boolean)
      : []
  const hasSourceRange = /Source range:\s*lines\s+\d+\s*-\s*\d+/i.test(args.pageOutline || '')
  const sourceRangeInstructions =
    args.sourceDocumentPaths && args.sourceDocumentPaths.length > 0 && hasSourceRange
      ? [
          '',
          'Range-bound source reading:',
          '- Content points include a Source range. Before writing this slide, inspect that source heading/range first through the source-reading skill.',
          '- Use retrieved snippets as an index only. If snippets are missing or broad, the Source range remains the primary content boundary.',
          '- Do not pull facts from unrelated sections just because they match keywords.'
        ]
      : []
  return [
    'Generate and write only this slide. Do not modify other slides.',
    '',
    SLIDE_THESIS_RULES,
    '',
    `Topic: ${args.topic}`,
    `Deck title: ${args.deckTitle}`,
    `Target page: ${args.pageId} (slide ${args.pageNumber})`,
    `Slide title: ${args.pageTitle}`,
    `Content points: ${args.pageOutline || 'Expand from the topic with moderate information density.'}`,
    args.layoutIntent ? formatLayoutIntentPrompt(args.layoutIntent) : '',
    ...sourceDocumentInstructions,
    ...sourceRangeInstructions,
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    PAGE_SEMANTIC_STRUCTURE,
    '',
    CANVAS_CONSTRAINTS,
    '',
    LAYOUT_COLLISION_RULES,
    '',
    LAYOUT_DELIVERY_GUARD,
    '',
    FRONTEND_CAPABILITIES,
    '',
    STABLE_HTML_FRAGMENT_PROTOCOL,
    ...retryInstructions,
    '',
    CONTENT_EXPANSION_RULES,
    '',
    'Required content enrichment decision before writing:',
    '- First follow SLIDE_THESIS_RULES to decide the slide form and focal message; then use CONTENT_EXPANSION_RULES only to decide whether the content itself needs enrichment or optimization.',
    '- If the content points are only a title, one short sentence, or 1-2 seed phrases, the page is thin: enrich the argument structure before writing the final content.',
    '- If the content points already contain enough facts, the page is not thin: group and compress instead of adding more visible modules.',
    '- This content decision happens before animation and final HTML; animation is downstream only and must follow the slide form, source grounding, and warranted content enrichment.',
    '',
    'Expansion selection guardrails:',
    '- Treat content points as short seed phrases, not as a checklist that must become one visible card/row per point. Decide which points are primary, grouped support, compact annotations, or lower-priority detail based on the slide title, source range, and available space.',
    '- When source documents are present, expansion must be source-grounded through SOURCE_GROUNDED_EXPANSION_RULES: if inspected material is thin, enrich the slide from inspected material; if it is dense, summarize and group.',
    `- Do not add generic industry framing, unsupported ${SOURCE_UNSUPPORTED_CLAIMS}, or polished-sounding conclusions that are absent from the source document.`,
    '- Do not duplicate the same source facts in multiple large modules. If a fact appears in a timeline/table/chart, do not repeat it again as a separate summary card unless it is the single hero message of the slide.',
    '- When there are many same-level points, preserve the main meaning by grouping related points and surfacing only the amount that fits a real slide with breathing room.',
    '- When the user provided an explicit list of same-level topics, keep them distinct only where the layout allows; otherwise group under shared headings instead of creating equal-weight modules for every item.',
    '- Prefer visualization-friendly expression. When points involve trends, comparisons, or proportions, use charts or data cards when appropriate.',
    '',
    'Single-slide tool constraints:',
    `- Required action: call ${writeToolName}(pageId="${args.pageId}", content=complete creative page fragment).`,
    `- This is not optional. A final text response without a successful ${writeToolName} tool call means the slide is not generated.`,
    '- Do not call update_page_file. In this single-slide run it is intentionally not available.',
    writeToolName === 'update_template_page_file'
      ? '- Do not call update_single_page_file. This template run exposes update_template_page_file instead.'
      : '',
    '- content must be a complete creative page fragment. The tool will wrap it with section[data-page-scaffold], main[data-role="content"], editable data-block-id attributes, and the runtime page frame when needed.',
    '- The content must not contain <!doctype>, <html>, <head>, <body>, .ppt-page-root, .ppt-page-content, .ppt-page-fit-scope, or data-ppt-guard-root.',
    '- The content must be complete and balanced: close your main layout containers and leave no unfinished trailing tags.',
    '- After the tool call succeeds, final response should be a short summary only. Do not paste the HTML in the final response.',
    '- Do not modify other slides.',
    '',
    'Tool context (pre-injected):',
    `- Target file: ${args.pageId}.html (virtual path: /${args.pageId}.html)`,
    '- Agent workspace root: /'
  ].join('\n')
}
