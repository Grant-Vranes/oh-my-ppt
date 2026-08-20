import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useGenerateStore, useSessionDetailUiStore, useToastStore } from '@renderer/store'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { normalizePagesForSelection } from '../shared/pageUtils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'

interface PageTitleEditDialogProps {
  sessionId: string
}

export function PageTitleEditDialog({ sessionId }: PageTitleEditDialogProps): React.JSX.Element {
  const t = useT()
  const pageId = useSessionDetailUiStore((state) => state.pageTitleEditPageId)
  const value = useSessionDetailUiStore((state) => state.pageTitleEditDraft)
  const isManagingPages = useSessionDetailUiStore((state) => state.isManagingPages)
  const currentPages = useGenerateStore((state) => state.currentPages)
  const setValue = useSessionDetailUiStore((state) => state.setPageTitleEditDraft)
  const close = useSessionDetailUiStore((state) => state.closePageTitleEdit)
  const toastError = useToastStore((state) => state.error)
  const open = Boolean(pageId)

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && !isManagingPages) close()
  }

  const handleSave = async (): Promise<void> => {
    if (!sessionId || !pageId) return
    const title = value.replace(/\s+/g, ' ').trim()
    if (!title) {
      toastError(t('pageManagement.pageTitleRequired'))
      return
    }
    const page = normalizePagesForSelection(currentPages).find((item) => item.id === pageId)
    if (page && title === page.title) {
      close()
      return
    }
    useSessionDetailUiStore.getState().setIsManagingPages(true)
    try {
      const result = await ipc.updateSessionPageTitle({
        sessionId,
        pageId,
        title
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      useSessionDetailUiStore.getState().setSelectedPageId(result.selectedPageId || pageId)
      useSessionDetailUiStore.getState().bumpPreviewKey()
      close()
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('pageManagement.updateTitleFailed'))
    } finally {
      useSessionDetailUiStore.getState().setIsManagingPages(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showClose={!isManagingPages}>
        <DialogHeader>
          <DialogTitle>{t('pageManagement.editPageTitle')}</DialogTitle>
          <DialogDescription>{t('pageManagement.editPageTitleDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-[#18181b]" htmlFor="page-title-input">
            {t('pageManagement.pageTitleLabel')}
          </label>
          <Input
            id="page-title-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleSave()
              }
            }}
            placeholder={t('pageManagement.pageTitlePlaceholder')}
            disabled={isManagingPages}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isManagingPages}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isManagingPages || !value.trim()}
          >
            {t('pageManagement.savePageTitle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
