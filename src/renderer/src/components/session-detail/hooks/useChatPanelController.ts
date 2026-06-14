import { useMemo, useRef } from 'react'
import { useT } from '@renderer/i18n'
import { ipc, type UploadAssetsPayload } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { useGenerationActivityStore } from '@renderer/store/generationActivityStore'
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
  const error = useGenerateStore((state) => state.error)
  const selectedPageId = useSessionDetailUiStore((state) => state.selectedPageId)
  const addMessage = useSessionStore((state) => state.addMessage)
  const toastSuccess = useToastStore((state) => state.success)
  const toastError = useToastStore((state) => state.error)
  const toastWarning = useToastStore((state) => state.warning)
  const sendingMessageRef = useRef(false)

  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId]
  )

  const uploadFiles = async (files: File[]): Promise<void> => {
    if (!sessionId || files.length === 0) return
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
        uploadError instanceof Error
          ? uploadError.message
          : t('sessionDetail.assetUploadFailed')
      )
    } finally {
      useSessionDetailUiStore.getState().setIsUploadingAssets(false)
      useSessionDetailUiStore.getState().setAssetDragActive(false)
    }
  }

  const chooseAssets = async (assetType: 'image' | 'video'): Promise<void> => {
    if (!sessionId || useSessionDetailUiStore.getState().isUploadingAssets) return
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
        uploadError instanceof Error
          ? uploadError.message
          : t('sessionDetail.assetUploadFailed')
      )
    } finally {
      useSessionDetailUiStore.getState().setIsUploadingAssets(false)
    }
  }

  const send = async (modelConfigId: string, selectPageIds: string[] = []): Promise<boolean> => {
    const detailState = useSessionDetailUiStore.getState()
    if (
      isChatSendBlocked({
        sessionId,
        sending: sendingMessageRef.current,
        generating: useGenerateStore.getState().isGenerating,
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
      htmlPath: pages.length > 0 && context.chatType === 'page' ? context.targetPagePath : undefined,
      selector: context.selector || undefined,
      elementTag: context.hasSelector ? detailState.elementTag || undefined : undefined,
      elementText: context.hasSelector ? detailState.elementText || undefined : undefined,
      imagePaths,
      videoPaths
    }

    sendingMessageRef.current = true
    try {
      useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
      if (pages.length > 0) {
        useGenerationActivityStore.getState().startEdit(generatePayload)
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
      await ipc.startGenerate(generatePayload)
      return true
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : t('generating.failed')
      useGenerateStore.getState().setError(message)
      useGenerationActivityStore.getState().reset()
      toastError(message)
      return false
    } finally {
      sendingMessageRef.current = false
    }
  }

  const cancel = async (): Promise<void> => {
    if (!sessionId) return
    await ipc.cancelGenerate(sessionId)
    useGenerateStore.getState().cancelGeneration()
  }

  return {
    selectedPageExists: Boolean(selectedPage?.pageId),
    selectedPageNumber: selectedPage?.pageNumber,
    isGenerating,
    progress,
    error,
    uploadFiles,
    chooseAssets,
    send,
    cancel
  }
}
