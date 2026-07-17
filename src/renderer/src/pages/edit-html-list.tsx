import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/Tooltip'
import { FileCode2, FileUp, Pencil, Search, X } from 'lucide-react'
import { useHtmlEditorStore } from '../store/htmlEditorStore'
import { useHtmlEditStore } from '../store/htmlEditStore'
import { useHtmlEditHistoryStore } from '../store/htmlEditHistoryStore'
import { useHtmlEditorUiStore } from '../store/htmlEditorUiStore'
import { useToastStore } from '../store/toastStore'
import { useT } from '../i18n'
import { useThumbnailUpdates } from '../hooks/useThumbnailUpdates'
import dayjs from 'dayjs'

const getFileName = (filePath: string | null): string => filePath?.split(/[\\/]/).pop() || ''
const localAssetUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test' ? 'about:blank' : `local-asset://${encodeURIComponent(filePath)}`

/** HTML 编辑器文档库页（/edit-html，带侧栏内容区）。 */
export function EditHtmlListPage(): ReactElement {
  const navigate = useNavigate()
  const t = useT()
  const documents = useHtmlEditorStore((s) => s.documents)
  const importing = useHtmlEditorStore((s) => s.importing)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
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
    const docId = useHtmlEditorStore.getState().docId
    if (docId) {
      enterDoc(docId)
    } else {
      void useHtmlEditorStore.getState().loadDocuments()
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
              <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">
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
                      className="h-9 bg-[#fffaf1] pl-9 pr-10"
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
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-[#829071] hover:text-[#3e4a32]"
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
            </div>
          </div>
        </div>

        {documents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileCode2 className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">{t('htmlEditor.emptyTitle')}</h3>
              <p className="text-muted-foreground">{t('htmlEditor.emptyHint')}</p>
            </CardContent>
          </Card>
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
                <button
                  key={document.id}
                  type="button"
                  data-html-document-card-id={document.id}
                  className="group overflow-hidden rounded-lg border border-[#d8cfbc]/75 bg-white/70 text-left shadow-[0_4px_16px_rgba(93,107,77,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(93,107,77,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ca77e]"
                  onClick={() => enterDoc(document.id)}
                >
                  <div
                    className="relative aspect-video overflow-hidden bg-[#f5f1e8]"
                    data-html-document-thumbnail-frame
                  >
                    {document.thumbnailPath ? (
                      <img
                        src={localAssetUrl(document.thumbnailPath)}
                        loading="lazy"
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[#8f9d81]">
                        <FileCode2 className="h-10 w-10" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-[#fffaf0]/92 px-2.5 py-1 text-xs font-semibold text-[#3e4a32] shadow-[0_4px_12px_rgba(31,38,29,0.16)] backdrop-blur-sm">
                      <Pencil className="h-3 w-3" />
                      {t('htmlEditor.edit')}
                    </span>
                  </div>
                  <div className="min-w-0 p-4">
                    <div className="line-clamp-2 min-h-10 text-base font-semibold leading-5 text-[#3e4a32]">
                      {document.title || t('htmlEditor.untitled')}
                    </div>
                    <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-[#847866]">
                      <span className="shrink-0 rounded border border-[#d8ccb5]/70 bg-[#fffaf0] px-1.5 py-0.5 text-[10px] font-semibold text-[#6c795e]">
                        HTML
                      </span>
                      <span className="truncate" title={sourcePath}>
                        {sourceName || sourcePath}
                      </span>
                    </div>
                    <time
                      className="mt-3 block text-xs text-[#847866]"
                      dateTime={dayjs(document.updatedAt).toISOString()}
                    >
                      {dayjs(document.updatedAt).format('YYYY/MM/DD HH:mm')}
                    </time>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
