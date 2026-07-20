import type { BrowserWindow } from 'electron'
import type { PPTDatabase } from '../db/database'
import type { AgentManager } from '../agent'
import { createIpcContext } from './context'
import { registerSessionHandlers } from './session/session-handlers'
import { registerSessionImportHandlers } from './session/session-import-handlers'
import { registerSessionSaveAsNewHandler } from './session/session-save-as-new'
import { registerAssetHandlers, registerLocalAssetProtocol } from './io/assets-handlers'
import { registerThumbnailHandlers } from './io/thumbnail-handlers'
import { registerGenerationHandlers } from './engine/generation-handlers'
import { registerExportHandlers } from './io/export-handlers'
import { registerStyleHandlers } from './config/style-handlers'
import { registerStylePreviewHandlers } from './config/style-preview-handlers'
import { registerFontHandlers } from './config/font-handlers'
import { registerSettingsHandlers } from './config/settings-handlers'
import { registerImageModelHandlers } from './config/image-model-handlers'
import { registerPreviewHandlers } from './session/preview-handlers'
import { registerPageManagementHandlers } from './session/page-management-handlers'
import { registerPageMergeHandlers } from './session/page-merge-handlers'
import { registerFileHandlers } from './io/file-handlers'
import { registerChartDataImportHandlers, registerEditorHandlers } from './editor'
import { registerDocumentParseHandlers } from './io/document-parse-handlers'
import { registerPptxImportHandlers } from './io/pptx-import-handlers'
import { registerHistoryHandlers } from './history/history-handlers'
import { registerPresentationHandlers } from './session/presentation-handlers'
import { registerSpeechHandlers } from './speech/speech-handlers'
import { registerThinkingHandlers } from './thinking/thinking-handlers'
import { registerTemplateHandlers } from './templates/template-handlers'
import { registerImageGenerationHandlers } from './image-generation/image-generation-handlers'
import { registerImageGenerationHistoryHandlers } from './image-generation/image-generation-history-handlers'
import { registerHtmlEditorHandlers } from './html-editor/html-editor-handlers'
import { registerHtmlEditorAiHandlers } from './html-editor/html-editor-ai-handlers'
import { SessionJobCoordinator } from './edit-jobs/session-job-coordinator'
import { registerDeckEditJobHandlers } from './edit-jobs/deck-edit-job-service'
import { registerPageEditJobHandlers } from './edit-jobs/page-edit-job-service'
import { registerStyleSwitchJobHandlers } from './edit-jobs/style-switch-job-service'

export { registerLocalAssetProtocol }

export function setupIPC(
  mainWindow: BrowserWindow,
  db: PPTDatabase,
  agentManager: AgentManager
): void {
  const context = createIpcContext(mainWindow, db, agentManager)
  const sessionJobCoordinator = new SessionJobCoordinator(context)

  registerSessionHandlers(context)
  registerSessionSaveAsNewHandler(context)
  registerSessionImportHandlers(context)
  registerPageManagementHandlers(context)
  registerPageMergeHandlers(context)
  registerAssetHandlers(context)
  registerThumbnailHandlers(context)
  const pageEditJobs = registerPageEditJobHandlers(context, sessionJobCoordinator)
  const deckEditJobs = registerDeckEditJobHandlers(context, sessionJobCoordinator)
  const styleSwitchJobs = registerStyleSwitchJobHandlers(context, sessionJobCoordinator)
  registerGenerationHandlers(
    context,
    sessionJobCoordinator,
    styleSwitchJobs,
    pageEditJobs,
    deckEditJobs
  )
  registerExportHandlers(context)
  registerStyleHandlers(context)
  registerStylePreviewHandlers(context)
  registerFontHandlers(context)
  registerSettingsHandlers(context)
  registerImageModelHandlers(context)
  registerPreviewHandlers(context)
  registerFileHandlers(context)
  registerEditorHandlers(context)
  registerChartDataImportHandlers(context)
  registerDocumentParseHandlers(context)
  registerPptxImportHandlers(context)
  registerHistoryHandlers(context)
  registerPresentationHandlers(context)
  registerSpeechHandlers(context)
  registerThinkingHandlers(context)
  registerTemplateHandlers(context)
  registerImageGenerationHandlers(context)
  registerImageGenerationHistoryHandlers(context)
  registerHtmlEditorHandlers(context)
  registerHtmlEditorAiHandlers(context)
}
