import { create } from 'zustand'
import { ipc } from '@renderer/lib/ipc'

interface StylePreviewStore {
  generatingStyleId: string
  completionVersion: number
  generatePreview: (styleId: string) => Promise<boolean>
}

export const useStylePreviewStore = create<StylePreviewStore>((set, get) => ({
  generatingStyleId: '',
  completionVersion: 0,

  generatePreview: async (styleId) => {
    if (get().generatingStyleId) return false
    set({ generatingStyleId: styleId })
    try {
      await ipc.generateStylePreview({ styleId })
      return true
    } finally {
      set((state) => ({
        generatingStyleId: '',
        completionVersion: state.completionVersion + 1
      }))
    }
  }
}))
