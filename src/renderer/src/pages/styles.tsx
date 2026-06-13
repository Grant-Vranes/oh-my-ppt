import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../components/ui/AlertDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../components/ui/Popover'
import { ipc } from '@renderer/lib/ipc'
import { useStylePreviewStore, useToastStore } from '../store'
import { Download, Eye, Loader2, PencilLine, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { useT } from '../i18n'
import {
  buildStyleCaseOptions,
  filterByStyleCase,
  parseStyleCases
} from '@renderer/lib/style-case'

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
  const [selectedStyleCase, setSelectedStyleCase] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StyleSummary | null>(null)
  const [deletingStyleId, setDeletingStyleId] = useState('')
  const stylePackageInputRef = useRef<HTMLInputElement | null>(null)
  const { error, info, success, warning } = useToastStore()
  const generatingPreviewStyleId = useStylePreviewStore((state) => state.generatingStyleId)
  const previewCompletionVersion = useStylePreviewStore((state) => state.completionVersion)
  const generatePreview = useStylePreviewStore((state) => state.generatePreview)
  const t = useT()

  const styleCaseOptions = useMemo(() => buildStyleCaseOptions(styles), [styles])
  const visibleStyleCaseOptions = useMemo(() => {
    const popular = styleCaseOptions.filter((option) => option.count > 1)
    const selected = styleCaseOptions.find((option) => option.label === selectedStyleCase)
    return selected && !popular.some((option) => option.label === selected.label)
      ? [...popular, selected]
      : popular
  }, [selectedStyleCase, styleCaseOptions])
  const filteredStyles = useMemo(
    () => filterByStyleCase(styles, selectedStyleCase),
    [selectedStyleCase, styles]
  )

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
  }, [loadStyles, previewCompletionVersion])

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!deleteTarget || deletingStyleId) return
    const style = deleteTarget
    setDeletingStyleId(style.id)
    try {
      const result = await ipc.deleteStyle(style.id)
      if (!result.deleted) {
        warning(t('styles.deleteFailed'), { description: t('common.retryLater') })
        return
      }
      info(t('styles.deleted'))
      setDeleteTarget(null)
      await loadStyles()
    } catch (e) {
      error(t('styles.deleteFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater'),
      })
    } finally {
      setDeletingStyleId('')
    }
  }, [deleteTarget, deletingStyleId, error, info, warning, t, loadStyles])

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

  const handleGeneratePreview = useCallback(async (style: StyleSummary): Promise<void> => {
    try {
      const started = await generatePreview(style.id)
      if (!started) return
      success(t('styles.previewGenerated'), {
        description: style.label
      })
    } catch (e) {
      error(t('styles.previewGenerationFailed'), {
        description: e instanceof Error ? e.message : t('common.retryLater')
      })
    }
  }, [error, generatePreview, success, t])

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

      {styleCaseOptions.length > 0 && (
        <div className="mb-5 rounded-lg border border-[#d8ccb5]/75 bg-[#fff9ef]/76 p-3">
          <p className="mb-2 text-xs font-medium text-[#3e4a32]">{t('styles.styleCaseFilter')}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                selectedStyleCase === ''
                  ? 'border-[#97aa7c] bg-[#dbe7ca] text-[#2f3b28]'
                  : 'border-[#d6c08d]/80 bg-white/70 text-[#7c6a4c] hover:bg-[#fff3d8]'
              }`}
              onClick={() => setSelectedStyleCase('')}
            >
              {t('styles.allStyleCases')} · {styles.length}
            </button>
            {visibleStyleCaseOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  selectedStyleCase === option.label
                    ? 'border-[#97aa7c] bg-[#dbe7ca] text-[#2f3b28]'
                    : 'border-[#d6c08d]/80 bg-white/70 text-[#7c6a4c] hover:bg-[#fff3d8]'
                }`}
                onClick={() => setSelectedStyleCase(option.label)}
              >
                {option.label} · {option.count}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filteredStyles.map((style) => (
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
                    {!style.previewPath && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-[11px] transition-all duration-200 group-hover:-translate-y-0.5"
                        disabled={Boolean(generatingPreviewStyleId)}
                        onClick={() => void handleGeneratePreview(style)}
                      >
                        {generatingPreviewStyleId === style.id ? (
                          <Loader2 className="mr-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        {generatingPreviewStyleId === style.id
                          ? t('styles.generatingPreview')
                          : t('styles.generatePreview')}
                      </Button>
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
                      onClick={() => setDeleteTarget(style)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {style.styleCase && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {parseStyleCases(style.styleCase).map((styleCase) => (
                      <span
                        key={styleCase}
                        className="rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-0.5 text-xs font-medium text-[#7c6a4c]"
                      >
                        {styleCase}
                      </span>
                    ))}
                  </div>
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
      {filteredStyles.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#d8ccb5] py-12 text-center text-sm text-muted-foreground">
          {t('styles.noMatchingStyles')}
        </div>
      )}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingStyleId) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('styles.deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('styles.deleteConfirmDescription', { name: deleteTarget?.label || '' })}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel disabled={Boolean(deletingStyleId)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingStyleId)}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              className="bg-[#8f3f31] text-white hover:bg-[#743126] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {deletingStyleId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('common.delete')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
