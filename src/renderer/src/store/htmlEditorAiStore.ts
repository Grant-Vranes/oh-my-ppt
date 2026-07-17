import { create } from 'zustand'
import type {
  HtmlEditorAiHistoryMessage,
  HtmlEditorAiIntent,
  HtmlEditorAiMessage,
  HtmlEditorAiPlan
} from '../lib/ipc'

interface HtmlEditorAiState {
  enabled: boolean
  input: string
  messages: HtmlEditorAiHistoryMessage[]
  isSending: boolean
  error: string | null
  intent: HtmlEditorAiIntent | null
  pendingPlan: HtmlEditorAiPlan | null
  requiresConfirmation: boolean
  setEnabled: (enabled: boolean) => void
  setInput: (input: string) => void
  addMessage: (message: HtmlEditorAiMessage) => void
  setMessages: (messages: HtmlEditorAiHistoryMessage[]) => void
  setSending: (isSending: boolean) => void
  setError: (error: string | null) => void
  setPlan: (args: {
    intent: HtmlEditorAiIntent
    plan: HtmlEditorAiPlan | null
    requiresConfirmation: boolean
  }) => void
  clearConversation: () => void
  reset: () => void
}

const initialState = {
  enabled: false,
  input: '',
  messages: [],
  isSending: false,
  error: null,
  intent: null,
  pendingPlan: null,
  requiresConfirmation: false
}

export const useHtmlEditorAiStore = create<HtmlEditorAiState>((set) => ({
  ...initialState,
  setEnabled: (enabled) => set({ enabled }),
  setInput: (input) => set({ input }),
  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...message, id: crypto.randomUUID(), createdAt: Date.now() }
      ].slice(-48)
    })),
  setMessages: (messages) => set({ messages: messages.slice(-48) }),
  setSending: (isSending) => set({ isSending }),
  setError: (error) => set({ error }),
  setPlan: ({ intent, plan, requiresConfirmation }) =>
    set({ intent, pendingPlan: plan, requiresConfirmation }),
  clearConversation: () =>
    set({
      input: '',
      messages: [],
      isSending: false,
      error: null,
      intent: null,
      pendingPlan: null,
      requiresConfirmation: false
    }),
  reset: () => set(initialState)
}))
