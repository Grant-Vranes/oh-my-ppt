import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToastStore } from '../store'
import { useT } from '../i18n'
import { useModelAction } from '../hooks/useModelAction'
import { ipc } from '@renderer/lib/ipc'
import {
  ArrowRight,
  FileText,
  FileUp,
  Loader2,
  MessageCircle,
  Sparkles
} from 'lucide-react'

const MAX_PPTX_SIZE_MB = 500
const MAX_PPTX_SIZE_BYTES = MAX_PPTX_SIZE_MB * 1024 * 1024

export function HomePage(): ReactElement {
  const navigate = useNavigate()
  const { success, error, warning } = useToastStore()
  const modelAction = useModelAction()
  const { ensureModelActive } = modelAction
  const t = useT()
  const [importingPptx, setImportingPptx] = useState(false)
  const [pptxImportProgress, setPptxImportProgress] = useState<string | null>(null)
  const pptxInputRef = useRef<HTMLInputElement | null>(null)

  const ensureHomeModelReady = useCallback(async (): Promise<boolean> => {
    return Boolean(await ensureModelActive())
  }, [ensureModelActive])

  const handleQuickCreate = useCallback(async () => {
    if (!(await ensureHomeModelReady())) return
    navigate('/create/session')
  }, [ensureHomeModelReady, navigate])

  const handleExplore = useCallback(async () => {
    navigate('/thinking')
  }, [navigate])

  const ensureUploadPrerequisites = useCallback(async (): Promise<boolean> => {
    const validation = await ipc.validateUploadPrerequisites()
    if (validation.ready) return true
    warning(t('home.settingsRequiredTitle'), {
      description: validation.message || t('home.settingsRequired'),
      action: {
        label: t('home.goToSettings'),
        onClick: () => navigate('/settings')
      }
    })
    return false
  }, [navigate, t, warning])

  const handleImportPptxClick = useCallback(async (): Promise<void> => {
    if (importingPptx) return
    if (!(await ensureHomeModelReady())) return
    if (!(await ensureUploadPrerequisites())) return
    pptxInputRef.current?.click()
  }, [ensureHomeModelReady, ensureUploadPrerequisites, importingPptx])

  const handlePptxFilesSelected = useCallback(
    async (files: FileList | null): Promise<void> => {
      const selectedFiles = Array.from(files || [])
      if (pptxInputRef.current) {
        pptxInputRef.current.value = ''
      }
      if (selectedFiles.length === 0) return
      if (selectedFiles.length > 1) {
        error(t('home.pptxSingleOnlyTitle'), {
          description: t('home.pptxSingleOnly')
        })
        return
      }
      const selectedFile = selectedFiles[0]
      if (!/\.pptx$/i.test(selectedFile.name)) {
        error(t('home.unsupportedFileTitle'), {
          description: t('home.unsupportedPptx')
        })
        return
      }
      if (selectedFile.size > MAX_PPTX_SIZE_BYTES) {
        error(t('home.pptxTooLargeTitle'), {
          description: t('home.pptxTooLarge', { maxSize: MAX_PPTX_SIZE_MB })
        })
        return
      }
      const filePath = window.electron?.getPathForFile?.(selectedFile) || ''
      if (!filePath) {
        error(t('home.pptxPathFailedTitle'), {
          description: t('home.pptxPathFailed')
        })
        return
      }
      setImportingPptx(true)
      setPptxImportProgress(t('home.pptxPreparing'))
      try {
        const modelConfigId = await ensureModelActive()
        if (!modelConfigId) return
        const result = await ipc.importPptx({
          filePath,
          title: selectedFile.name.replace(/\.pptx$/i, ''),
          styleId: null,
          modelConfigId
        })
        success(t('home.pptxImportDone'), {
          description:
            result.warnings.length > 0
              ? t('home.pptxImportedWithWarnings', {
                  pageCount: result.pageCount,
                  warningCount: result.warnings.length
                })
              : t('home.pptxImported', { pageCount: result.pageCount })
        })
        navigate(`/sessions/${result.sessionId}`)
      } catch (err) {
        error(t('home.pptxImportFailed'), {
          description: err instanceof Error ? err.message : t('common.retryLater')
        })
      } finally {
        setImportingPptx(false)
        setPptxImportProgress(null)
      }
    },
    [ensureModelActive, error, navigate, success, t]
  )

  useEffect(() => {
    return ipc.onPptxImportProgress((payload) => {
      setPptxImportProgress(`${payload.label}${payload.progress ? ` · ${payload.progress}%` : ''}`)
    })
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-9 text-[#3e4a32] lg:px-8">
      <section className="relative overflow-hidden border-b border-[#e0d8c8] pb-8">
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-[38%_62%_44%_56%/55%_45%_55%_45%] bg-[#d4e4c1]/55" />
        <div className="pointer-events-none absolute bottom-3 right-28 h-16 w-28 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#c8b89e]/30" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#d4e4c1]/78 px-4 py-1.5 text-[11px] font-semibold text-[#3e4a32] shadow-[0_6px_14px_rgba(93,107,77,0.10)]">
              <Sparkles className="h-3.5 w-3.5 text-[#5d6b4d]" />
              {t('home.eyebrow')}
            </div>
            <h1 className="organic-serif mt-5 text-[32px] font-semibold leading-none text-[#3e4a32] sm:text-[40px]">
              {t('thinking.homeTitle')}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.homeDescription')}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => void handleQuickCreate()}
          className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-[2rem] border border-[#e0d8c8] bg-[#f4f4f5] p-7 text-left shadow-[0_14px_34px_rgba(86,73,54,0.12)] transition-colors hover:border-[#c8b89e] hover:bg-[#e5dccb] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#d4e4c1]/70 transition-transform group-hover:scale-110" />
          <div className="pointer-events-none absolute -bottom-14 left-10 h-28 w-40 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#c8b89e]/35" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] bg-[#8fbc8f] text-white shadow-[0_10px_22px_rgba(93,107,77,0.18)]">
              <FileText className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-[#ffffff]/84 px-3 py-1.5 text-[11px] font-semibold text-[#5d6b4d] shadow-[0_6px_14px_rgba(86,73,54,0.08)]">
              {t('thinking.quickCreateBadge')}
            </span>
          </div>

          <div className="relative mt-7">
            <h2 className="organic-serif text-[30px] font-semibold leading-none text-[#3e4a32]">
              {t('thinking.quickCreate')}
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.quickCreateDescription')}
            </p>
          </div>

          <div className="relative mt-auto pt-7">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#5d6b4d] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(93,107,77,0.22)] transition-colors group-hover:bg-[#3e4a32]">
              {t('thinking.startQuickCreate')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void handleExplore()}
          className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-[2rem] border border-[#c8d6ba] bg-[#d4e4c1] p-7 text-left shadow-[0_14px_34px_rgba(86,73,54,0.12)] transition-colors hover:border-[#a9bd97] hover:bg-[#cedfb8]"
        >
          <div className="pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#8fbc8f]/28 transition-transform group-hover:scale-110" />
          <div className="pointer-events-none absolute right-8 top-9 h-24 w-32 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#f4f4f5]/55" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] bg-[#5d6b4d] text-white shadow-[0_10px_22px_rgba(93,107,77,0.18)]">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-[#ffffff]/84 px-3 py-1.5 text-[11px] font-semibold text-[#5d6b4d] shadow-[0_6px_14px_rgba(86,73,54,0.08)]">
              {t('thinking.exploreProjectBadge')}
            </span>
          </div>

          <div className="relative mt-7">
            <h2 className="organic-serif text-[30px] font-semibold leading-none text-[#3e4a32]">
              {t('thinking.exploreProject')}
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14px] leading-relaxed text-[#5d6b4d]">
              {t('thinking.exploreProjectDescription')}
            </p>
          </div>

          <div className="relative mt-auto pt-7">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-[#3e4a32] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(62,74,50,0.20)] transition-colors group-hover:bg-[#5d6b4d]">
              {t('thinking.startExplore')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => void handleImportPptxClick()}
          disabled={importingPptx}
          className="group relative flex min-h-[240px] flex-col overflow-hidden rounded-[2rem] border border-[#d9cfbd] bg-[#f4f4f5] p-7 text-left shadow-[0_14px_34px_rgba(86,73,54,0.10)] transition-colors hover:border-[#c8b89e] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <div className="pointer-events-none absolute -right-14 -bottom-12 h-36 w-36 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#c8b89e]/30 transition-transform group-hover:scale-110" />
          <div className="pointer-events-none absolute left-8 top-9 h-24 w-32 rounded-[8%_92%_12%_88%/78%_22%_78%_22%] bg-[#d4e4c1]/45" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] bg-[#b18f5e] text-white shadow-[0_10px_22px_rgba(86,73,54,0.16)]">
              <FileUp className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-[#ffffff]/84 px-3 py-1.5 text-[11px] font-semibold text-[#7c6a4c] shadow-[0_6px_14px_rgba(86,73,54,0.08)]">
              PPTX
            </span>
          </div>

          <div className="relative mt-7">
            <h2 className="organic-serif text-[30px] font-semibold leading-none text-[#3e4a32]">
              {t('home.importPptx')}
            </h2>
            <p className="mt-3 max-w-[32rem] text-[14px] leading-relaxed text-[#5d6b4d]">
              {t('home.importPptxTooltip', { maxSize: MAX_PPTX_SIZE_MB })}
            </p>
          </div>

          <div className="relative mt-auto pt-7">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#5d6b4d] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(93,107,77,0.20)] transition-colors group-hover:bg-[#3e4a32]">
              {importingPptx ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {pptxImportProgress || t('home.importingPptx')}
                </>
              ) : (
                <>
                  {t('home.importPptx')}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </span>
          </div>
        </button>
      </section>

      <input
        ref={pptxInputRef}
        type="file"
        accept=".pptx"
        multiple={false}
        className="hidden"
        onChange={(event) => void handlePptxFilesSelected(event.target.files)}
      />

    </div>
  )
}
