import type { UpdateAvailablePayload } from '@shared/app-update.js'
import { Download, FileText } from 'lucide-react'
import { useT } from '../i18n'
import { Button } from './ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/Dialog'

function openExternalUrl(url: string | undefined): void {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

interface UpdateAvailableDialogProps {
  update: UpdateAvailablePayload | null
  onClose: () => void
}

export function UpdateAvailableDialog({
  update,
  onClose
}: UpdateAvailableDialogProps): React.JSX.Element {
  const t = useT()
  const primaryDownloadUrl = update?.downloadUrl

  return (
    <Dialog open={Boolean(update)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{update ? t('app.updateAvailableTitle', { version: update.latestVersion }) : ''}</DialogTitle>
          <DialogDescription>
            {update
              ? t('app.updateAvailableDialogDescription', { currentVersion: update.currentVersion })
              : ''}
          </DialogDescription>
        </DialogHeader>

        {update && (
          <div className="flex flex-wrap gap-2 rounded-lg border border-[#d8cfbc]/80 bg-[#f4f4f5]/55 p-4">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#d8cfbc] bg-[#ffffff] px-3 text-xs font-medium text-[#6f6658]">
              <span>{t('app.currentVersion')}</span>
              <span className="text-[#3e4a32]">{update.currentVersion}</span>
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#6f8159]/25 bg-[#eaf2df] px-3 text-xs font-semibold text-[#3e4a32]">
              <span>{t('app.latestVersion')}</span>
              <span>{update.latestVersion}</span>
            </span>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onClose}>
            {t('app.later')}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {update?.changeLog && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => openExternalUrl(update.changeLog)}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {t('app.changeLog')}
              </Button>
            )}
            {primaryDownloadUrl && (
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => openExternalUrl(primaryDownloadUrl)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t('app.downloadHome')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
