import { useCallback, useEffect, forwardRef, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useSessionDetailUiStore, useSessionStore } from '@renderer/store'
import { PreviewIframe, type PreviewIframeHandle } from '../../preview/PreviewIframe'
import type { EditModeMovePayload, EditSelectionPayload } from '../../preview/edit-mode-script'
import type { SessionPreviewPage } from '../shared/types'
import { useT } from '@renderer/i18n'
import { EDITOR_INSET, EditorGuidesOverlay } from './EditorGuidesOverlay'
import { trySessionSlideSize } from '@shared/slide-size'

export const PreviewStage = forwardRef<
  PreviewIframeHandle,
  {
    selectedPage: SessionPreviewPage | null
    sessionTitle?: string | null
    previewRefreshKey?: number
    onElementMoved: (payload: EditModeMovePayload) => void
    onElementSelected: (payload: EditSelectionPayload) => void
    onCancelElementEdit: () => void
    onDiscardAllEdits: () => void
    onUndo: () => void
    onRedo: () => void
    onReplayPendingEdits: () => void
    onDeleteRequest?: (selector: string) => void
  }
>(function PreviewStage(
  {
    selectedPage,
    previewRefreshKey = 0,
    onElementMoved,
    onElementSelected,
    onCancelElementEdit,
    onDiscardAllEdits,
    onUndo,
    onRedo,
    onReplayPendingEdits,
    onDeleteRequest
  },
  ref
) {
  const t = useT()
  const previewIframeRef = useRef<PreviewIframeHandle>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const wasEditingRef = useRef(false)
  const previewIdentityRef = useRef('')
  const animationPreviewIdentityRef = useRef('')
  const restoreTimerRef = useRef<number | null>(null)
  const [previewReloadSignal, setPreviewReloadSignal] = useState(0)
  const previewKey = useSessionDetailUiStore((state) => state.previewKey)
  const currentSession = useSessionStore((state) => state.currentSession)
  const slideSize = trySessionSlideSize(currentSession)
  const interactionMode = useSessionDetailUiStore((state) => state.interactionMode)
  const setInteractionMode = useSessionDetailUiStore((state) => state.setInteractionMode)
  const setWorkspaceTab = useSessionDetailUiStore((state) => state.setWorkspaceTab)
  const editSelectedSelector = useSessionDetailUiStore((state) => state.editSelectedSelector)
  const selectedSelector = useSessionDetailUiStore((state) => state.selectedSelector)
  const setSelectedElement = useSessionDetailUiStore((state) => state.setSelectedElement)
  const clearSelectedElement = useSessionDetailUiStore((state) => state.clearSelectedElement)
  const isEditing = interactionMode === 'edit'
  const isAnimationSelecting = interactionMode === 'animation-select'
  const isInspecting = interactionMode === 'ai-inspect' || isAnimationSelecting

  const setPreviewIframeHandle = useCallback(
    (handle: PreviewIframeHandle | null): void => {
      previewIframeRef.current = handle
      if (typeof ref === 'function') {
        ref(handle)
        return
      }
      if (ref) {
        ref.current = handle
      }
    },
    [ref]
  )

  const restoreEditSelection = useCallback((selector: string): void => {
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current)
      restoreTimerRef.current = null
    }

    let attempts = 0
    const tryRestore = (): void => {
      attempts += 1
      window.requestAnimationFrame(() => {
        const restorePromise = previewIframeRef.current?.restoreEditModeSelection(selector)
        void restorePromise?.then((restored) => {
          if (restored || attempts >= 3) return
          restoreTimerRef.current = window.setTimeout(tryRestore, 50)
        })
      })
    }

    restoreTimerRef.current = window.setTimeout(tryRestore, 0)
  }, [])

  const restoreAnimationSelection = useCallback((selector: string): void => {
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current)
      restoreTimerRef.current = null
    }

    let attempts = 0
    const tryRestore = (): void => {
      attempts += 1
      window.requestAnimationFrame(() => {
        const restorePromise = previewIframeRef.current?.restoreInspectorSelection(selector)
        void restorePromise?.then((restored) => {
          if (restored || attempts >= 3) return
          restoreTimerRef.current = window.setTimeout(tryRestore, 50)
        })
      })
    }

    restoreTimerRef.current = window.setTimeout(tryRestore, 0)
  }, [])

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }
  }, [])

  const handleDidReload = useCallback((): void => {
    onReplayPendingEdits()
    setPreviewReloadSignal((value) => value + 1)
    if (isEditing && editSelectedSelector) {
      restoreEditSelection(editSelectedSelector)
      return
    }
    if (isAnimationSelecting && selectedSelector) {
      restoreAnimationSelection(selectedSelector)
    }
  }, [
    editSelectedSelector,
    isAnimationSelecting,
    isEditing,
    onReplayPendingEdits,
    restoreAnimationSelection,
    restoreEditSelection,
    selectedSelector
  ])

  useEffect(() => {
    const previewIdentity = `${selectedPage?.pageId || ''}:${previewKey}:${previewRefreshKey}`
    const enteredEditMode = isEditing && !wasEditingRef.current
    const previewChangedWhileEditing = isEditing && previewIdentity !== previewIdentityRef.current

    wasEditingRef.current = isEditing
    previewIdentityRef.current = previewIdentity

    if (!isEditing || !editSelectedSelector) return
    if (!enteredEditMode && !previewChangedWhileEditing) return

    restoreEditSelection(editSelectedSelector)
    return () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }
  }, [
    editSelectedSelector,
    isEditing,
    restoreEditSelection,
    selectedPage?.pageId,
    previewKey,
    previewRefreshKey
  ])

  useEffect(() => {
    if (!isAnimationSelecting || !selectedSelector) return
    const previewIdentity = `${selectedPage?.pageId || ''}:${previewKey}:${previewRefreshKey}`
    if (previewIdentity === animationPreviewIdentityRef.current) return
    animationPreviewIdentityRef.current = previewIdentity
    restoreAnimationSelection(selectedSelector)
  }, [
    isAnimationSelecting,
    previewKey,
    previewRefreshKey,
    restoreAnimationSelection,
    selectedPage?.pageId,
    selectedSelector
  ])

  useEffect(() => {
    if (interactionMode === 'preview') return
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const isEditableTarget =
        target instanceof Element &&
        Boolean(
          target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
        )
      if (isEditing && !isEditableTarget && (event.metaKey || event.ctrlKey)) {
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) onRedo()
          else onUndo()
          return
        }
        if (key === 'y') {
          event.preventDefault()
          onRedo()
          return
        }
      }
      if (event.key === 'Escape') {
        if (isEditing) {
          onDiscardAllEdits()
        } else if (isAnimationSelecting && selectedSelector) {
          clearSelectedElement()
        } else {
          setInteractionMode('preview')
          setWorkspaceTab('preview')
          onCancelElementEdit()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    interactionMode,
    clearSelectedElement,
    isAnimationSelecting,
    isEditing,
    onDiscardAllEdits,
    onCancelElementEdit,
    onUndo,
    onRedo,
    selectedSelector,
    setInteractionMode,
    setWorkspaceTab
  ])

  if (!slideSize) {
    return <div className="min-h-0 flex-1 bg-[#f5f1e8]" />
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[2rem] bg-[#e8e0d0]/54 p-3 shadow-[0_18px_38px_rgba(93,107,77,0.11)]">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#d4e4c1]/42" />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-48 w-64 rounded-[5%_95%_10%_90%/85%_15%_85%_15%] bg-[#c8b89e]/20" />
        {selectedPage ? (
          <div
            ref={frameRef}
            className="relative h-full overflow-hidden rounded-[1.55rem] bg-[#f5f1e8] shadow-[0_10px_24px_rgba(93,107,77,0.11)]"
          >
            <div
              ref={canvasHostRef}
              className={
                isEditing
                  ? 'absolute bottom-2 right-2 overflow-hidden rounded-[1rem]'
                  : 'absolute inset-0 overflow-hidden rounded-[inherit]'
              }
              style={isEditing ? { left: EDITOR_INSET, top: EDITOR_INSET } : undefined}
            >
              <PreviewIframe
                ref={setPreviewIframeHandle}
                key={`preview-${selectedPage.pageId}-${previewKey}-${previewRefreshKey}`}
                src={selectedPage.sourceUrl}
                htmlPath={selectedPage.htmlPath}
                pageId={selectedPage.pageId}
                title={`preview-page-${selectedPage.pageNumber}`}
                slideSize={slideSize}
                inspectable
                interactionMode={interactionMode}
                inspecting={isInspecting}
                editMode={isEditing}
                onSelectorSelected={setSelectedElement}
                onElementMoved={onElementMoved}
                onElementSelected={onElementSelected}
                onInspectExit={() => {
                  if (isAnimationSelecting && selectedSelector) {
                    clearSelectedElement()
                    return
                  }
                  setInteractionMode('preview')
                  setWorkspaceTab('preview')
                  onCancelElementEdit()
                }}
                onDidReload={handleDidReload}
                onDeleteRequest={onDeleteRequest}
              />
            </div>

            {isEditing && (
              <EditorGuidesOverlay
                selectedPageId={selectedPage.pageId}
                frameRef={frameRef}
                canvasHostRef={canvasHostRef}
                previewIframeRef={previewIframeRef}
                reloadSignal={previewReloadSignal}
                slideSize={slideSize}
              />
            )}
            {selectedPage.status === 'failed' && (
              <div className="absolute bottom-5 left-5 z-20 max-w-[520px] rounded-[1rem] bg-[#fff4ef]/92 px-3 py-2 text-xs text-[#8e5a53] shadow-[0_10px_24px_rgba(142,90,83,0.12)] backdrop-blur-sm">
                {t('sessionDetail.failedPageHint')}
              </div>
            )}
          </div>
        ) : (
          <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-[1.55rem] bg-[#f5f1e8]/84 text-center text-[#5d6b4d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.32)]">
            <Sparkles className="h-7 w-7 text-[#8fbc8f]" />
            <div className="space-y-1">
              <p className="text-base font-medium text-[#3e4a32]">
                {t('sessionDetail.emptyPreviewTitle')}
              </p>
              <p className="text-sm">{t('sessionDetail.briefHint')}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
})
