import { create } from 'zustand'

type LayoutMasterState = {
  isOpen: boolean
  setOpen: (isOpen: boolean) => void
}

export const useLayoutMasterStore = create<LayoutMasterState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen })
}))
