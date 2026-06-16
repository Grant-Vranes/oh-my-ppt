import { useEffect, useMemo, useState } from 'react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useModelAction } from '@renderer/hooks/useModelAction'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { ModelSplitButton } from '../../model/ModelActionButton'
import { normalizePagesForSelection } from '../shared/pageUtils'

interface AddPageDialogProps {
  sessionId: string
}

export function AddPageDialog({ sessionId }: AddPageDialogProps): React.JSX.Element | null {
  const t = useT()
  const modelAction = useModelAction()
  const open = useSessionDetailUiStore((state) => state.addPageDialogOpen)
  const selectedPageId = useSessionDetailUiStore((state) => state.selectedPageId)
  const setOpen = useSessionDetailUiStore((state) => state.setAddPageDialogOpen)
  const setIsAddingPage = useSessionDetailUiStore((state) => state.setIsAddingPage)
  const currentPages = useGenerateStore((state) => state.currentPages)
  const loadSession = useSessionStore((state) => state.loadSession)
  const toastError = useToastStore((state) => state.error)
  const [value, setValue] = useState('')

  const normalizedPages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const selectedPage = useMemo(
    () => normalizedPages.find((page) => page.id === selectedPageId) ?? normalizedPages[0] ?? null,
    [normalizedPages, selectedPageId]
  )

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const handleAddPage = async (selectedModelConfigId?: string): Promise<void> => {
    if (!sessionId || !value.trim()) return
    const description = value.trim()
    const beforePageIds = new Set(normalizedPages.map((page) => page.pageId))
    const beforePageCount = normalizedPages.length
    setOpen(false)
    setValue('')
    setIsAddingPage(true)
    const insertAfter = selectedPage?.pageNumber ?? normalizedPages.length
    useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
    let targetSelection: string | null | undefined = undefined

    try {
      const modelConfigId = await modelAction.ensureModelActive(selectedModelConfigId)
      if (!modelConfigId) return
      await ipc.addPage({
        sessionId,
        modelConfigId,
        userMessage: description,
        insertAfterPageNumber: insertAfter
      })

      let latestGeneratedPages = useSessionStore.getState().currentGeneratedPages
      let latestPages = normalizePagesForSelection(latestGeneratedPages)
      let addedPage = latestPages.find((page) => !beforePageIds.has(page.pageId))

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await loadSession(sessionId)
        latestGeneratedPages = useSessionStore.getState().currentGeneratedPages
        latestPages = normalizePagesForSelection(latestGeneratedPages)
        addedPage = latestPages.find((page) => !beforePageIds.has(page.pageId))
        if (addedPage || latestPages.length > beforePageCount) break
        await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
      }

      useGenerateStore.getState().setPages(latestGeneratedPages)
      const fallbackPage =
        latestPages[Math.min(insertAfter, Math.max(latestPages.length - 1, 0))] ||
        latestPages[latestPages.length - 1]
      targetSelection = (addedPage || fallbackPage)?.id ?? null
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sessionDetail.addPageFailed')
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
        <h3 className="mb-3 text-base font-semibold text-[#2f3a2a]">
          {t('sessionDetail.addPage')}
        </h3>
        <p className="mb-3 text-xs text-[#8a9a7b]">{t('sessionDetail.addPageHint')}</p>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('sessionDetail.addPageDescription')}
          className="mb-4 h-40 w-full resize-none rounded-xl border border-[#d4e4c1]/60 bg-[#f8f6f0] px-4 py-3 text-sm leading-relaxed text-[#2f3a2a] placeholder:text-[#8a9a7b] focus:border-[#5d6b4d] focus:outline-none"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && value.trim()) {
              event.preventDefault()
              void handleAddPage()
            }
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-[#5d6b4d] transition-colors hover:bg-[#f0ece3]"
          >
            {t('sessionDetail.addPageCancel')}
          </button>
          <ModelSplitButton
            modelAction={modelAction}
            label={t('sessionDetail.addPageGenerate')}
            disabled={!value.trim()}
            tone="primary"
            size="sm"
            className="rounded-xl"
            mainClassName="min-w-[104px] justify-center text-sm"
            triggerClassName="h-9"
            onRun={(modelConfigId) => void handleAddPage(modelConfigId)}
          />
        </div>
      </div>
    </div>
  )
}
