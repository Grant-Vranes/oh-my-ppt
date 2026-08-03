import log from 'electron-log/main.js'
import type { EditContext } from './types'
import type { EditedPageDescriptor } from './generation-utils'
import { buildLocalSuccessfulEditSummary as buildLocalSuccessfulEditSummaryCore } from './edit-summary-core'

export type SuccessfulEditSummaryInput = {
  context: EditContext
  changedPages: EditedPageDescriptor[]
  editScope: 'page' | 'selector' | 'deck'
  failedPageLabels?: string[]
}

const toCoreInput = (args: SuccessfulEditSummaryInput) => ({
  appLocale: args.context.appLocale,
  changedPages: args.changedPages.map((page) => ({
    pageNumber: page.pageNumber
  })),
  editScope: args.editScope,
  failedPageLabels: args.failedPageLabels
})

export const buildLocalSuccessfulEditSummary = (args: SuccessfulEditSummaryInput): string =>
  buildLocalSuccessfulEditSummaryCore(toCoreInput(args))

export async function emitSuccessfulEditSummary(
  context: EditContext,
  summary: string,
  emitAssistant: (context: EditContext, content: string) => Promise<void>
): Promise<void> {
  try {
    await emitAssistant(context, summary)
  } catch (error) {
    log.warn('[generate:start] edit summary message failed', {
      sessionId: context.sessionId,
      runId: context.runId,
      reason: error instanceof Error ? error.message : String(error)
    })
  }
}
