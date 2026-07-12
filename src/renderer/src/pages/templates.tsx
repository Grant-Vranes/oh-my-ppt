import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileUp,
  LayoutTemplate,
  Loader2
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/Dialog'
import { SaveTemplateDialog } from '../components/templates/SaveTemplateDialog'
import { TemplateCard, TemplateEmptyState } from '../components/templates/TemplateCard'
import { TemplateUseDialog } from '../components/templates/TemplateUseDialog'
import { ModelSplitButton } from '../components/model/ModelActionButton'
import { useTemplateStore, useToastStore } from '../store'
import { ipc, type TemplateListItem } from '../lib/ipc'
import { useT } from '../i18n'
import { useModelAction } from '@renderer/hooks/useModelAction'
import { useThumbnailUpdates } from '@renderer/hooks/useThumbnailUpdates'
import { resolveSlideSize } from '@shared/slide-size'

const MAX_PPTX_SIZE_MB = 80
const MAX_PPTX_SIZE_BYTES = MAX_PPTX_SIZE_MB * 1024 * 1024
const DIRECT_CREATE_DONE_DELAY_MS = 500

const localAssetUrl = (filePath: string): string =>
  `local-asset://${encodeURI(filePath.replace(/\\/g, '/'))}`

const templateThumbnailUrl = (filePath: string): string => {
  const separator = filePath.includes('?') ? '&' : '?'
  return `${localAssetUrl(filePath)}${separator}print=1&thumbnail=1&fit=off&pptPlayback=0`
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

export function TemplatesPage(): React.JSX.Element {
  const navigate = useNavigate()
  const t = useT()
  const {
    templates,
    loading,
    fetchTemplates,
    applyTemplateThumbnail,
    createEditableSessionFromTemplate,
    importPptxAsTemplate,
    updateTemplateMetadata,
    deleteTemplate
  } = useTemplateStore()
  const { success, error, warning } = useToastStore()
  const modelAction = useModelAction()
  const { ensureModelActive } = modelAction
  const [useTarget, setUseTarget] = useState<TemplateListItem | null>(null)
  const [previewTarget, setPreviewTarget] = useState<TemplateListItem | null>(null)
  const [editTarget, setEditTarget] = useState<TemplateListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TemplateListItem | null>(null)
  const [directCreatingTemplate, setDirectCreatingTemplate] = useState<TemplateListItem | null>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const pptxInputRef = useRef<HTMLInputElement | null>(null)
  const pptxImportModelConfigIdRef = useRef<string>('')
  const [importingPptxTemplate, setImportingPptxTemplate] = useState(false)
  const [pptxTemplateProgress, setPptxTemplateProgress] = useState<string | null>(null)
  const previewSlideSize = previewTarget
    ? resolveSlideSize({
        id: previewTarget.slideSizeId,
        width: previewTarget.slideWidth,
        height: previewTarget.slideHeight
      })
    : null

  useThumbnailUpdates('template', (task) => {
    if (task.variant !== 'cover' || !task.thumbnailPath) return
    applyTemplateThumbnail(task.resourceId, task.thumbnailPath)
  })

  const load = useCallback(async (): Promise<void> => {
    try {
      await fetchTemplates()
    } catch (err) {
      error(t('templates.loadFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    }
  }, [error, fetchTemplates, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return ipc.onTemplatePptxImportProgress((payload) => {
      setPptxTemplateProgress(`${payload.label}${payload.progress ? ` · ${payload.progress}%` : ''}`)
    })
  }, [])

  const openUseDialog = async (template: TemplateListItem): Promise<void> => {
    const ready = await ensureModelActive()
    if (!ready) return
    setUseTarget(template)
  }

  const ensureUploadPrerequisites = async (): Promise<boolean> => {
    const validation = await ipc.validateUploadPrerequisites()
    if (validation.ready) return true
    warning(t('templates.settingsRequiredTitle'), {
      description: validation.message || t('templates.settingsRequiredDescription'),
      action: {
        label: t('templates.goToSettings'),
        onClick: () => navigate('/settings')
      }
    })
    return false
  }

  const handleImportPptxTemplateClick = async (modelConfigId: string): Promise<void> => {
    if (importingPptxTemplate) return
    if (!(await ensureUploadPrerequisites())) return
    const resolvedModelConfigId = await ensureModelActive(modelConfigId)
    if (!resolvedModelConfigId) return
    pptxImportModelConfigIdRef.current = resolvedModelConfigId
    pptxInputRef.current?.click()
  }

  const handlePptxTemplateFilesSelected = async (files: FileList | null): Promise<void> => {
    const selectedFiles = Array.from(files || [])
    if (pptxInputRef.current) {
      pptxInputRef.current.value = ''
    }
    if (selectedFiles.length === 0) return
    if (selectedFiles.length > 1) {
      error(t('templates.pptxSingleOnlyTitle'), { description: t('templates.pptxSingleOnly') })
      return
    }
    const selectedFile = selectedFiles[0]
    if (!/\.pptx$/i.test(selectedFile.name)) {
      error(t('templates.unsupportedPptxTitle'), { description: t('templates.unsupportedPptx') })
      return
    }
    if (selectedFile.size > MAX_PPTX_SIZE_BYTES) {
      error(t('templates.pptxTooLargeTitle'), {
        description: t('templates.pptxTooLarge', { maxSize: MAX_PPTX_SIZE_MB })
      })
      return
    }
    const filePath = window.electron?.getPathForFile?.(selectedFile) || ''
    if (!filePath) {
      error(t('templates.pptxPathFailedTitle'), { description: t('templates.pptxPathFailed') })
      return
    }

    setImportingPptxTemplate(true)
    setPptxTemplateProgress(t('templates.pptxTemplatePreparing'))
    try {
      const modelConfigId = await ensureModelActive(pptxImportModelConfigIdRef.current)
      if (!modelConfigId) return
      const result = await importPptxAsTemplate({
        filePath,
        name: selectedFile.name.replace(/\.pptx$/i, ''),
        modelConfigId
      })
      await wait(DIRECT_CREATE_DONE_DELAY_MS)
      success(t('templates.pptxTemplateImported'), {
        description:
          result.warnings.length > 0
            ? t('templates.pptxTemplateImportedWithWarnings', {
                pageCount: result.pageCount,
                warningCount: result.warnings.length
              })
            : t('templates.pptxTemplateImportedDescription', { pageCount: result.pageCount })
      })
    } catch (err) {
      error(t('templates.pptxTemplateImportFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      pptxImportModelConfigIdRef.current = ''
      setImportingPptxTemplate(false)
      setPptxTemplateProgress(null)
    }
  }

  const handleCreateEditable = async (template: TemplateListItem): Promise<void> => {
    if (directCreatingTemplate) return
    const deckTitle = template.name
    setDirectCreatingTemplate(template)
    try {
      const sessionId = await createEditableSessionFromTemplate({
        templateId: template.id,
        title: deckTitle
      })
      await wait(DIRECT_CREATE_DONE_DELAY_MS)
      success(t('templates.sessionCreated'), { description: t('templates.directEditCreatedDescription') })
      setUseTarget(null)
      navigate(`/sessions/${sessionId}`)
    } catch (err) {
      error(t('templates.createFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setDirectCreatingTemplate(null)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await deleteTemplate(deleteTarget.id)
      success(t('templates.deleted'))
      setDeleteTarget(null)
    } catch (err) {
      error(t('templates.deleteFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleUpdateMetadata = async (payload: {
    name: string
    description: string
    tags: string[]
  }): Promise<void> => {
    if (!editTarget || editing) return
    setEditing(true)
    try {
      await updateTemplateMetadata({
        templateId: editTarget.id,
        ...payload
      })
      success(t('templates.updated'))
      setEditTarget(null)
    } catch (err) {
      error(t('templates.updateFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-[#8a7e6c]">{t('templates.eyebrow')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">{t('templates.title')}</h1>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {t('templates.description')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-md border border-[#d6c08d]/70 bg-[#fff7e8] px-2.5 py-1.5 text-xs font-medium text-[#7c6a4c]">
              {t('templates.count', { count: templates.length })}
            </span>
            <ModelSplitButton
              modelAction={modelAction}
              label={t('templates.importPptx')}
              loadingLabel={t('templates.importingPptxTemplate')}
              loading={importingPptxTemplate}
              disabled={loading || importingPptxTemplate}
              icon={FileUp}
              tone="subtle"
              onRun={(modelConfigId) => handleImportPptxTemplateClick(modelConfigId)}
            />
          </div>
        </div>
      </div>

      <input
        ref={pptxInputRef}
        type="file"
        accept=".pptx"
        className="hidden"
        onChange={(event) => void handlePptxTemplateFilesSelected(event.target.files)}
      />

      {templates.length === 0 ? (
        <TemplateEmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              directCreating={directCreatingTemplate?.id === template.id}
              onUseDirect={(item) => void handleCreateEditable(item)}
              onUseGenerate={(item) => void openUseDialog(item)}
              onPreview={setPreviewTarget}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {directCreatingTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d261f]/28 backdrop-blur-[2px]">
          <div className="w-[min(360px,calc(100vw-32px))] rounded-xl border border-[#ded2bd]/80 bg-[#fffdf8] px-5 py-4 shadow-[0_18px_45px_rgba(57,47,36,0.22)]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef3e7] text-[#5f6b50]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#34402c]">{t('templates.creatingEditable')}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{directCreatingTemplate.name}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {importingPptxTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2d261f]/28 backdrop-blur-[2px]">
          <div className="w-[min(380px,calc(100vw-32px))] rounded-xl border border-[#ded2bd]/80 bg-[#fffdf8] px-5 py-4 shadow-[0_18px_45px_rgba(57,47,36,0.22)]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef3e7] text-[#5f6b50]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#34402c]">{t('templates.importingPptxTemplate')}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {pptxTemplateProgress || t('templates.pptxTemplatePreparing')}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(previewTarget)} onOpenChange={(open) => !open && setPreviewTarget(null)}>
        <DialogContent className="w-auto max-w-none gap-3 rounded-lg bg-[#f6efe2] p-4">
          <DialogHeader className="pr-10">
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4" />
              {previewTarget?.name || t('templates.previewTitle')}
            </DialogTitle>
          </DialogHeader>
          {previewTarget && previewSlideSize ? (
            <div className="max-h-[min(72vh,720px)] w-[min(84vw,920px)] overflow-y-auto pr-1">
              <div className="grid justify-center gap-3 [grid-template-columns:repeat(auto-fill,260px)]">
                {(previewTarget.previewPages.length > 0
                  ? previewTarget.previewPages
                  : previewTarget.previewHtmlPath
                    ? [
                        {
                          pageNumber: 1,
                          pageId: 'preview',
                          title: previewTarget.name,
                          htmlPath: previewTarget.previewHtmlPath
                        }
                      ]
                    : []
                ).map((page) => (
                  <div
                    key={`${previewTarget.id}-${page.pageId}-${page.pageNumber}`}
                    className="overflow-hidden rounded-lg border border-[#ded2bd]/80 bg-[#fffdf8] shadow-[0_8px_18px_rgba(74,59,42,0.09)]"
                  >
                    <div
                      className="relative overflow-hidden bg-white"
                      style={{
                        aspectRatio: `${previewSlideSize.width}/${previewSlideSize.height}`
                      }}
                    >
                      <iframe
                        src={templateThumbnailUrl(page.htmlPath)}
                        className="absolute left-0 top-0 origin-top-left border-0 bg-white"
                        style={{
                          width: previewSlideSize.width,
                          height: previewSlideSize.height,
                          transform: `scale(${260 / previewSlideSize.width})`
                        }}
                        title={`${previewTarget.name} page ${page.pageNumber}`}
                      />
                    </div>
                    <div className="flex min-w-0 items-center gap-2 border-t border-[#eee4d2]/80 px-2.5 py-2">
                      <span className="shrink-0 rounded-md bg-[#e8f0df] px-1.5 py-0.5 text-[11px] font-semibold text-[#4f6340]">
                        P{page.pageNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[#5f6b50]">
                        {page.title || t('templates.pageFallback', { pageNumber: page.pageNumber })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <TemplateUseDialog template={useTarget} onOpenChange={(open) => !open && setUseTarget(null)} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('templates.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('templates.deleteDescription', { name: deleteTarget?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? t('templates.deleting') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaveTemplateDialog
        open={Boolean(editTarget)}
        mode="edit"
        defaultName={editTarget?.name || ''}
        defaultDescription={editTarget?.description || ''}
        defaultTags={editTarget?.tags || []}
        saving={editing}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onSubmit={(payload) => void handleUpdateMetadata(payload)}
      />
    </div>
  )
}
