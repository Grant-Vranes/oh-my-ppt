import type { SessionDeckGenerationContext } from '../../agent/types'
import { progressText } from '@shared/progress'
import { INDEX_TRANSITION_TYPES } from '../../../../shared/index-transition'
import {
  buildCanvasScenarioContentRules,
  buildCanvasScenarioDeliveryGuard,
  buildCanvasScenarioExpansionRules,
  buildLayoutCollisionRules,
  buildPageSemanticStructure,
  buildCanvasConstraints,
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
import { buildCanvasScenarioBrief, resolveCanvasScenario } from './canvas-scenario'
import { createPromptCatalog } from '../catalog'

import containerTemplate from '../templates/edit-system/container.md?raw'
import deckTemplate from '../templates/edit-system/deck.md?raw'
import selectorTemplate from '../templates/edit-system/selector.md?raw'
import singlePageTemplate from '../templates/edit-system/single-page.md?raw'

type EditSystemTemplateVars = {
  container: {
    contentLanguageRules: string
    indexTransitionTypes: string
    analyzingEditRequestLabel: string
    editCompletedLabel: string
    statusLanguage: string
    presetLabel: string
    presetId: string
    stylePrompt: string
    designContractSection: string
    sourceDocumentSection: string
    topic: string
    deckTitle: string
    existingInfo: string
    pageList: string
  }
  selector: {
    contentLanguageRules: string
    presetLabel: string
    presetId: string
    stylePrompt: string
    designContractSection: string
    canvasConstraints: string
    layoutCollisionRules: string
    pageSemanticStructure: string
    frontendCapabilities: string
    sourceDocumentSection: string
    analyzingEditRequestLabel: string
    editCompletedLabel: string
    statusLanguage: string
    topic: string
    deckTitle: string
    targetInfo: string
    targetFileLine: string
    selectorInfo: string
    elementInfo: string
    existingInfo: string
    pageList: string
  }
  singlePage: {
    canvasEditIdentity: string
    targetPageId: string
    canvasScenarioBrief: string
    canvasScenarioContentRules: string
    contentLanguageRules: string
    contentWritingRules: string
    stableHtmlFragmentProtocol: string
    canvasScenarioExpansionRules: string
    canvasConstraints: string
    layoutCollisionRules: string
    canvasScenarioDeliveryGuard: string
    pageSemanticStructure: string
    frontendCapabilities: string
    sourceDocumentSection: string
    analyzingEditRequestLabel: string
    editCompletedLabel: string
    statusLanguage: string
    topic: string
    deckTitle: string
    targetInfo: string
    targetFileLine: string
    existingInfo: string
    pageList: string
    presetLabel: string
    presetId: string
    stylePrompt: string
    designContractSection: string
    styleFidelityRules: string
  }
  deck: {
    canvasEditIdentity: string
    canvasScenarioBrief: string
    canvasScenarioContentRules: string
    contentLanguageRules: string
    contentWritingRules: string
    stableHtmlFragmentProtocol: string
    canvasScenarioExpansionRules: string
    canvasConstraints: string
    layoutCollisionRules: string
    canvasScenarioDeliveryGuard: string
    pageSemanticStructure: string
    frontendCapabilities: string
    sourceDocumentSection: string
    analyzingEditRequestLabel: string
    editCompletedLabel: string
    statusLanguage: string
    topic: string
    deckTitle: string
    explicitTargetInfo: string
    existingInfo: string
    pageList: string
    presetLabel: string
    presetId: string
    stylePrompt: string
    designContractSection: string
    styleFidelityRules: string
  }
}

const editSystemPromptCatalog = createPromptCatalog<EditSystemTemplateVars>({
  container: containerTemplate.trimEnd(),
  selector: selectorTemplate.trimEnd(),
  singlePage: singlePageTemplate.trimEnd(),
  deck: deckTemplate.trimEnd()
})

const buildOptionalSection = (content: string): string => (content ? `\n\n${content}` : '')

const buildDesignContractSection = (context: SessionDeckGenerationContext, label: string): string =>
  context.designContract ? buildOptionalSection(`${label}\n${formatDesignContract(context.designContract)}`) : ''

/** Selects the scoped edit prompt; the individual composers own their allowed tools. */
export function buildEditAgentSystemPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  const isContainerScopeEdit =
    context.mode === 'edit' && context.editScope === 'presentation-container'
  const isDeckScopeEdit = context.mode === 'edit' && context.editScope === 'deck'
  const hasSelector = Boolean(context.selectedSelector?.trim())

  if (isContainerScopeEdit) return buildContainerEditPrompt(styleId, context)
  if (hasSelector) return buildSelectorEditPrompt(styleId, context)
  if (isDeckScopeEdit) return buildDeckEditPrompt(styleId, context)
  return buildSinglePageEditPrompt(styleId, context)
}

function buildSourceDocumentEditInstructions(
  context: SessionDeckGenerationContext,
  options?: { includeExpansion?: boolean }
): string {
  const sourceDocumentPaths = (context.sourceDocumentPaths || []).filter(Boolean)
  if (sourceDocumentPaths.length === 0) return ''
  const lines = [
    '## Source documents (content evidence)',
    'The session has user-imported reference documents. When the edit changes slide facts, examples, metrics, terminology, conclusions, or source-backed page content, use the source document as the authority.',
    `- sourceDocumentPaths: ${sourceDocumentPaths.join(', ')}`,
    SOURCE_DOCUMENT_READ_STRATEGY,
    '- For pure visual/style-only edits, do not reread the source document unless the user asks for source-backed content changes.',
    SOURCE_DOCUMENT_FACT_RULE
  ]
  if (options?.includeExpansion) lines.push(SOURCE_GROUNDED_EXPANSION_RULES)
  return lines.join('\n')
}

function buildContainerEditPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  void styleId
  const { presetLabel, presetId, stylePrompt } = resolveContextStylePrompt(context)
  return editSystemPromptCatalog.render('container', {
    contentLanguageRules: CONTENT_LANGUAGE_RULES,
    indexTransitionTypes: INDEX_TRANSITION_TYPES.join(' / '),
    analyzingEditRequestLabel: progressText(context.appLocale, 'understanding'),
    editCompletedLabel: progressText(context.appLocale, 'completed'),
    statusLanguage: context.appLocale === 'en' ? 'English' : 'Simplified Chinese',
    presetLabel,
    presetId,
    stylePrompt,
    designContractSection: buildDesignContractSection(context, '设计契约（本次演示的统一视觉参考）：'),
    sourceDocumentSection: buildOptionalSection(buildSourceDocumentEditInstructions(context)),
    topic: context.topic,
    deckTitle: context.deckTitle,
    existingInfo: context.existingPageIds?.length
      ? `Existing page IDs: ${context.existingPageIds.join(', ')}`
      : '',
    pageList: buildOutlinePageList(context)
  })
}

function buildSelectorEditPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  void styleId
  const { presetLabel, presetId, stylePrompt } = resolveContextStylePrompt(context)
  const targetPagePath =
    context.selectedPageId && context.pageFileMap[context.selectedPageId]
      ? `/${context.selectedPageId}.html`
      : undefined
  return editSystemPromptCatalog.render('selector', {
    contentLanguageRules: CONTENT_LANGUAGE_RULES,
    presetLabel,
    presetId,
    stylePrompt,
    designContractSection: buildDesignContractSection(
      context,
      '设计契约（本次演示的统一视觉参考，修改时保持协调即可）：'
    ),
    canvasConstraints: buildCanvasConstraints(context.slideSize),
    layoutCollisionRules: buildLayoutCollisionRules(context.slideSize),
    pageSemanticStructure: buildPageSemanticStructure(context.slideSize),
    frontendCapabilities: FRONTEND_CAPABILITIES,
    sourceDocumentSection: buildOptionalSection(buildSourceDocumentEditInstructions(context)),
    analyzingEditRequestLabel: progressText(context.appLocale, 'understanding'),
    editCompletedLabel: progressText(context.appLocale, 'completed'),
    statusLanguage: context.appLocale === 'en' ? 'English' : 'Simplified Chinese',
    topic: context.topic,
    deckTitle: context.deckTitle,
    targetInfo: context.selectedPageId
      ? `Target page: ${context.selectedPageId} (slide ${context.selectedPageNumber ?? '?'})`
      : 'Target page: infer from the user message.',
    targetFileLine: targetPagePath ? `Target file: ${targetPagePath}` : '',
    selectorInfo: `Target element selector: ${context.selectedSelector}`,
    elementInfo: context.elementTag
      ? `Target element: <${context.elementTag}>${context.elementText ? `"${context.elementText}"` : ''}`
      : '',
    existingInfo: context.existingPageIds?.length
      ? `Existing page IDs: ${context.existingPageIds.join(', ')}`
      : '',
    pageList: buildOutlinePageList(context)
  })
}

function buildSinglePageEditPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  void styleId
  const { presetLabel, presetId, stylePrompt } = resolveContextStylePrompt(context)
  const targetPageId = context.selectedPageId || context.allowedPageIds?.[0] || ''
  const canvasScenario = resolveCanvasScenario(context.slideSize)
  return editSystemPromptCatalog.render('singlePage', {
    canvasEditIdentity: canvasScenario.editIdentity,
    targetPageId,
    canvasScenarioBrief: buildCanvasScenarioBrief(context.slideSize),
    canvasScenarioContentRules: buildCanvasScenarioContentRules(context.slideSize),
    contentLanguageRules: CONTENT_LANGUAGE_RULES,
    contentWritingRules: CONTENT_WRITING_RULES,
    stableHtmlFragmentProtocol: STABLE_HTML_FRAGMENT_PROTOCOL,
    canvasScenarioExpansionRules: buildCanvasScenarioExpansionRules(context.slideSize),
    canvasConstraints: buildCanvasConstraints(context.slideSize),
    layoutCollisionRules: buildLayoutCollisionRules(context.slideSize),
    canvasScenarioDeliveryGuard: buildCanvasScenarioDeliveryGuard(context.slideSize),
    pageSemanticStructure: buildPageSemanticStructure(context.slideSize),
    frontendCapabilities: FRONTEND_CAPABILITIES,
    sourceDocumentSection: buildOptionalSection(
      buildSourceDocumentEditInstructions(context, { includeExpansion: true })
    ),
    analyzingEditRequestLabel: progressText(context.appLocale, 'understanding'),
    editCompletedLabel: progressText(context.appLocale, 'completed'),
    statusLanguage: context.appLocale === 'en' ? 'English' : 'Simplified Chinese',
    topic: context.topic,
    deckTitle: context.deckTitle,
    targetInfo: `Target page: ${targetPageId} (slide ${context.selectedPageNumber ?? '?'})`,
    targetFileLine: targetPageId ? `Target file: /${targetPageId}.html` : '',
    existingInfo: context.existingPageIds?.length
      ? `Existing page IDs: ${context.existingPageIds.join(', ')}`
      : '',
    pageList: buildOutlinePageList(context),
    presetLabel,
    presetId,
    stylePrompt,
    designContractSection: buildDesignContractSection(
      context,
      '设计契约（本次演示的统一视觉参考，修改时保持协调即可）：'
    ),
    styleFidelityRules: STYLE_FIDELITY_RULES
  })
}

function buildDeckEditPrompt(
  styleId: string | null | undefined,
  context: SessionDeckGenerationContext
): string {
  void styleId
  const { presetLabel, presetId, stylePrompt } = resolveContextStylePrompt(context)
  const canvasScenario = resolveCanvasScenario(context.slideSize)
  const explicitTargetInfo = context.selectPageIds?.length
    ? `Selected page ids from UI (hard target): ${context.selectPageIds.join(', ')}`
    : 'Target pages: all relevant /<pageId>.html files'
  return editSystemPromptCatalog.render('deck', {
    canvasEditIdentity: canvasScenario.editIdentity,
    canvasScenarioBrief: buildCanvasScenarioBrief(context.slideSize),
    canvasScenarioContentRules: buildCanvasScenarioContentRules(context.slideSize),
    contentLanguageRules: CONTENT_LANGUAGE_RULES,
    contentWritingRules: CONTENT_WRITING_RULES,
    stableHtmlFragmentProtocol: STABLE_HTML_FRAGMENT_PROTOCOL,
    canvasScenarioExpansionRules: buildCanvasScenarioExpansionRules(context.slideSize),
    canvasConstraints: buildCanvasConstraints(context.slideSize),
    layoutCollisionRules: buildLayoutCollisionRules(context.slideSize),
    canvasScenarioDeliveryGuard: buildCanvasScenarioDeliveryGuard(context.slideSize),
    pageSemanticStructure: buildPageSemanticStructure(context.slideSize),
    frontendCapabilities: FRONTEND_CAPABILITIES,
    sourceDocumentSection: buildOptionalSection(
      buildSourceDocumentEditInstructions(context, { includeExpansion: true })
    ),
    analyzingEditRequestLabel: progressText(context.appLocale, 'understanding'),
    editCompletedLabel: progressText(context.appLocale, 'completed'),
    statusLanguage: context.appLocale === 'en' ? 'English' : 'Simplified Chinese',
    topic: context.topic,
    deckTitle: context.deckTitle,
    explicitTargetInfo,
    existingInfo: context.existingPageIds?.length
      ? `Existing page IDs: ${context.existingPageIds.join(', ')}`
      : '',
    pageList: buildOutlinePageList(context),
    presetLabel,
    presetId,
    stylePrompt,
    designContractSection: buildDesignContractSection(
      context,
      '设计契约（本次演示的统一视觉参考，修改时保持协调即可）：'
    ),
    styleFidelityRules: STYLE_FIDELITY_RULES
  })
}
