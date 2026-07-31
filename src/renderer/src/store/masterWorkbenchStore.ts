import { create } from 'zustand'
import { buildDefaultMasterConfig, type SessionMasterConfig } from '@shared/master'

type MasterWorkbenchState = {
  config: SessionMasterConfig
  setConfig: (config: SessionMasterConfig) => void
  updateConfig: (patch: Partial<SessionMasterConfig>) => void
}

export const useMasterWorkbenchStore = create<MasterWorkbenchState>((set) => ({
  config: buildDefaultMasterConfig(),
  setConfig: (config) => set({ config }),
  updateConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } }))
}))
