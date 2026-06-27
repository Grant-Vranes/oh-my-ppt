import { create } from 'zustand'
import type {
  AddSessionElementHandler,
  WorkspaceRibbonRegisteredActions
} from '@renderer/types/session-detail'

export type {
  AddSessionElementHandler,
  AddSessionElementOptions,
  WorkspaceRibbonRegisteredActions
} from '@renderer/types/session-detail'

interface SessionDetailRuntimeStore {
  addElementHandler: AddSessionElementHandler | null
  setAddElementHandler: (handler: AddSessionElementHandler | null) => void
  addElement: AddSessionElementHandler
  refreshCurrentPreviewHandler: (() => void) | null
  setRefreshCurrentPreviewHandler: (handler: (() => void) | null) => void
  refreshCurrentPreview: () => void
  workspaceRibbonActions: WorkspaceRibbonRegisteredActions | null
  setWorkspaceRibbonActions: (actions: WorkspaceRibbonRegisteredActions | null) => void
}

export const useSessionDetailRuntimeStore = create<SessionDetailRuntimeStore>((set, get) => ({
  addElementHandler: null,
  setAddElementHandler: (addElementHandler) => set({ addElementHandler }),
  addElement: async (relativePath, fileName, options) => {
    const handler = get().addElementHandler
    return handler ? handler(relativePath, fileName, options) : false
  },
  refreshCurrentPreviewHandler: null,
  setRefreshCurrentPreviewHandler: (refreshCurrentPreviewHandler) =>
    set({ refreshCurrentPreviewHandler }),
  refreshCurrentPreview: () => {
    const handler = get().refreshCurrentPreviewHandler
    handler?.()
  },
  workspaceRibbonActions: null,
  setWorkspaceRibbonActions: (workspaceRibbonActions) => set({ workspaceRibbonActions })
}))
