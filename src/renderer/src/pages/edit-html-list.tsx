import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../components/ui/AlertDialog'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip'
import { FileCode2, FileUp, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import { useHtmlEditorStore } from '../store/htmlEditorStore'
import { useHtmlEditStore } from '../store/htmlEditStore'
import { useHtmlEditHistoryStore } from '../store/htmlEditHistoryStore'
import { useHtmlEditorUiStore } from '../store/htmlEditorUiStore'
import { useToastStore } from '../store/toastStore'
import { useT } from '../i18n'
import { useThumbnailUpdates } from '../hooks/useThumbnailUpdates'
import dayjs from 'dayjs'
import { localAssetUrl } from '@shared/local-asset'

const getFileName = (filePath: string | null): string => filePath?.split(/[\\/]/).pop() || ''
const thumbnailUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test' ? 'about:blank' : localAssetUrl(filePath)

/** HTML 编辑器文档库页（/edit-html，带侧栏内容区）。 */
export function EditHtmlListPage(): ReactElement {
  const navigate = useNavigate()
  const t = useT()
  const documents = useHtmlEditorStore((s) => s.documents)
  const importing = useHtmlEditorStore((s) => s.importing)
  const removeDocument = useHtmlEditorStore((s) => s.removeDocument)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<(typeof documents)[number] | null>(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useThumbnailUpdates('html-editor', (task) => {
    if (!task.thumbnailPath) return
    useHtmlEditorStore.getState().setDocumentThumbnail(task.resourceId, task.thumbnailPath)
  })

  useEffect(() => {
    void useHtmlEditorStore.getState().loadDocuments()
  }, [])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return documents
    return documents.filter((document) => {
      const sourceName = getFileName(document.sourcePath || document.htmlPath)
      return [document.title, sourceName, document.sourcePath]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query))
    })
  }, [documents, searchQuery])

  const enterDoc = (docId: string): void => {
    useHtmlEditStore.getState().reset()
    useHtmlEditHistoryStore.getState().clear()
    useHtmlEditorUiStore.getState().setInteractionMode('edit')
    navigate(`/edit-html/${docId}`)
  }

  const handleImport = async (): Promise<void> => {
    const outcome = await useHtmlEditorStore.getState().importFile()
    if (!outcome.ok) {
      if (outcome.reason === 'storage-not-configured') {
        useToastStore.getState().warning(t('home.settingsRequiredTitle'), {
          description: t('home.settingsRequired')
        })
      } else if (outcome.reason === 'error') {
        useToastStore.getState().error(outcome.message || t('common.retryLater'))
      }
      return
    }
    await useHtmlEditorStore.getState().loadDocuments()
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deletingDocumentId) return
    setDeletingDocumentId(deleteTarget.id)
    try {
      const removed = await removeDocument(deleteTarget.id)
      if (!removed) {
        useToastStore.getState().error(t('htmlEditor.removeFromLibraryFailed'))
        return
      }
      useToastStore.getState().success(t('htmlEditor.removedFromLibrary'))
      setDeleteTarget(null)
    } finally {
      setDeletingDocumentId('')
    }
  }

  return (
    <TooltipProvider delayDuration={180}>
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            {t('htmlEditor.eyebrow')}
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#18181b]">
                {t('htmlEditor.listTitle')}
              </h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {documents.length > 0 ? (
                searchOpen || searchQuery ? (
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829071]" />
                    <Input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      placeholder={t('htmlEditor.searchPlaceholder')}
                      className="h-9 bg-[#ffffff] pl-9 pr-10"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onBlur={() => {
                        if (!searchQuery.trim()) setSearchOpen(false)
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('htmlEditor.clearSearch')}
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-[#829071] hover:text-[#18181b]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSearchQuery('')
                        setSearchOpen(false)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={t('htmlEditor.searchButton')}
                        onClick={() => setSearchOpen(true)}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end">
                      {t('htmlEditor.searchButton')}
                    </TooltipContent>
                  </Tooltip>
                )
              ) : null}
              {documents.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-w-[132px]"
                      onClick={() => void handleImport()}
                      disabled={importing}
                    >
                      <FileUp className="mr-2 h-4 w-4" />
                      {importing ? t('common.loading') : t('htmlEditor.import')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end">
                    {t('htmlEditor.importTooltip')}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>

        {documents.length === 0 ? (
          <section className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4 py-12">
            <div className="flex w-full max-w-[460px] flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-[#d7cab1] bg-[#ffffff] text-[#617052] shadow-[0_6px_16px_rgba(78,88,62,0.08)]">
                <FileCode2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold text-[#18181b]">{t('htmlEditor.emptyTitle')}</h3>
              <p className="mt-2 text-sm leading-6 text-[#7b705f]">{t('htmlEditor.emptyHint')}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    className="mt-6 min-w-[148px] bg-[#18181b] text-white hover:bg-[#4b593d]"
                    onClick={() => void handleImport()}
                    disabled={importing}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    {importing ? t('common.loading') : t('htmlEditor.import')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('htmlEditor.importTooltip')}</TooltipContent>
              </Tooltip>
            </div>
          </section>
        ) : filteredDocuments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">{t('htmlEditor.noSearchResultsTitle')}</h3>
              <p className="text-muted-foreground">{t('htmlEditor.noSearchResultsDescription')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredDocuments.map((document) => {
              const sourcePath = document.sourcePath || document.htmlPath
              const sourceName = getFileName(sourcePath)
              return (
                <div
                  key={document.id}
                  data-html-document-card-id={document.id}
                  className="group overflow-hidden rounded-lg border border-[#e4e4e7]/75 bg-white/70 shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.10)]"
                >
                  <button
                    type="button"
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ca77e]"
                    onClick={() => enterDoc(document.id)}
                  >
                    <div
                      className="relative aspect-video overflow-hidden bg-[#f4f4f5]"
                      data-html-document-thumbnail-frame
                    >
                      {document.thumbnailPath ? (
                        <img
                          src={thumbnailUrl(document.thumbnailPath)}
                          loading="lazy"
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-[#7f8d70]">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-xs font-medium">
                            {t('htmlEditor.thumbnailGenerating')}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-[#ffffff]/92 px-2.5 py-1 text-xs font-semibold text-[#18181b] shadow-[0_4px_12px_rgba(0,0,0,0.10)]">
                        <Pencil className="h-3 w-3" />
                        {t('htmlEditor.edit')}
                      </span>
                    </div>
                    <div className="min-w-0 p-4">
                      <div className="line-clamp-2 min-h-10 text-base font-semibold leading-5 text-[#18181b]">
                        {document.title || t('htmlEditor.untitled')}
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-[#847866]">
                        <span className="shrink-0 rounded border border-[#e4e4e7]/70 bg-[#ffffff] px-1.5 py-0.5 text-[10px] font-semibold text-[#6c795e]">
                          HTML
                        </span>
                        <span className="truncate" title={sourcePath}>
                          {sourceName || sourcePath}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between border-t border-[#e5dccd]/58 px-4 py-2.5">
                    <time
                      className="text-xs text-[#847866]"
                      dateTime={dayjs(document.updatedAt).toISOString()}
                    >
                      {dayjs(document.updatedAt).format('YYYY/MM/DD HH:mm')}
                    </time>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 rounded-[6px] p-0 text-[#8a514b] hover:text-[#7a332d]"
                          aria-label={t('htmlEditor.delete')}
                          disabled={Boolean(deletingDocumentId)}
                          onClick={() => setDeleteTarget(document)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{t('htmlEditor.delete')}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open && !deletingDocumentId) setDeleteTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>{t('htmlEditor.removeFromLibraryTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('htmlEditor.removeFromLibraryDescription', {
                name: deleteTarget?.title || t('htmlEditor.untitled')
              })}
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <AlertDialogCancel disabled={Boolean(deletingDocumentId)}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={Boolean(deletingDocumentId)}
                onClick={(event) => {
                  event.preventDefault()
                  void handleDelete()
                }}
                className="bg-[#8f3f31] text-white hover:bg-[#743126] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {deletingDocumentId ? (
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
