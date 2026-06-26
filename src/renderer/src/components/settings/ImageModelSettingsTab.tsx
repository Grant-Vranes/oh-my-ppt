import { CheckCircle2, Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ImageModelConfig } from '../../lib/ipc'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { summarizeImageModelConfig } from './model-settings-utils'
import type { SettingsTranslate } from './types'

interface ImageModelSettingsTabProps {
  activeImageModelConfig?: ImageModelConfig
  activatingImageId: string | null
  deletingImageId: string | null
  imageModelConfigs: ImageModelConfig[]
  t: SettingsTranslate
  onActivate: (id: string) => void
  onCreate: () => void
  onDelete: (config: ImageModelConfig) => void
  onEdit: (config: ImageModelConfig) => void
}

export function ImageModelSettingsTab({
  activeImageModelConfig,
  activatingImageId,
  deletingImageId,
  imageModelConfigs,
  t,
  onActivate,
  onCreate,
  onDelete,
  onEdit
}: ImageModelSettingsTabProps): React.JSX.Element {
  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between p-5 pb-3">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <ImageIcon className="h-4 w-4 text-[#5d7b4d]" />
            {t('settings.imageModelAccess')}
          </CardTitle>
          <p className="mt-1 text-xs text-[#6f8f64]">
            {t('settings.imageModelUsageHint')}
          </p>
          {activeImageModelConfig && (
            <span className="mt-2 inline-flex max-w-full truncate rounded-full border border-[#96b77f]/55 bg-[#eef6e8] px-2.5 py-1 text-xs font-medium text-[#4f6b45]">
              {t('settings.currentActiveImageModel', { name: activeImageModelConfig.name })}
            </span>
          )}
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('settings.addImageModel')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5 p-5 pt-0">
        {imageModelConfigs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d8ccb5]/85 bg-[#fff9ef]/70 p-6 text-sm text-muted-foreground">
            {t('settings.noImageModels')}
          </div>
        ) : (
          imageModelConfigs.map((config) => (
            <div
              key={config.id}
              className={
                config.active
                  ? 'flex flex-col gap-3 rounded-lg border border-[#96b77f]/80 bg-[#eef6e8] p-3 shadow-[inset_3px_0_0_#6f8f64] sm:flex-row sm:items-center sm:justify-between'
                  : 'flex flex-col gap-3 rounded-lg border border-[#d8ccb5]/80 bg-[#fffdf8]/78 p-3 sm:flex-row sm:items-center sm:justify-between'
              }
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {config.active && <CheckCircle2 className="h-4 w-4 text-[#5d7b4d]" />}
                  <p className="font-medium text-[#33402a]">{config.name}</p>
                  <span className="rounded-full bg-[#e9efde] px-2 py-0.5 text-[11px] uppercase text-[#506141]">
                    {config.provider}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {summarizeImageModelConfig(config.modelConfig)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={config.active ? 'secondary' : 'outline'}
                  disabled={config.active || activatingImageId === config.id}
                  onClick={() => onActivate(config.id)}
                >
                  {config.active
                    ? t('settings.activeImageModel')
                    : t('settings.activateImageModel')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(config)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletingImageId === config.id}
                  onClick={() => onDelete(config)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
