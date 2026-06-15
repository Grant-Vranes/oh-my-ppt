import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../components/ui/AlertDialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip'
import { ipc, type HtmlThumbnailTask } from '@renderer/lib/ipc'
import { useStylePreviewStore, useToastStore } from '../store'
import {
  Download,
  FolderOpen,
  Loader2,
  Palette,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react'
import { useT } from '../i18n'
import { useThumbnailUpdates } from '../hooks/useThumbnailUpdates'
import { useVisibleItemIds } from '../hooks/useVisibleItemIds'
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
  thumbnailPath?: string | null
  createdAt?: number
  updatedAt?: number
}

const MAX_VISIBLE_IFRAMES = 8
const OFFICIAL_STYLE_SKILL_URL = 'https://github.com/arcsin1/style-generate-skill'

const localAssetUrl = (filePath: string): string => `local-asset://${encodeURIComponent(filePath)}`
const stylePreviewUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test' ? 'about:blank' : localAssetUrl(filePath)

export function StylesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [styles, setStyles] = useState<StyleSummary[]>([])
  const [importingPackageType, setImportingPackageType] = useState<'zip' | 'directory' | ''>('')
  const [exportingStyleId, setExportingStyleId] = useState('')
  const [selectedStyleCase, setSelectedStyleCase] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StyleSummary | null>(null)
  const [deletingStyleId, setDeletingStyleId] = useState('')
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
  const fallbackStyleIds = useMemo(
    () =>
      new Set(
        filteredStyles
          .filter((style) => !style.thumbnailPath && style.previewPath)
          .map((style) => style.id)
      ),
    [filteredStyles]
  )
  const { visibleIds: visibleFallbackIds, setItemRef } = useVisibleItemIds(
    fallbackStyleIds,
    MAX_VISIBLE_IFRAMES
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

  const applyThumbnail = useCallback((task: HtmlThumbnailTask): void => {
    if (!task.thumbnailPath) return
    setStyles((current) =>
      current.map((style) =>
        style.id === task.resourceId ? { ...style, thumbnailPath: task.thumbnailPath } : style
      )
    )
  }, [])

  useThumbnailUpdates('style', applyThumbnail)

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

  const handleImportPackage = useCallback(async (type: 'zip' | 'directory'): Promise<void> => {
    if (importingPackageType) return
    setImportingPackageType(type)
    try {
      const result =
        type === 'zip'
          ? await ipc.importStylePackageZip()
          : await ipc.importStylePackageDirectory()
      if (result.cancelled) return
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
      setImportingPackageType('')
    }
  }, [error, importingPackageType, loadStyles, success, t])

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
    <TooltipProvider delayDuration={180}>
      <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t('styles.eyebrow')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">{t('styles.title')}</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-w-[112px]"
                  disabled={Boolean(importingPackageType)}
                  onClick={() => void handleImportPackage('zip')}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {importingPackageType === 'zip'
                    ? t('styles.importingPackage')
                    : t('styles.importPackage')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="max-w-[360px]">
                {t('styles.importPackageTooltip')}{' '}
                <a
                  href={OFFICIAL_STYLE_SKILL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#5a7a4e] underline underline-offset-2 hover:text-[#3e5a34]"
                >
                  官方风格解析 Skill：arcsin1/style-generate-skill
                </a>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-w-[112px]"
                  disabled={Boolean(importingPackageType)}
                  onClick={() => void handleImportPackage('directory')}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {importingPackageType === 'directory'
                    ? t('styles.importingPackage')
                    : t('styles.importPackageDirectory')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="max-w-[360px]">
                {t('styles.importPackageDirectoryTooltip')}{' '}
                <a
                  href={OFFICIAL_STYLE_SKILL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#5a7a4e] underline underline-offset-2 hover:text-[#3e5a34]"
                >
                  官方风格解析 Skill：arcsin1/style-generate-skill
                </a>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="min-w-[112px]" onClick={() => navigate('/styles/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('styles.newStyle')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                {t('styles.newStyleTooltip')}
              </TooltipContent>
            </Tooltip>
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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
        {filteredStyles.map((style) => (
            <div
              key={style.id}
              ref={!style.thumbnailPath && style.previewPath ? setItemRef(style.id) : undefined}
              data-style-card-id={style.id}
              className="group overflow-hidden rounded-2xl border border-[#d8cfbc]/75 bg-white/70 text-left shadow-[0_4px_16px_rgba(93,107,77,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(93,107,77,0.15)]"
            >
              <div className="relative aspect-video overflow-hidden bg-[#f5f1e8]">
                {style.thumbnailPath ? (
                  <img
                    src={stylePreviewUrl(style.thumbnailPath)}
                    loading="lazy"
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : style.previewPath && visibleFallbackIds.has(style.id) ? (
                  <iframe
                    data-testid="style-preview-iframe"
                    src={stylePreviewUrl(style.previewPath)}
                    sandbox=""
                    tabIndex={-1}
                    className="pointer-events-none absolute left-0 top-0 h-[900px] w-[1600px] origin-top-left border-0 bg-white"
                    style={{ transform: 'scale(0.2)' }}
                    title={`${style.label} preview`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#8a9a7b]">
                    {generatingPreviewStyleId === style.id ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <Palette className="h-8 w-8" />
                    )}
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 flex items-start justify-end gap-1.5 bg-gradient-to-b from-black/30 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {!style.previewPath && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 rounded-md bg-white/95 p-0 text-[#3e4a32] shadow-[0_3px_10px_rgba(40,48,34,0.16)]"
                          disabled={Boolean(generatingPreviewStyleId)}
                          onClick={() => void handleGeneratePreview(style)}
                          aria-label={
                            generatingPreviewStyleId === style.id
                              ? t('styles.generatingPreview')
                              : t('styles.generatePreview')
                          }
                          title={
                            generatingPreviewStyleId === style.id
                              ? t('styles.generatingPreview')
                              : t('styles.generatePreviewTooltip')
                          }
                        >
                          {generatingPreviewStyleId === style.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end">
                        {generatingPreviewStyleId === style.id
                          ? t('styles.generatingPreview')
                          : t('styles.generatePreviewTooltip')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-md bg-white/95 p-0 text-[#3e4a32] shadow-[0_3px_10px_rgba(40,48,34,0.16)]"
                        onClick={() => navigate(`/styles/${style.id}`)}
                        aria-label={t('common.edit')}
                        title={t('styles.editTooltip')}
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {t('styles.editTooltip')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-md bg-white/95 p-0 text-[#3e4a32] shadow-[0_3px_10px_rgba(40,48,34,0.16)]"
                        disabled={exportingStyleId === style.id}
                        onClick={() => void handleExportPackage(style)}
                        aria-label={t('styles.exportPackage')}
                        title={t('styles.exportPackageTooltip')}
                      >
                        {exportingStyleId === style.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {t('styles.exportPackageTooltip')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 rounded-md bg-white/95 p-0 text-[#8f3f31] shadow-[0_3px_10px_rgba(40,48,34,0.16)] hover:text-[#743126]"
                        onClick={() => setDeleteTarget(style)}
                        aria-label={t('common.delete')}
                        title={t('styles.deleteTooltip')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {t('styles.deleteTooltip')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#3e4a32]">{style.label}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-[#718064]">
                      {style.category} · {style.source || t('styles.sourceBuiltin')}
                    </p>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6f6658]">
                  {style.description || style.id}
                </p>
                {style.styleCase && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {parseStyleCases(style.styleCase).map((styleCase) => (
                      <span
                        key={styleCase}
                        className="rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-[#8a7048]"
                      >
                        {styleCase}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
    </TooltipProvider>
  )
}
