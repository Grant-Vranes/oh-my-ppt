import { useEffect, useState } from 'react'
import { Button } from '../../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'
import { Input } from '../../ui/Input'
import { useT } from '@renderer/i18n'

export function SaveAsNewSessionDialog({
  open,
  defaultName,
  saving,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  defaultName: string
  saving?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { title: string }) => void
}): React.JSX.Element {
  const t = useT()
  const [title, setTitle] = useState(defaultName)

  useEffect(() => {
    if (!open) return
    setTitle(defaultName)
  }, [defaultName, open])

  const submit = (): void => {
    const cleanTitle = title.trim()
    if (!cleanTitle || saving) return
    onSubmit({ title: cleanTitle })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent showClose={!saving}>
        <DialogHeader>
          <DialogTitle>{t('sessionDetail.saveAsNewSessionDialogTitle')}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {t('sessionDetail.saveAsNewSessionDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-[#52525b]">
              {t('sessionDetail.saveAsNewSessionNameLabel')}
            </label>
            <Input
              autoFocus
              value={title}
              maxLength={120}
              placeholder={t('sessionDetail.saveAsNewSessionNamePlaceholder')}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving || !title.trim()}>
              {saving
                ? t('sessionDetail.saveAsNewSessionSaving')
                : t('sessionDetail.saveAsNewSessionConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
