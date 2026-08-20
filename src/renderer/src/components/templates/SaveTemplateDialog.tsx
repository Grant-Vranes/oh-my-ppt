import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog'
import { Input } from '../ui/Input'
import { useT } from '@renderer/i18n'

export function SaveTemplateDialog({
  open,
  defaultName,
  defaultDescription = '',
  defaultTags,
  mode = 'create',
  saving,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  defaultName: string
  defaultDescription?: string
  defaultTags?: string[]
  mode?: 'create' | 'edit'
  saving?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: { name: string; description: string; tags: string[] }) => void
}): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setDescription(defaultDescription)
    setTags((defaultTags || []).join('，'))
  }, [defaultDescription, defaultName, defaultTags, open])

  const submit = (): void => {
    const cleanName = name.trim()
    if (!cleanName || saving) return
    onSubmit({
      name: cleanName,
      description: description.trim(),
      tags: tags
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? t('templateDialog.editTitle') : t('templateDialog.createTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {mode === 'edit'
              ? t('templateDialog.editDescription')
              : t('templateDialog.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#52525b]">
              {t('templateDialog.nameLabel')}
            </label>
            <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#52525b]">
              {t('templateDialog.descriptionLabel')}
            </label>
            <textarea
              value={description}
              maxLength={240}
              className="min-h-[74px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
              placeholder={t('templateDialog.descriptionPlaceholder')}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#52525b]">
              {t('templateDialog.tagsLabel')}
            </label>
            <Input
              value={tags}
              placeholder={t('templateDialog.tagsPlaceholder')}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={saving || !name.trim()}>
            {saving
              ? t('common.saving')
              : mode === 'edit'
                ? t('templateDialog.update')
                : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
