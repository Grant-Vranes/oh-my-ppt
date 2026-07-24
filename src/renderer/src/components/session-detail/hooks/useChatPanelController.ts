import { useMemo, useRef } from 'react'
import { useT } from '@renderer/i18n'
import { ipc, type UploadAssetsPayload } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useEditHistoryStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import type { GenerateStartPayload } from '@shared/generation.js'
import type { ChatPanelController } from '@renderer/types/session-detail'
import { normalizePagesForSelection } from '../shared/pageUtils'
import { isChatSendBlocked, resolveChatSendContext } from './chatSendUtils'

const isSupportedMediaFile = (file: File): boolean => {
  if (file.type.startsWith('image/')) return true
  if (/^video\/(mp4|webm|ogg)$/i.test(file.type)) return true
  return /\.(png|jpe?g|webp|gif|svg|mp4|webm|ogg)$/i.test(file.name)
}

export function useChatPanelController(sessionId: string): ChatPanelController {
  const t = useT()
  const currentPages = useGenerateStore((state) => state.currentPages)
  const isGenerating = useGenerateStore((state) => state.isGenerating)
  const progress = useGenerateStore((state) => state.progress)
  const pageEditJob = useGenerateStore((state) => state.pageEditJobs[sessionId] || null)
  const pageBeautifyJob = useGenerateStore((state) => state.pageBeautifyJobs[sessionId] || null)
  const deckEditJob = useGenerateStore((state) => state.deckEditJobs[sessionId] || null)
  const styleSwitchJob = useGenerateStore((state) => state.styleSwitchJobs[sessionId] || null)
  const deckEditRetry = useGenerateStore((state) => state.deckEditRetries[sessionId] || null)
  const pageEditPlanning = useGenerateStore((state) => state.pageEditPlanning[sessionId] || null)
  const error = useGenerateStore((state) => state.sessionErrors[sessionId] || null)
  const selectedPageEntityId = useSessionDetailUiStore((state) => state.selectedPageId)
  const addMessage = useSessionStore((state) => state.addMessage)
  const toastSuccess = useToastStore((state) => state.success)
  const toastError = useToastStore((state) => state.error)
  const toastWarning = useToastStore((state) => state.warning)
  const sendingMessageRef = useRef(false)

  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageEntityId) ?? pages[0] ?? null,
    [pages, selectedPageEntityId]
  )
  const selectedPageId = selectedPage?.pageId
  const isPageEditing = pageEditJob?.pageId === selectedPageId
  const isPlanningCurrentPage =
    pageEditPlanning?.isAssessing === true && pageEditPlanning.pageId === selectedPageId
  const pendingPageEditPlanForCurrentPage =
    pageEditPlanning?.pendingPlan?.targetPageId === selectedPageId
      ? pageEditPlanning.pendingPlan
      : null
  const hasActivePageEditJob = Boolean(pageEditJob)
  const hasActivePageBeautifyJob = Boolean(pageBeautifyJob)
  const isDeckEditing = Boolean(deckEditJob)
  const isStyleSwitching =
    styleSwitchJob?.status === 'starting' ||
    styleSwitchJob?.status === 'running' ||
    styleSwitchJob?.status === 'cancelling'
  const isSending =
    isGenerating ||
    isPlanningCurrentPage ||
    isPageEditing ||
    Boolean(pendingPageEditPlanForCurrentPage) ||
    hasActivePageBeautifyJob ||
    isDeckEditing ||
    isStyleSwitching

  const uploadFiles = async (files: File[]): Promise<void> => {
    const generateState = useGenerateStore.getState()
    const planning = generateState.pageEditPlanning[sessionId]
    const isAssessingSelectedPage =
      Boolean(selectedPageId) &&
      planning?.isAssessing === true &&
      planning.pageId === selectedPageId
    if (
      !sessionId ||
      files.length === 0 ||
      generateState.isGenerating ||
      Boolean(generateState.pageBeautifyJobs[sessionId]) ||
      isStyleSwitching ||
      isAssessingSelectedPage
    )
      return
    const mediaFiles = files.filter(isSupportedMediaFile).slice(0, 10)
    if (mediaFiles.length === 0) {
      toastWarning(t('sessionDetail.mediaOnly'))
      return
    }
    const payloadFiles: UploadAssetsPayload['files'] = mediaFiles
      .map((file) => ({
        path: window.electron?.getPathForFile?.(file) || '',
        name: file.name
      }))
      .filter((file) => file.path)
    if (payloadFiles.length === 0) {
      toastError(t('sessionDetail.mediaPathFailed'))
      return
    }
    useSessionDetailUiStore.getState().setIsUploadingAssets(true)
    try {
      const result = await ipc.uploadAssets({ sessionId, files: payloadFiles })
      if (result.assets.length > 0) {
        useSessionDetailUiStore.getState().addPendingAssets(result.assets)
        toastSuccess(t('sessionDetail.assetsAdded', { count: result.assets.length }))
      }
    } catch (uploadError) {
      toastError(
        uploadError instanceof Error ? uploadError.message : t('sessionDetail.assetUploadFailed')
      )
    } finally {
      useSessionDetailUiStore.getState().setIsUploadingAssets(false)
      useSessionDetailUiStore.getState().setAssetDragActive(false)
    }
  }

  const chooseAssets = async (assetType: 'image' | 'video'): Promise<void> => {
    const generateState = useGenerateStore.getState()
    const planning = generateState.pageEditPlanning[sessionId]
    const isAssessingSelectedPage =
      Boolean(selectedPageId) &&
      planning?.isAssessing === true &&
      planning.pageId === selectedPageId
    if (
      !sessionId ||
      useSessionDetailUiStore.getState().isUploadingAssets ||
      generateState.isGenerating ||
      isStyleSwitching ||
      isAssessingSelectedPage
    )
      return
    useSessionDetailUiStore.getState().setIsUploadingAssets(true)
    try {
      const result = await ipc.chooseAndUploadAssets(sessionId, assetType)
      if (result.cancelled) return
      if (result.assets.length > 0) {
        useSessionDetailUiStore.getState().addPendingAssets(result.assets)
        toastSuccess(t('sessionDetail.assetsAdded', { count: result.assets.length }))
      }
    } catch (uploadError) {
      toastError(
        uploadError instanceof Error ? uploadError.message : t('sessionDetail.assetUploadFailed')
      )
    } finally {
      useSessionDetailUiStore.getState().setIsUploadingAssets(false)
    }
  }

  const send = async (modelConfigId: string, selectPageIds: string[] = []): Promise<boolean> => {
    const detailState = useSessionDetailUiStore.getState()
    const initialGenerateState = useGenerateStore.getState()
    if (
      isChatSendBlocked({
        sessionId,
        sending: sendingMessageRef.current,
        generating:
          initialGenerateState.isGenerating ||
          initialGenerateState.styleSwitchJobs[sessionId]?.status === 'starting' ||
          initialGenerateState.styleSwitchJobs[sessionId]?.status === 'running' ||
          initialGenerateState.styleSwitchJobs[sessionId]?.status === 'cancelling',
        input: detailState.input,
        pendingAssetCount: detailState.pendingAssets.length
      })
    ) {
      return false
    }

    const content = detailState.input.trim() || t('sessionDetail.useUploadedAssets')
    const assetsForMessage = detailState.pendingAssets
    const imagePaths = assetsForMessage
      .map((asset) => asset.relativePath)
      .filter((item) => item.startsWith('./images/'))
    const videoPaths = assetsForMessage
      .map((asset) => asset.relativePath)
      .filter((item) => item.startsWith('./videos/'))
    const context = resolveChatSendContext({
      selectedSelector: detailState.selectedSelector,
      chatType: detailState.chatType,
      selectedPage,
      firstPage: pages[0] ?? null
    })
    if (!context.ready) {
      toastError(t('sessionDetail.selectPageFirst'))
      return false
    }
    const generateState = useGenerateStore.getState()
    const sessionPageEditJob = generateState.pageEditJobs[sessionId]
    const sessionDeckEditJob = generateState.deckEditJobs[sessionId]
    const sessionPlanning = generateState.pageEditPlanning[sessionId]
    if (sessionPageEditJob) {
      toastWarning(
        t(
          sessionPageEditJob.pageId === selectedPage?.pageId
            ? 'sessionDetail.pageEditPlanWaitForJob'
            : 'sessionDetail.pageEditOtherPageBusy'
        )
      )
      return false
    }
    if (sessionPlanning?.isAssessing === true || sessionPlanning?.pendingPlan) {
      toastWarning(t('sessionDetail.pageEditAssessmentBusy'))
      return false
    }
    if (generateState.isGenerating || sessionDeckEditJob) {
      return false
    }
    if (context.hasSelector && detailState.chatType !== 'page') detailState.setChatType('page')
    const selectedScopePages =
      context.chatType === 'main' && selectPageIds.length > 0
        ? pages
            .filter((page) => selectPageIds.includes(page.pageId))
            .map((page) => `P${page.pageNumber}`)
        : []
    const scopedMessageContent =
      selectedScopePages.length > 0
        ? `${t('sessionDetail.mainPageScopeMessagePrefix', { pages: selectedScopePages.join('、') })}\n${content}`
        : content
    const generatePayload: GenerateStartPayload = {
      sessionId,
      modelConfigId,
      userMessage: scopedMessageContent,
      type: pages.length > 0 ? 'page' : 'deck',
      chatType: context.chatType,
      selectPageIds: context.chatType === 'main' ? selectPageIds : undefined,
      chatPageId: context.targetPageId,
      selectedPageId:
        pages.length > 0 && context.chatType === 'page' ? context.targetPageId : undefined,
      htmlPath:
        pages.length > 0 && context.chatType === 'page' ? context.targetPagePath : undefined,
      selector: context.selector || undefined,
      elementTag: context.hasSelector ? detailState.elementTag || undefined : undefined,
      elementText: context.hasSelector ? detailState.elementText || undefined : undefined,
      imagePaths,
      videoPaths
    }

    sendingMessageRef.current = true
    let assessmentId: string | undefined
    try {
      const isPageEdit = context.chatType === 'page' && pages.length > 0
      const isDeckEdit = context.chatType === 'main' && pages.length > 0
      const targetPage = pages.find((page) => page.id === context.targetPageId)
      if (isPageEdit) {
        const targetPageId = targetPage?.pageId || context.targetPageId || ''
        if (useEditHistoryStore.getState().hasPendingEdits(targetPageId)) {
          toastWarning(t('sessionDetail.pageEditPlanRequiresSavedEdits'))
          return false
        }
        assessmentId = crypto.randomUUID()
        generateState.startPageEditPlanning(sessionId, targetPageId, assessmentId)
        const assessment = await ipc.assessPageEdit(generatePayload)
        const latestGenerateState = useGenerateStore.getState()
        const latestPlanning = latestGenerateState.pageEditPlanning[sessionId]
        const assessmentIsCurrent =
          latestPlanning?.isAssessing === true &&
          latestPlanning.pageId === targetPageId &&
          latestPlanning.assessmentId === assessmentId
        if (!assessmentIsCurrent) return false
        if (
          latestGenerateState.isGenerating ||
          latestGenerateState.pageEditJobs[sessionId] ||
          latestGenerateState.deckEditJobs[sessionId]
        ) {
          toastWarning(t('sessionDetail.pageEditPlanWaitForJob'))
          return false
        }

        if (!assessment.requiresConfirmation) {
          const autoApplyPayload = { ...generatePayload, autoApply: true }
          latestGenerateState.startPageEdit(sessionId, {
            pageId: targetPageId,
            pageNumber: targetPage?.pageNumber
          })
          addMessage({
            id: crypto.randomUUID(),
            session_id: sessionId,
            chat_scope: 'page',
            page_id: context.messagePageId,
            selector: context.selector,
            image_paths: imagePaths,
            video_paths: videoPaths,
            role: 'user',
            content: scopedMessageContent,
            type: 'text',
            tool_name: null,
            tool_call_id: null,
            token_count: null,
            created_at: Math.floor(Date.now() / 1000)
          })
          detailState.setInput('')
          detailState.clearPendingAssets()
          detailState.clearSelectedElement()
          const result = await ipc.startPageEdit(autoApplyPayload)
          if (result.alreadyRunning) {
            useGenerateStore.getState().finishPageEdit(sessionId)
            return false
          }
          useGenerateStore.getState().updatePageEdit(sessionId, {
            runId: result.runId,
            status: 'running'
          })
          return true
        }
        latestGenerateState.setPendingPageEditPlan(sessionId, {
          plan: assessment.plan,
          payload: generatePayload,
          targetPageId: assessment.targetPageId,
          targetPageNumber: assessment.targetPageNumber
        })
        detailState.setInput('')
        detailState.clearPendingAssets()
        detailState.clearSelectedElement()
        return true
      } else if (isDeckEdit) {
        generateState.startDeckEdit(sessionId, {
          totalPages: selectPageIds.length || pages.length,
          payload: generatePayload
        })
      } else {
        useGenerateStore.getState().clearSessionError(sessionId)
        useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
      }
      addMessage({
        id: crypto.randomUUID(),
        session_id: sessionId,
        chat_scope: context.chatType,
        page_id: context.messagePageId,
        selector: context.chatType === 'page' ? context.selector : null,
        image_paths: imagePaths,
        video_paths: videoPaths,
        role: 'user',
        content: scopedMessageContent,
        type: 'text',
        tool_name: null,
        tool_call_id: null,
        token_count: null,
        created_at: Math.floor(Date.now() / 1000)
      })
      detailState.setInput('')
      detailState.clearPendingAssets()
      detailState.clearSelectedElement()
      const result = isDeckEdit
        ? await ipc.startDeckEdit(generatePayload)
        : await ipc.startGenerate(generatePayload)
      if (result.alreadyRunning) {
        if (isPageEdit) useGenerateStore.getState().finishPageEdit(sessionId)
        else if (isDeckEdit) useGenerateStore.getState().finishDeckEdit(sessionId)
        else {
          useGenerateStore.getState().finishGeneration()
        }
        return false
      }
      return true
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : t('generating.failed')
      if (/^(生成已取消|Generation cancelled|Generation canceled)$/i.test(message)) {
        return false
      }
      const hadGlobalGeneration = useGenerateStore.getState().isGenerating
      if (useGenerateStore.getState().pageEditJobs[sessionId]?.pageId === selectedPage?.pageId) {
        useGenerateStore.getState().finishPageEdit(sessionId)
      }
      if (useGenerateStore.getState().deckEditJobs[sessionId]) {
        useGenerateStore.getState().finishDeckEdit(sessionId)
      }
      useGenerateStore.getState().finishPageEditPlanning(sessionId, assessmentId)
      useGenerateStore.getState().setSessionError(sessionId, message)
      if (hadGlobalGeneration) {
        useGenerateStore.setState({ status: 'failed', isGenerating: false, progress: null })
      }
      toastError(message)
      return false
    } finally {
      useGenerateStore.getState().finishPageEditPlanning(sessionId, assessmentId)
      sendingMessageRef.current = false
    }
  }

  const confirmPageEditPlan = async (): Promise<boolean> => {
    const pendingPlan = useGenerateStore.getState().pageEditPlanning[sessionId]?.pendingPlan
    if (!pendingPlan || !sessionId || sendingMessageRef.current) return false
    const currentPageId = selectedPage?.pageId
    if (currentPageId !== pendingPlan.targetPageId) {
      toastWarning(t('sessionDetail.pageEditPlanReturnToTarget'))
      return false
    }
    const generateState = useGenerateStore.getState()
    if (
      generateState.isGenerating ||
      generateState.pageEditJobs[sessionId] ||
      generateState.deckEditJobs[sessionId]
    ) {
      toastWarning(t('sessionDetail.pageEditPlanWaitForJob'))
      return false
    }
    if (useEditHistoryStore.getState().hasPendingEdits(pendingPlan.targetPageId)) {
      toastWarning(t('sessionDetail.pageEditPlanRequiresSavedEdits'))
      return false
    }

    sendingMessageRef.current = true
    try {
      generateState.startPageEdit(sessionId, {
        pageId: pendingPlan.targetPageId,
        pageNumber: pendingPlan.targetPageNumber
      })
      addMessage({
        id: crypto.randomUUID(),
        session_id: sessionId,
        chat_scope: 'page',
        page_id: pendingPlan.payload.chatPageId || pendingPlan.targetPageId,
        selector: pendingPlan.payload.selector || null,
        image_paths: pendingPlan.payload.imagePaths || [],
        video_paths: pendingPlan.payload.videoPaths || [],
        role: 'user',
        content: pendingPlan.payload.userMessage,
        type: 'text',
        tool_name: null,
        tool_call_id: null,
        token_count: null,
        created_at: Math.floor(Date.now() / 1000)
      })
      useGenerateStore.getState().clearPendingPageEditPlan(sessionId)
      const result = await ipc.startPageEdit({
        ...pendingPlan.payload,
        approvedPlan: pendingPlan.plan
      })
      if (result.alreadyRunning) {
        useGenerateStore.getState().finishPageEdit(sessionId)
        return false
      }
      useGenerateStore.getState().updatePageEdit(sessionId, {
        runId: result.runId,
        status: 'running'
      })
      return true
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : t('generating.failed')
      useGenerateStore.getState().finishPageEdit(sessionId)
      useGenerateStore.getState().setSessionError(sessionId, message)
      toastError(message)
      return false
    } finally {
      sendingMessageRef.current = false
    }
  }

  const cancelPageEditPlan = (): void => {
    useGenerateStore.getState().clearPendingPageEditPlan(sessionId)
  }

  const retryDeckEdit = async (modelConfigId: string): Promise<boolean> => {
    const retry = useGenerateStore.getState().deckEditRetries[sessionId]
    if (!retry || !sessionId || sendingMessageRef.current) return false

    sendingMessageRef.current = true
    try {
      const payload = { ...retry.payload, sessionId, modelConfigId }
      useGenerateStore.getState().startDeckEdit(sessionId, {
        totalPages: retry.failedPageCount,
        payload
      })
      const result = await ipc.retryDeckEdit({
        ...payload,
        failedRunId: retry.runId
      })
      if (result.alreadyRunning || (!result.runId && result.failedPageCount === 0)) {
        useGenerateStore.getState().finishDeckEdit(sessionId, retry)
        return false
      }
      useGenerateStore
        .getState()
        .updateDeckEdit(sessionId, { runId: result.runId, status: 'running' })
      return true
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : t('generating.failed')
      useGenerateStore.getState().finishDeckEdit(sessionId, retry)
      useGenerateStore.getState().setSessionError(sessionId, message)
      toastError(message)
      return false
    } finally {
      sendingMessageRef.current = false
    }
  }

  const reconcilePageEditState = async (): Promise<void> => {
    try {
      const state = await ipc.getPageEditState(sessionId)
      if (!state.hasActiveRun) {
        useGenerateStore.getState().finishPageEdit(sessionId)
      }
    } catch {
      // Keep the local lock when the backend state cannot be verified.
    }
  }

  const reconcileDeckEditState = async (): Promise<void> => {
    try {
      const state = await ipc.getDeckEditState(sessionId)
      if (!state.hasActiveRun) {
        useGenerateStore.getState().finishDeckEdit(sessionId)
      }
    } catch {
      // Keep the local lock when the backend state cannot be verified.
    }
  }

  const cancel = async (): Promise<void> => {
    if (!sessionId) return
    const generateState = useGenerateStore.getState()
    const planning = generateState.pageEditPlanning[sessionId]
    if (planning?.pendingPlan) {
      generateState.clearPendingPageEditPlan(sessionId)
      return
    }
    if (planning?.isAssessing) {
      try {
        await ipc.cancelPageEdit(sessionId)
      } catch (cancelError) {
        toastError(cancelError instanceof Error ? cancelError.message : t('generating.failed'))
      } finally {
        useGenerateStore.getState().finishPageEditPlanning(sessionId, planning.assessmentId)
      }
      return
    }
    if (useGenerateStore.getState().pageEditJobs[sessionId]) {
      if (useGenerateStore.getState().pageEditJobs[sessionId]?.status === 'cancelling') return
      try {
        const result = await ipc.cancelPageEdit(sessionId)
        if (result.success) {
          useGenerateStore.getState().updatePageEdit(sessionId, {
            status: 'cancelling',
            label: t('sessionDetail.activityCancelling')
          })
        }
        await reconcilePageEditState()
      } catch (cancelError) {
        toastError(cancelError instanceof Error ? cancelError.message : t('generating.failed'))
        await reconcilePageEditState()
      }
      return
    }
    if (useGenerateStore.getState().pageBeautifyJobs[sessionId]) {
      if (useGenerateStore.getState().pageBeautifyJobs[sessionId]?.status === 'cancelling') return
      try {
        const result = await ipc.cancelPageBeautify(sessionId)
        if (result.success) {
          useGenerateStore.getState().updatePageBeautify(sessionId, {
            status: 'cancelling',
            label: t('sessionDetail.activityCancelling')
          })
        } else {
          // Cancel was rejected (stale or already-finished job). No terminal chunk will ever
          // arrive, so the optimistic `pageBeautifyJobs` entry would lock the chat input
          // forever. Reconcile from the authoritative backend state; if reconciliation itself
          // fails, clear the job rather than restoring `running` — there is no terminal in
          // flight to remove it later.
          try {
            const snapshot = await ipc.getPageBeautifyState(sessionId)
            if (snapshot.hasActiveRun && snapshot.status !== 'cancelled') {
              useGenerateStore.getState().updatePageBeautify(sessionId, {
                status: snapshot.status === 'queued' ? 'queued' : 'running',
                label: t('sessionDetail.pageBeautifying')
              })
            } else {
              useGenerateStore.getState().finishPageBeautify(sessionId)
            }
          } catch {
            useGenerateStore.getState().finishPageBeautify(sessionId)
          }
        }
      } catch (cancelError) {
        toastError(cancelError instanceof Error ? cancelError.message : t('generating.failed'))
      }
      return
    }
    if (useGenerateStore.getState().deckEditJobs[sessionId]) {
      if (useGenerateStore.getState().deckEditJobs[sessionId]?.status === 'cancelling') return
      try {
        const result = await ipc.cancelDeckEdit(sessionId)
        if (result.success) {
          useGenerateStore.getState().updateDeckEdit(sessionId, {
            status: 'cancelling',
            label: t('sessionDetail.activityCancelling')
          })
        }
        await reconcileDeckEditState()
      } catch (cancelError) {
        toastError(cancelError instanceof Error ? cancelError.message : t('generating.failed'))
        await reconcileDeckEditState()
      }
      return
    }
    await ipc.cancelGenerate(sessionId)
    useGenerateStore.getState().cancelGeneration()
  }

  return {
    selectedPageExists: Boolean(selectedPage?.pageId),
    selectedPageNumber: selectedPage?.pageNumber,
    isGenerating: isSending,
    isPageEditing,
    isDeckEditing,
    deckEditRetry,
    isPlanningPageEdit: isPlanningCurrentPage,
    pendingPageEditPlan: pendingPageEditPlanForCurrentPage,
    hasActivePageEditJob,
    progress:
      isPageEditing && pageEditJob
        ? {
            stage: pageEditJob.status,
            label: pageEditJob.label,
            currentPage: pageEditJob.pageNumber,
            totalPages: 1,
            progress: pageEditJob.progress
          }
        : isDeckEditing && deckEditJob
          ? {
              stage: deckEditJob.status,
              label: deckEditJob.label,
              totalPages: deckEditJob.totalPages,
              progress: deckEditJob.progress
            }
          : progress,
    error,
    uploadFiles,
    chooseAssets,
    send,
    confirmPageEditPlan,
    cancelPageEditPlan,
    retryDeckEdit,
    cancel
  }
}
