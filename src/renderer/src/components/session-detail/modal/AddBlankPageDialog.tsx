import { useMemo } from 'react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { normalizePagesForSelection } from '../shared/pageUtils'

interface AddBlankPageDialogProps {
  sessionId: string
}

export function AddBlankPageDialog({
  sessionId
}: AddBlankPageDialogProps): React.JSX.Element | null {
  const t = useT()
  const open = useSessionDetailUiStore((state) => state.blankPageDialogOpen)
  const sourcePageId = useSessionDetailUiStore((state) => state.blankPageSourceId)
  const setOpen = useSessionDetailUiStore((state) => state.setBlankPageDialogOpen)
  const setSourcePageId = useSessionDetailUiStore((state) => state.setBlankPageSourceId)
  const setIsAddingPage = useSessionDetailUiStore((state) => state.setIsAddingPage)
  const currentPages = useGenerateStore((state) => state.currentPages)
  const loadSession = useSessionStore((state) => state.loadSession)
  const toastError = useToastStore((state) => state.error)

  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])

  const handleCreateBlankPage = async (): Promise<void> => {
    if (!sessionId || !sourcePageId) return
    const sourcePage = pages.find((page) => page.id === sourcePageId)
    if (!sourcePage) return
    setOpen(false)
    setIsAddingPage(true)
    useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
    let targetSelection: string | null | undefined = undefined

    try {
      const result = await ipc.createBlankSessionPage({
        sessionId,
        sourcePageId: sourcePage.id
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      await loadSession(sessionId)
      useGenerateStore.getState().setPages(useSessionStore.getState().currentGeneratedPages)
      targetSelection = result.selectedPageId || null
      useSessionDetailUiStore.getState().bumpPreviewKey()
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sessionDetail.addBlankPageFailed')
      toastError(message)
    } finally {
      useSessionDetailUiStore.getState().finishAddPage(targetSelection)
      useGenerateStore.getState().finishGeneration()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[520px] rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-2 text-base font-semibold text-[#2f3a2a]">
          {t('sessionDetail.addBlankPage')}
        </h3>
        <p className="mb-4 text-xs leading-5 text-[#8a9a7b]">
          {t('sessionDetail.addBlankPageHint')}
        </p>
        <div className="mb-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setSourcePageId(page.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                sourcePageId === page.id
                  ? 'border-[#8eaa70] bg-[#eef6e7] text-[#2f3a2a]'
                  : 'border-[#fff7ed]/60 bg-[#f8f6f0] text-[#5d6b4d] hover:bg-[#f0ece3]'
              }`}
            >
              <span className="shrink-0 rounded-md bg-[#fff7ed]/70 px-2 py-1 text-[11px] font-semibold text-[#3e4a32]">
                P{page.pageNumber}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {page.title || t('sessionDetail.untitledPage')}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-[#5d6b4d] transition-colors hover:bg-[#f0ece3]"
          >
            {t('sessionDetail.addPageCancel')}
          </button>
          <button
            type="button"
            disabled={!sourcePageId}
            onClick={() => void handleCreateBlankPage()}
            className="cursor-pointer rounded-xl bg-[#5d6b4d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3e4a32] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('sessionDetail.addBlankPageCreate')}
          </button>
        </div>
      </div>
    </div>
  )
}
