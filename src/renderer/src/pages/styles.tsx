import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../components/ui/Popover'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '../store'
import { Download, Eye, PencilLine, Plus, Trash2, Upload } from 'lucide-react'
import { useT } from '../i18n'

type StyleSummary = {
  id: string
  label: string
  description: string
  source?: 'builtin' | 'custom' | 'override'
  editable?: boolean
  category: string
  styleCase?: string
  previewPath?: string | null
  createdAt?: number
  updatedAt?: number
}

const localAssetUrl = (filePath: string): string => `local-asset://${encodeURIComponent(filePath)}`

export function StylesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [styles, setStyles] = useState<StyleSummary[]>([])
  const [importingZip, setImportingZip] = useState(false)
  const [exportingStyleId, setExportingStyleId] = useState('')
  const stylePackageInputRef = useRef<HTMLInputElement | null>(null)
  const { error, info, success, warning } = useToastStore()
  const t = useT()

  const loadStyles = useCallback(async (): Promise<void> => {
    try {
      const { items } = await ipc.listStyles()
      const sorted = [...items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      setStyles(sorted)
    } catch (e) {
      error(t('styles.loadFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater'),
      })
    }
  }, [error, t])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStyles()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadStyles])

  const handleDelete = useCallback(async (style: StyleSummary): Promise<void> => {
    try {
      const result = await ipc.deleteStyle(style.id)
      if (!result.deleted) {
        warning(result.message || t('styles.cannotDelete'))
        return
      }
      info(t('styles.deleted'))
      await loadStyles()
    } catch (e) {
      error(t('styles.deleteFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater'),
      })
    }
  }, [error, info, warning, t, loadStyles])

  const handleImportPackageClick = useCallback((): void => {
    if (importingZip) return
    stylePackageInputRef.current?.click()
  }, [importingZip])

  const handlePackageFileSelected = useCallback(async (files: FileList | null): Promise<void> => {
    const file = files?.[0]
    if (stylePackageInputRef.current) stylePackageInputRef.current.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      warning(t('styles.packageZipRequired'))
      return
    }
    const filePath = window.electron?.getPathForFile?.(file) || ''
    if (!filePath) {
      error(t('styleEditor.filePathFailed'))
      return
    }
    setImportingZip(true)
    try {
      const result = await ipc.importStylePackageZip({ filePath })
      success(t('styles.packageImported'), {
        description:
          result.source === 'override' ? t('styleEditor.savedOverride') : t('styleEditor.savedCustom')
      })
      await loadStyles()
    } catch (e) {
      error(t('styles.packageImportFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater')
      })
    } finally {
      setImportingZip(false)
    }
  }, [error, loadStyles, success, t, warning])

  const handleExportPackage = useCallback(async (style: StyleSummary): Promise<void> => {
    if (exportingStyleId) return
    setExportingStyleId(style.id)
    try {
      const result = await ipc.exportStylePackageZip({ styleId: style.id })
      if (result.canceled) return
      success(t('styles.packageExported'), {
        description: result.filePath || style.label
      })
    } catch (e) {
      error(t('styles.packageExportFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater')
      })
    } finally {
      setExportingStyleId('')
    }
  }, [error, exportingStyleId, success, t])

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t('styles.eyebrow')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">{t('styles.title')}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <input
              ref={stylePackageInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={(event) => void handlePackageFileSelected(event.target.files)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="min-w-[112px]"
              disabled={importingZip}
              onClick={handleImportPackageClick}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importingZip ? t('styles.importingPackage') : t('styles.importPackage')}
            </Button>
            <Button size="sm" className="min-w-[112px]" onClick={() => navigate('/styles/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('styles.newStyle')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">{t('styles.description')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {styles.map((style) => (
          <Popover key={style.id}>
            <Card className="group !rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(88,75,56,0.18)]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate transition-colors duration-200 group-hover:text-foreground">{style.label}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {style.previewPath && (
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-[11px] transition-all duration-200 group-hover:-translate-y-0.5"
                        >
                          <Eye className="h-3 w-3" />
                          {t('common.preview')}
                        </Button>
                      </PopoverTrigger>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[11px] transition-all duration-200 group-hover:-translate-y-0.5"
                      onClick={() => navigate(`/styles/${style.id}`)}
                    >
                      <PencilLine className="h-3 w-3" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[11px] transition-all duration-200 group-hover:-translate-y-0.5"
                      disabled={exportingStyleId === style.id}
                      onClick={() => void handleExportPackage(style)}
                    >
                      <Download className="h-3 w-3" />
                      {t('styles.exportPackage')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[11px] text-destructive/70 transition-all duration-200 hover:text-destructive group-hover:-translate-y-0.5"
                      onClick={() => void handleDelete(style)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {style.styleCase && (
                  <span className="mb-2 inline-block rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-0.5 text-xs font-medium text-[#7c6a4c]">
                    {style.styleCase}
                  </span>
                )}
                <p className="line-clamp-2 text-[11px] text-muted-foreground/60 transition-colors duration-200 group-hover:text-foreground/50">
                  {style.description || style.id}
                </p>
                <p className="mt-2 text-xs text-muted-foreground/60 transition-colors duration-200 group-hover:text-foreground/50">
                  {style.category} · {style.source || t('styles.sourceBuiltin')}
                </p>
              </CardContent>
            </Card>
            {style.previewPath && (
              <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-auto overflow-hidden rounded-lg border border-[#d8cfbc]/80 bg-[#fffaf0] p-2 shadow-[0_18px_44px_rgba(64,52,38,0.22)] data-[state=closed]:animate-none data-[state=open]:animate-none"
              >
                <div className="relative aspect-video w-[380px] overflow-hidden rounded-md border border-[#e3dac8] bg-white">
                  <iframe
                    src={localAssetUrl(style.previewPath)}
                    className="absolute left-0 top-0 h-[900px] w-[1600px] origin-top-left border-0 bg-white"
                    style={{ transform: 'scale(0.2375)' }}
                    title={`${style.label} preview`}
                  />
                </div>
              </PopoverContent>
            )}
          </Popover>
        ))}
      </div>
    </div>
  )
}
