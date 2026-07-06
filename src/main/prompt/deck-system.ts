import type { SessionDeckGenerationContext } from '../tools/types'
import { isSectionAgendaOutline } from '@shared/generation'
import {
  buildLayoutCollisionRules,
  buildPageSemanticStructure,
  buildCanvasConstraints,
  buildCanvasScenarioContentRules,
  buildCanvasScenarioDeliveryGuard,
  buildCanvasScenarioExpansionRules,
  CONTENT_LANGUAGE_RULES,
  CONTENT_WRITING_RULES,
  FRONTEND_CAPABILITIES,
  SOURCE_DOCUMENT_FACT_RULE,
  SOURCE_DOCUMENT_READ_STRATEGY,
  SOURCE_GROUNDED_EXPANSION_RULES,
  STABLE_HTML_FRAGMENT_PROTOCOL,
  STYLE_FIDELITY_RULES,
  buildOutlinePageList,
  formatDesignContract,
  resolveContextStylePrompt
} from './shared'
import { formatAnimationPreferencesForPageWriting } from './animation-preferences'
import { buildCanvasScenarioBrief, resolveCanvasScenario } from './canvas-scenario'

export function buildDeckAgentSystemPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  void styleId
  const { presetLabel, presetId, stylePrompt } = resolveContextStylePrompt(context)
  const pageList = buildOutlinePageList(context)
  const statusLanguage = context.appLocale === 'en' ? 'English' : 'Simplified Chinese'

  const targetInfo = context.selectedPageId
    ? `This run may only modify: ${context.selectedPageId}`
    : context.selectPageIds?.length
      ? `This run may only modify selected pages: ${context.selectPageIds.join(', ')}`
      : 'This run may modify all pages.'
  const targetPagePath =
    context.selectedPageId && context.pageFileMap[context.selectedPageId]
      ? `/${context.selectedPageId}.html`
      : undefined
  const isSinglePageTask =
    context.mode !== 'edit' &&
    (Boolean(context.selectedPageId) ||
      (Array.isArray(context.selectPageIds) && context.selectPageIds.length === 1) ||
      (Array.isArray(context.allowedPageIds) && context.allowedPageIds.length === 1) ||
      context.outlineTitles.length === 1)
  const isSectionAgendaSinglePageTask =
    isSinglePageTask &&
    context.outlineItems.length === 1 &&
    isSectionAgendaOutline(context.outlineItems[0]?.contentOutline || '')
  const isTemplateGeneration = context.templatePageReadRequired === true
  const singlePageWriteToolName = isTemplateGeneration
    ? 'update_template_page_file'
    : 'update_single_page_file'
  const step3Instruction = isSinglePageTask
    ? context.templatePageReadRequired
      ? '3. Required: after reading the target template page with read_file, call update_template_page_file(pageId=target page, content). A final text response without the read_file + update_template_page_file sequence is a failed generation.'
      : '3. Required: call update_single_page_file(pageId=target page, content). A final text response without this tool call is a failed generation.'
    : '3. Call update_page_file(content) page by page. For multi-page generation, write each target page file in order. You may pass pageId to override automatic targeting.'
  const sourceDocumentPaths = isSectionAgendaSinglePageTask
    ? []
    : (context.sourceDocumentPaths || []).filter(Boolean)
  const isRetryMode = context.mode === 'retry'
  const animationPreferencePrompt = formatAnimationPreferencesForPageWriting(
    context.animationPreferences
  )
  const canvasScenario = resolveCanvasScenario(context.slideSize)
  const sourceDocumentInstructions =
    sourceDocumentPaths.length > 0
      ? [
          '',
          '## Source documents (highest-priority content evidence)',
          'This session comes from user-uploaded documents. Generated content must prioritize source-document facts; do not rely only on the summary or page outline.',
          'Single-page prompts may include program-side retrieved snippets.',
          SOURCE_DOCUMENT_READ_STRATEGY,
          'If snippets are insufficient, conflicting, or missing key facts, follow the source-reading skill against these source documents:',
          ...sourceDocumentPaths.map((docPath) => `- ${docPath}`),
          SOURCE_DOCUMENT_FACT_RULE,
          SOURCE_GROUNDED_EXPANSION_RULES,
          isRetryMode
            ? '- This is a failed-slide retry. Match source material only around the failed slide title and outline; do not reconstruct the whole deck outline.'
            : "- This is initial page generation. Follow the established page outline slide by slide; do not prematurely insert other slides' material.",
          'If the source document conflicts with additional user requirements, follow the user requirements. If the page outline conflicts with source details, follow source-document facts.'
        ]
      : []

  return [
    '⛔⛔⛔ CRITICAL — TOOL CALL IS MANDATORY ⛔⛔⛔',
    isTemplateGeneration
      ? 'You MUST call update_template_page_file to write the current template page.'
      : 'You MUST call update_single_page_file (single-page) or update_page_file (multi-page) to write every page.',
    "Put ALL HTML into the tool's content parameter. Do NOT output HTML in your text reply.",
    'A response without successful tool calls is a FAILED generation.',
    '',
    canvasScenario.identity,
    `You run inside a DeepAgents filesystem session and must write each ${canvasScenario.pageName} into its own /<pageId>.html file through tools.`,
    '',
    buildCanvasScenarioBrief(context.slideSize),
    '',
    buildCanvasScenarioContentRules(context.slideSize),
    '',
    CONTENT_LANGUAGE_RULES,
    '',
    isTemplateGeneration
      ? [
          '## 模板还原优先',
          '- 当前是模板生成，不追求重新设计、视觉惊喜或主动变化。',
          '- 每页先继承目标模板页的页面角色、版式骨架、背景/装饰层、留白节奏、字体尺度、组件形状和配色关系。',
          '- 只替换旧业务内容：标题、正文、指标、图表数据、案例、结论和与新主题冲突的内容素材。',
          '- 为适配新内容可以做局部微调，但不能把模板页改成另一套构图或另一套视觉系统。',
          '- 如果内容放不下，优先压缩文案/合并模块，不要通过新增大量卡片或重排整页来破坏模板。'
        ].join('\n')
      : [
          '## 创意变化',
          '- 在统一风格内制造每页的视觉惊喜：变化主视觉位置、标题进入方式、信息节奏、留白比例或局部装饰语言。',
          '- 每页至少有一个清晰的视觉焦点，可以是关键数字、图表、概念符号、时间节点或一句核心判断。',
          '- 惊喜感服务于内容理解；不要为了变化加入无关装饰、复杂嵌套、遮挡文字或难以维护的结构。',
          `- 同一套 ${canvasScenario.sequenceName} 内避免连续页面使用完全相同的标题位置、卡片网格和背景分区。`
        ].join('\n'),
    ...sourceDocumentInstructions,
    '',
    buildCanvasConstraints(context.slideSize),
    '',
    buildLayoutCollisionRules(context.slideSize),
    '',
    buildCanvasScenarioDeliveryGuard(context.slideSize),
    '- index.html 是总览壳（导航+iframe），不要修改其核心结构。',
    '',
    buildPageSemanticStructure(context.slideSize),
    '',
    buildCanvasScenarioExpansionRules(context.slideSize),
    '',
    FRONTEND_CAPABILITIES,
    '',
    ...(animationPreferencePrompt ? [animationPreferencePrompt, ''] : []),
    CONTENT_WRITING_RULES,
    '',
    STABLE_HTML_FRAGMENT_PROTOCOL,
    '',
    '## Hard failure avoidance',
    '- Page write tools reject truncated fragments. Before every write call, ensure your main layout containers are closed and the HTML does not end inside an unfinished tag.',
    '- If a tool reports HTML validation failure, do not patch a broken deeply nested fragment. Simplify the fragment and retry only that page with the Stable HTML fragment protocol.',
    context.templatePageReadRequired
      ? '- In template generation, dropping inspected background images, decorative layers, CSS url(...) references, masks, overlays, or the containers that render them is a failed generation unless the user explicitly requested removal.'
      : '',
    context.templatePageReadRequired
      ? '- Because page write tools rebuild the slide from your submitted fragment, include the required template background/decorative layers or exact local asset references inside that fragment.'
      : '',
    '- 不要在回复中贴大段 HTML；你的任务是通过工具把文件改好',
    isSinglePageTask
      ? `- 不要调用 edit_file / write_file / update_page_file${
          isTemplateGeneration ? ' / update_single_page_file' : ''
        }；单页任务必须调用 ${singlePageWriteToolName}(pageId, content) 并成功落盘后才能最终回复`
      : '- 不要调用 edit_file / write_file 直接覆盖页面文件，统一用 update_page_file(content)',
    '',
    '## Execution Flow',
    isSinglePageTask
      ? context.templatePageReadRequired
        ? [
            `1. Mandatory first action: call read_file(path="${targetPagePath || '/<pageId>.html'}", offset=0, limit=1200) to inspect the copied template page before writing.`,
            '2. Preserve the inspected page visual system: background images, texture images, decorative assets, masks, overlays, CSS background-image/url(...) references, <img src>, SVG image href, font scale, spacing rhythm, color language, and structural wrappers unless the user explicitly asks to remove them.',
            '   Background/decorative assets are template skeleton, not stale business content; replacing facts and text must not remove the visual shell.',
            `   The content fragment you pass to ${singlePageWriteToolName} must explicitly carry those required layers or exact local asset references.`,
            sourceDocumentPaths.length > 0
              ? `3. Required before writing: follow the source-reading skill for targeted source inspection (${sourceDocumentPaths.join(', ')}).`
              : '3. Analyze the new slide content requirements from the context provided.',
            step3Instruction,
            '4. Send a short summary as your final response.'
          ].join('\n')
        : [
            sourceDocumentPaths.length > 0
              ? `1. Required before writing: follow the source-reading skill for targeted source inspection (${sourceDocumentPaths.join(', ')}).`
              : '1. Analyze the slide requirements from the context provided.',
            step3Instruction,
            '3. Send a short summary as your final response.'
          ].join('\n')
      : [
          '1. get_session_context — read the session context and constraints',
          sourceDocumentPaths.length > 0
            ? `2. Use retrieved source-document snippets as an index, follow the source-reading skill for targeted source inspection (${sourceDocumentPaths.join(', ')}), then call report_generation_status('Analyzing request', ...)`
            : "2. report_generation_status('Analyzing request', ...) — report start",
          `   report_generation_status labels and details must be written in ${statusLanguage}, because they are application UI logs.`,
          '   This status/log language is independent from deck content language. Deck content must still follow the Content language rules.',
          '   progress must be a numeric literal such as 10, 35, or 88. Do not pass strings such as "10".',
          '   Progress must be detailed and monotonic. Suggested ranges: Analyzing request (8-18) / Reading context (18-30) / Writing pages (30-88, linear by page) / Verifying (88-96) / Completed (98-100).',
          '   Report once for each major action so the UI does not stay silent for too long.',
          step3Instruction,
          '4. verify_completion() — check whether target pages are filled',
          "5. If pages are still empty, continue filling them, then report_generation_status('Generation completed', ...)"
        ].join('\n'),
    '## Current Task',
    `Topic: ${context.topic}`,
    `Deck title: ${context.deckTitle}`,
    `Slide count: ${context.outlineTitles.length}`,
    targetInfo,
    targetPagePath ? `Target file: ${targetPagePath}` : '',
    'Page outline:',
    pageList,
    '',
    'Fill each page around its main thesis: treat the content points in the outline as evidence to select, group, and merge around the one sentence the page should deliver — not as a checklist where every point becomes a visible module. Keep each page title aligned with its thesis.',
    '',
    '## 最终风格校准（写入前）',
    `风格预设：${presetLabel} (${presetId})`,
    '风格规则：',
    stylePrompt,
    '',
    '本套演示设计契约（统一视觉护栏，避免机械套版）：',
    formatDesignContract(context.designContract),
    '',
    STYLE_FIDELITY_RULES,
    '',
    `⛔ FINAL REMINDER: Before you send your final text response, you MUST have successfully called ${
      isTemplateGeneration
        ? 'update_template_page_file'
        : 'update_single_page_file (or update_page_file)'
    } for every target page. A text-only reply without tool calls = FAILED generation.`
  ].join('\n')
}
