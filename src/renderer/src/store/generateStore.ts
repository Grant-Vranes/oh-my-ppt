import { create } from 'zustand'
import type { GenerateStartPayload, SessionPageEditPlan } from '@shared/generation'

export interface GenerateProgress {
  stage: string
  label: string
  currentPage?: number
  totalPages?: number
  progress: number
}

export interface PageEditJob {
  sessionId: string
  pageId: string
  pageNumber?: number
  runId?: string
  status: 'starting' | 'queued' | 'running' | 'cancelling'
  label: string
  progress: number
}

export interface DeckEditJob {
  sessionId: string
  runId?: string
  status: 'starting' | 'queued' | 'running' | 'cancelling'
  label: string
  progress: number
  totalPages: number
  payload?: GenerateStartPayload
}

export interface DeckEditRetry {
  sessionId: string
  runId: string
  failedPageCount: number
  payload: GenerateStartPayload
}

export interface PendingPageEditPlan {
  sessionId: string
  plan: SessionPageEditPlan
  payload: GenerateStartPayload
  targetPageId: string
  targetPageNumber?: number
}

export interface PageEditPlanningState {
  pageId: string
  assessmentId?: string
  isAssessing: boolean
  pendingPlan: PendingPageEditPlan | null
}

type GenerateRunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'

interface GenerateStore {
  status: GenerateRunStatus
  isGenerating: boolean
  progress: GenerateProgress | null
  pageEditJobs: Record<string, PageEditJob | undefined>
  deckEditJobs: Record<string, DeckEditJob | undefined>
  deckEditRetries: Record<string, DeckEditRetry | undefined>
  pageEditPlanning: Record<string, PageEditPlanningState | undefined>
  currentPages: {
    id: string
    pageNumber: number
    title: string
    contentOutline?: string | null
    html: string
    htmlPath?: string
    pageId?: string
    sourceUrl?: string
    status?: string
    error?: string | null
  }[]
  error: string | null
  sessionErrors: Record<string, string | undefined>
  cancelReason: string | null

  startGeneration: () => void
  startPageEdit: (sessionId: string, job: Pick<PageEditJob, 'pageId' | 'pageNumber'>) => void
  updatePageEdit: (
    sessionId: string,
    job: Partial<Omit<PageEditJob, 'sessionId' | 'pageId' | 'pageNumber'>>
  ) => void
  finishPageEdit: (sessionId: string) => void
  startDeckEdit: (sessionId: string, job: Pick<DeckEditJob, 'totalPages' | 'payload'>) => void
  updateDeckEdit: (sessionId: string, job: Partial<Omit<DeckEditJob, 'sessionId'>>) => void
  finishDeckEdit: (sessionId: string, retry?: Omit<DeckEditRetry, 'sessionId'>) => void
  clearDeckEditRetry: (sessionId: string) => void
  startPageEditPlanning: (sessionId: string, pageId: string, assessmentId?: string) => void
  setPendingPageEditPlan: (sessionId: string, plan: Omit<PendingPageEditPlan, 'sessionId'>) => void
  finishPageEditPlanning: (sessionId: string, assessmentId?: string) => void
  clearPendingPageEditPlan: (sessionId: string) => void
  updateProgress: (progress: Partial<GenerateProgress>) => void
  setPages: (
    pages: {
      id: string
      pageNumber: number
      title: string
      contentOutline?: string | null
      html: string
      htmlPath?: string
      pageId?: string
      sourceUrl?: string
      status?: string
      error?: string | null
    }[]
  ) => void
  addPage: (page: {
    id: string
    pageNumber: number
    title: string
    contentOutline?: string | null
    html: string
    htmlPath?: string
    pageId?: string
    sourceUrl?: string
    status?: string
    error?: string | null
  }) => void
  updatePage: (
    pageId: string,
    html: string,
    patch?: Partial<{
      pageNumber: number
      title: string
      htmlPath?: string
      sourceUrl?: string
      status?: string
      error?: string | null
    }>
  ) => void
  finishGeneration: () => void
  cancelGeneration: (reason?: string) => void
  setError: (error: string | null) => void
  setSessionError: (sessionId: string, error: string | null) => void
  clearSessionError: (sessionId: string) => void
  reset: () => void
}

export const useGenerateStore = create<GenerateStore>((set) => ({
  status: 'idle',
  isGenerating: false,
  progress: null,
  pageEditJobs: {},
  deckEditJobs: {},
  deckEditRetries: {},
  pageEditPlanning: {},
  currentPages: [],
  error: null,
  sessionErrors: {},
  cancelReason: null,

  startGeneration: () =>
    set({
      status: 'running',
      isGenerating: true,
      progress: null,
      currentPages: [],
      error: null,
      cancelReason: null
    }),

  startPageEdit: (sessionId, { pageId, pageNumber }) =>
    set((state) => {
      const { [sessionId]: _cleared, ...sessionErrors } = state.sessionErrors
      return {
        pageEditJobs: {
          ...state.pageEditJobs,
          [sessionId]: {
            sessionId,
            pageId,
            pageNumber,
            status: 'starting',
            label: '',
            progress: 0
          }
        },
        error: null,
        sessionErrors
      }
    }),

  updatePageEdit: (sessionId, job) =>
    set((state) => ({
      pageEditJobs: state.pageEditJobs[sessionId]
        ? {
            ...state.pageEditJobs,
            [sessionId]: { ...state.pageEditJobs[sessionId], ...job }
          }
        : state.pageEditJobs
    })),

  finishPageEdit: (sessionId) =>
    set((state) => {
      const { [sessionId]: _finished, ...pageEditJobs } = state.pageEditJobs
      return { pageEditJobs }
    }),

  startDeckEdit: (sessionId, { totalPages, payload }) =>
    set((state) => {
      const { [sessionId]: _cleared, ...sessionErrors } = state.sessionErrors
      return {
        deckEditJobs: {
          ...state.deckEditJobs,
          [sessionId]: {
            sessionId,
            status: 'starting',
            label: '',
            progress: 0,
            totalPages: Math.max(1, totalPages),
            payload
          }
        },
        deckEditRetries: {
          ...state.deckEditRetries,
          [sessionId]: undefined
        },
        error: null,
        sessionErrors,
        cancelReason: null
      }
    }),

  updateDeckEdit: (sessionId, job) =>
    set((state) => ({
      deckEditJobs: state.deckEditJobs[sessionId]
        ? {
            ...state.deckEditJobs,
            [sessionId]: { ...state.deckEditJobs[sessionId], ...job }
          }
        : state.deckEditJobs
    })),

  finishDeckEdit: (sessionId, retry) =>
    set((state) => {
      const { [sessionId]: _finished, ...deckEditJobs } = state.deckEditJobs
      return {
        deckEditJobs,
        deckEditRetries: {
          ...state.deckEditRetries,
          [sessionId]: retry ? { ...retry, sessionId } : undefined
        },
        cancelReason: null
      }
    }),

  clearDeckEditRetry: (sessionId) =>
    set((state) => {
      const { [sessionId]: _cleared, ...deckEditRetries } = state.deckEditRetries
      return { deckEditRetries }
    }),

  startPageEditPlanning: (sessionId, pageId, assessmentId) =>
    set((state) => {
      const { [sessionId]: _cleared, ...sessionErrors } = state.sessionErrors
      return {
        pageEditPlanning: {
          ...state.pageEditPlanning,
          [sessionId]: { pageId, assessmentId, isAssessing: true, pendingPlan: null }
        },
        error: null,
        sessionErrors
      }
    }),

  setPendingPageEditPlan: (sessionId, plan) =>
    set((state) => ({
      pageEditPlanning: {
        ...state.pageEditPlanning,
        [sessionId]: {
          pageId: plan.targetPageId,
          assessmentId: state.pageEditPlanning[sessionId]?.assessmentId,
          isAssessing: false,
          pendingPlan: { ...plan, sessionId }
        }
      }
    })),

  finishPageEditPlanning: (sessionId, assessmentId) =>
    set((state) => {
      const planning = state.pageEditPlanning[sessionId]
      if (!planning) return { pageEditPlanning: state.pageEditPlanning }
      if (assessmentId && planning.assessmentId !== assessmentId) {
        return { pageEditPlanning: state.pageEditPlanning }
      }
      return {
        pageEditPlanning: {
          ...state.pageEditPlanning,
          [sessionId]: { ...planning, isAssessing: false }
        }
      }
    }),

  clearPendingPageEditPlan: (sessionId) =>
    set((state) => {
      const planning = state.pageEditPlanning[sessionId]
      if (!planning) return { pageEditPlanning: state.pageEditPlanning }
      return {
        pageEditPlanning: {
          ...state.pageEditPlanning,
          [sessionId]: { ...planning, pendingPlan: null }
        }
      }
    }),

  updateProgress: (progress) =>
    set((state) => ({
      progress: state.progress ? { ...state.progress, ...progress } : (progress as GenerateProgress)
    })),

  setPages: (pages) => set({ currentPages: pages }),

  addPage: (page) =>
    set((state) => {
      const existingIndex = state.currentPages.findIndex(
        (item) =>
          page.id === item.id ||
          (page.pageId && item.pageId
            ? item.pageId === page.pageId
            : item.pageNumber === page.pageNumber)
      )
      if (existingIndex < 0) {
        return { currentPages: [...state.currentPages, page] }
      }
      return {
        currentPages: state.currentPages.map((item, index) =>
          index === existingIndex ? { ...item, ...page } : item
        )
      }
    }),

  updatePage: (pageId, html, patch) =>
    set((state) => ({
      currentPages: state.currentPages.map((page) =>
        page.pageId === pageId ? { ...page, ...patch, html } : page
      )
    })),

  finishGeneration: () =>
    set({ status: 'completed', isGenerating: false, progress: null, cancelReason: null }),
  cancelGeneration: (reason = 'User cancelled generation') =>
    set({ status: 'cancelled', isGenerating: false, progress: null, cancelReason: reason }),
  setError: (error) => set({ status: 'failed', error, isGenerating: false }),
  setSessionError: (sessionId, error) =>
    set((state) => {
      const { [sessionId]: _cleared, ...sessionErrors } = state.sessionErrors
      return {
        sessionErrors: error ? { ...sessionErrors, [sessionId]: error } : sessionErrors
      }
    }),
  clearSessionError: (sessionId) =>
    set((state) => {
      const { [sessionId]: _cleared, ...sessionErrors } = state.sessionErrors
      return { sessionErrors }
    }),
  reset: () =>
    set({
      status: 'idle',
      isGenerating: false,
      progress: null,
      pageEditJobs: {},
      deckEditJobs: {},
      deckEditRetries: {},
      pageEditPlanning: {},
      currentPages: [],
      error: null,
      sessionErrors: {},
      cancelReason: null
    })
}))
