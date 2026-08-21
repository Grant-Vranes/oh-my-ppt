import { useEffect, useState } from 'react'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog'
import { ipc } from '../../lib/ipc'
import { useT } from '../../i18n'
import { useToastStore } from '../../store/toastStore'

interface VersionRow {
  id: string
  commitSha: string
  message: string
  createdAt: number
}

/** HTML 编辑器版本历史：列出该文档的 git 提交（版本表记录），可恢复到任一版本。 */
export function HtmlEditorHistoryDialog({
  open,
  onOpenChange,
  docId,
  onRestored
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  docId: string
  onRestored: (html: string) => void
}): React.JSX.Element {
  const t = useT()
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !docId) return
    setLoading(true)
    ipc
      .listHtmlVersions({ docId })
      .then((r) => setVersions(r.versions))
      .catch((error) => {
        useToastStore
          .getState()
          .error(error instanceof Error ? error.message : t('common.retryLater'))
        setVersions([])
      })
      .finally(() => setLoading(false))
  }, [open, docId, t])

  const handleRestore = async (versionId: string): Promise<void> => {
    setRestoring(versionId)
    try {
      const { html } = await ipc.restoreHtmlVersion({ docId, versionId })
      onRestored(html)
      onOpenChange(false)
    } catch (error) {
      useToastStore
        .getState()
        .error(error instanceof Error ? error.message : t('common.retryLater'))
    } finally {
      setRestoring(null)
    }
  }

  const fmtTime = (ms: number): string => new Date(ms).toLocaleString()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('htmlEditor.history')}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-[#8a8676]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : versions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8a8676]">
            {t('htmlEditor.historyEmpty')}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-2 rounded-md border border-[#e2dccf] bg-[#ffffff] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#18181b]">{v.message}</div>
                  <div className="text-[11px] text-[#8a8676]">
                    {fmtTime(v.createdAt)} · {v.commitSha.slice(0, 7)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRestore(v.id)}
                  disabled={restoring !== null}
                  className="flex items-center gap-1 rounded-md border border-[#c9c0ad] px-2 py-1 text-[11px] text-[#18181b] hover:bg-[#ece5d6] disabled:opacity-50"
                >
                  {restoring === v.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  {t('htmlEditor.restore')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
