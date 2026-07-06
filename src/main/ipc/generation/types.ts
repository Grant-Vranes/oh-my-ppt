import type { PPTDatabase } from '../../db/database'
import type { AgentManager } from '../../agent'
import type { ModelTimeoutProfile } from '@shared/model-timeout'
import type { FontSelection } from '@shared/generation'
import type { SourceDocumentPlan } from '@shared/generation'
import type { AnimationPreferencesPayload } from '@shared/generation'
import type { DesignContract } from '../../tools/types'
import type { CommonGenerationContext } from './context'

export type GenerateMode = 'generate' | 'edit' | 'retry' | 'addPage' | 'retrySinglePage'
export type GenerateChatType = 'main' | 'page'

// Minimal context needed by finalize functions.
// Both GenerationContext and AddPageContext satisfy this interface.
export type FinalizeContext = {
  sessionId: string
  runId: string
  styleId: string
  previousSessionStatus: string
  effectiveMode: GenerateMode
  messageScope: GenerateChatType
  messagePageId?: string
  projectId: string
  modelConfigId?: string
  modelConfigName?: string
  runModel?: string
  animationPreferences?: AnimationPreferencesPayload | null
}

export type GenerationContext = {
  sessionId: string
  userMessage: string
  requestedType?: 'deck' | 'page'
  effectiveMode: GenerateMode
  selectedPageId?: string
  selectPageIds: string[]
  htmlPath?: string
  selector?: string
  elementTag?: string
  elementText?: string
  sourceRunId?: string
  session: Awaited<ReturnType<PPTDatabase['getSession']>>
  sessionRecord: Record<string, unknown>
  previousSessionStatus: string
  entry: ReturnType<AgentManager['beginRun']> extends infer T ? NonNullable<T> : never
  runId: string
  styleId: string
  styleSkill: CommonGenerationContext['styleSkill']
  styleKey: string
  styleName: string
  styleVersion: string
  slideSize: CommonGenerationContext['slideSize']
  userProvidedOutlineTitles: string[]
  totalPages: number
  provider: string
  apiKey: string
  model: string
  modelConfigId?: string
  modelConfigName?: string
  runModel?: string
  maxTokens: number
  modelTimeouts: Record<ModelTimeoutProfile, number>
  providerBaseUrl: string
  projectId: string
  messageScope: GenerateChatType
  messagePageId?: string
  imagePaths: string[]
  videoPaths: string[]
  sourceDocumentPaths: string[]
  sourcePlan: SourceDocumentPlan | null
  topic: string
  deckTitle: string
  appLocale: 'zh' | 'en'
  fontSelection: FontSelection
  animationPreferences: AnimationPreferencesPayload | null
}

export type DeckContext = GenerationContext & { effectiveMode: 'generate' }
export type EditContext = GenerationContext & {
  effectiveMode: 'edit'
  resetVisualStyle?: boolean
  designContract?: DesignContract
  onDeckEditStarted?: () => void
}
export type RetryContext = GenerationContext & { effectiveMode: 'retry' }

export type AnyFlowContext =
  | DeckContext
  | EditContext
  | RetryContext
  | {
      sessionId: string
      runId: string
      messageScope: GenerateChatType
      messagePageId?: string
      runModel?: string
    }

export type FinalizeGenerationArgs = {
  context: FinalizeContext
  indexPath: string
  totalPages: number
  generatedPages: Array<{
    id?: string
    pageNumber: number
    title: string
    pageId: string
    htmlPath: string
    html: string
  }>
  designContract?: DesignContract
}

export type EmitAssistantFn = (context: AnyFlowContext, content: string) => Promise<void>
