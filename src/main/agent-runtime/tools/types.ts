import log from 'electron-log/main.js'

export {
  SHARED_PAGE_STYLES_END,
  SHARED_PAGE_STYLES_START,
  pageContentEndMarker,
  pageContentStartMarker
} from '../../presentation/html/page-contract'

export type ToolStreamConfig = {
  writer?: (chunk: unknown) => void
} | null

export interface DeckToolStatusPayload {
  label: string
  detail?: string
  progress?: number
  pageId?: string
  agentName?: string
}

export const emitToolStatus = (
  config: ToolStreamConfig | undefined,
  payload: DeckToolStatusPayload
): void => {
  try {
    config?.writer?.({
      type: 'deck_tool_status',
      ...payload
    })
  } catch (error) {
    log.warn('[deepagent] failed to emit custom tool status', {
      message: error instanceof Error ? error.message : String(error),
      payload
    })
  }
}
