import type {
  AnimationPreferencesPayload,
  DeckEditScope,
  DesignContract,
  OutlineItem,
  SelectedElementRuntimeContext
} from '@shared/generation'
import type { SlideSizePreset } from '@shared/slide-size'

export interface DeepAgentStreamResult {
  stream: (...args: any[]) => Promise<AsyncIterable<unknown>>
}

/** Immutable session/run input shared by the Agent factory, prompt composers, and tool adapters. */
export interface SessionDeckGenerationContext {
  mode?: 'generate' | 'edit' | 'retry'
  editScope?: DeckEditScope
  provider?: string
  model?: string
  sessionId: string
  projectDir: string
  indexPath: string
  pageFileMap: Record<string, string>
  pageNumbers?: Record<string, number>
  selectPageIds?: string[]
  allowedPageIds?: string[]
  topic: string
  deckTitle: string
  styleId: string | null | undefined
  /** Snapshot of the database styleSkill markdown for this run. */
  styleSkillPrompt?: string
  styleKey?: string
  styleName?: string
  styleVersion?: string
  slideSize: SlideSizePreset
  appLocale?: 'zh' | 'en'
  animationPreferences?: AnimationPreferencesPayload | null
  userMessage: string
  outlineTitles: string[]
  outlineItems: OutlineItem[]
  sourceDocumentPaths?: string[]
  designContract?: DesignContract
  /** Template generation must inspect the copied template page before rewriting it. */
  templatePageReadRequired?: boolean
  // Edit-mode fields (filled when mode=edit)
  selectedPageId?: string
  selectedPageNumber?: number
  selectedSelector?: string
  elementTag?: string
  elementText?: string
  selectedElementContext?: SelectedElementRuntimeContext
  existingPageIds?: string[]
}
