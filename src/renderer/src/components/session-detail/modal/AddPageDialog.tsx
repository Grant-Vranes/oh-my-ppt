import { useEffect, useMemo, useState } from 'react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useModelAction } from '@renderer/hooks/useModelAction'
import { useGenerateStore, useSessionDetailUiStore, useSessionStore } from '@renderer/store'
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
  const setAddingPageId = useSessionDetailUiStore((state) => state.setAddingPageId)
  const currentPages = useGenerateStore((state) => state.currentPages)
  const loadSession = useSessionStore((state) => state.loadSession)
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
    setOpen(false)
    setValue('')
    const insertAfter = selectedPage?.pageNumber ?? normalizedPages.length
    let targetSelection: string | null | undefined = undefined
    let targetPageId: string | null = null
    let started = false
    let handedToJob = false

    try {
      const modelConfigId = await modelAction.ensureModelActive(selectedModelConfigId)
      if (!modelConfigId) return
      const sourcePageId = selectedPage?.id || normalizedPages.at(-1)?.id
      if (!sourcePageId) return
      const blankPage = await ipc.createBlankSessionPage({ sessionId, sourcePageId })
      targetPageId = blankPage.selectedPageId
      if (!targetPageId) throw new Error(t('sessionDetail.addPageFailed'))
      targetSelection = targetPageId
      setIsAddingPage(true)
      setAddingPageId(targetPageId)
      useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
      started = true
      useGenerateStore
        .getState()
        .setPages(
          blankPage.generatedPages.map((page) =>
            page.id === targetPageId ? { ...page, status: 'generating' } : page
          )
        )
      useSessionDetailUiStore.getState().setSelectedPageId(targetPageId)

      const result = await ipc.addPage({
        sessionId,
        modelConfigId,
        userMessage: description,
        insertAfterPageNumber: insertAfter,
        targetPageId
      })
      if (result.alreadyRunning) {
        throw new Error(t('sessionDetail.addPageFailed'))
      }
      handedToJob = true
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sessionDetail.addPageFailed')
      targetSelection = targetPageId
      console.warn('[session-detail] add generated page failed', message)
    } finally {
      if (!handedToJob && started) {
        if (targetPageId) {
          try {
            await loadSession(sessionId)
            useGenerateStore.getState().setPages(useSessionStore.getState().currentGeneratedPages)
          } catch (error) {
            console.warn('[session-detail] reload blank page failed', error)
          }
        }
        useSessionDetailUiStore.getState().finishAddPage(targetSelection)
        useGenerateStore.getState().finishGeneration()
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[520px] rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-3 text-base font-semibold text-[#2f3a2a]">
          {t('sessionDetail.addPage')}
        </h3>
        <p className="mb-3 text-xs text-[#a1a1aa]">{t('sessionDetail.addPageHint')}</p>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('sessionDetail.addPageDescription')}
          className="mb-4 h-40 w-full resize-none rounded-xl border border-[#fff7ed]/60 bg-[#f8f6f0] px-4 py-3 text-sm leading-relaxed text-[#2f3a2a] placeholder:text-[#a1a1aa] focus:border-[#18181b] focus:outline-none"
          autoFocus
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              value.trim()
            ) {
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
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-[#18181b] transition-colors hover:bg-[#f0ece3]"
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
