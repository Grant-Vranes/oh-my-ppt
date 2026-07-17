import { useEffect, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardTitle } from '../components/ui/Card'
import { FileCode2, FileUp, Pencil } from 'lucide-react'
import { useHtmlEditorStore } from '../store/htmlEditorStore'
import { useHtmlEditStore } from '../store/htmlEditStore'
import { useHtmlEditHistoryStore } from '../store/htmlEditHistoryStore'
import { useHtmlEditorUiStore } from '../store/htmlEditorUiStore'
import { useToastStore } from '../store/toastStore'
import { useT } from '../i18n'
import dayjs from 'dayjs'

/** HTML 编辑器列表页（/edit-html，带侧栏内容区）：卡片网格 + 导入，点卡片进入编辑页。 */
export function EditHtmlListPage(): ReactElement {
  const navigate = useNavigate()
  const t = useT()
  const documents = useHtmlEditorStore((s) => s.documents)
  const importing = useHtmlEditorStore((s) => s.importing)

  useEffect(() => {
    void useHtmlEditorStore.getState().loadDocuments()
  }, [])

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
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {t('htmlEditor.eyebrow')}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">
            {t('htmlEditor.listTitle')}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
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
            <p className="mb-4 text-muted-foreground">{t('htmlEditor.emptyHint')}</p>
            <Button size="sm" onClick={() => void handleImport()} disabled={importing}>
              <FileUp className="mr-2 h-4 w-4" />
              {importing ? t('common.loading') : t('htmlEditor.import')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#d8cfbc]/75 bg-white/70 shadow-[0_4px_16px_rgba(93,107,77,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(93,107,77,0.15)]"
              onClick={() => enterDoc(doc.id)}
            >
              <div className="relative flex h-[150px] w-full shrink-0 items-center justify-center overflow-hidden bg-[#f5f1e8]">
                <FileCode2 className="h-12 w-12 text-[#8fbc8f] transition-transform duration-300 group-hover:scale-[1.04]" />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-[#fffaf0]/92 px-2.5 py-1 text-xs font-semibold text-[#3e4a32] shadow-[0_4px_12px_rgba(31,38,29,0.16)] backdrop-blur-sm">
                  <Pencil className="h-3 w-3" />
                  {t('htmlEditor.edit')}
                </span>
              </div>
              <div className="min-w-0 flex-1 p-4">
                <CardTitle className="line-clamp-2 min-h-10 text-base leading-5 text-[#3e4a32]">
                  {doc.title || t('htmlEditor.untitled')}
                </CardTitle>
                <p className="mt-1.5 text-xs text-[#847866]">
                  {dayjs(doc.updatedAt).format('YYYY/MM/DD HH:mm')}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
