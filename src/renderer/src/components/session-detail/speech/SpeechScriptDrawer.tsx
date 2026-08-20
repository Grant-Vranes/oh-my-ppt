import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FileText, Loader2, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '../../ui/Button'
import { ModelSplitButton } from '../../model/ModelActionButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import type { SpeechConfig, SpeechLength, SpeechScope, SpeechStyle } from '@shared/speech'
import { useSpeechScriptDrawerController } from './useSpeechScriptDrawerController'
import { sessionDetailRightPanelContentClass } from '../workspace/right-panel/styles'

export type { SpeechConfig }

export function SpeechScriptDrawer({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const t = useT()
  const {
    open,
    isGenerating,
    speechProgress,
    speechConfig,
    modelAction,
    currentPageNumber,
    currentPageTitle,
    setSpeechConfig,
    generate,
    close
  } = useSpeechScriptDrawerController(sessionId)
  const [script, setScript] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadScript = useCallback((): void => {
    void ipc
      .getSpeechScript(sessionId)
      .then((result) => {
        setScript(result.script ?? null)
      })
      .catch(() => {
        setScript(null)
      })
  }, [sessionId])

  const visibleScript = useMemo(() => {
    if (!script) return null
    if (speechConfig.scope === 'all') return script

    const sections = script
      .split(/\n\s*---\s*\n/g)
      .map((section) => section.trim())
      .filter(Boolean)
    const title = (currentPageTitle || '').replace(/\s+/g, ' ').trim().toLowerCase()
    const pageNumber = Number.isFinite(currentPageNumber) ? Number(currentPageNumber) : null

    return (
      sections.find((section) => {
        const heading = (section.split(/\r?\n/).find((line) => line.trim().length > 0) || '')
          .replace(/^#+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
        if (
          pageNumber &&
          new RegExp(`(?:第\\s*${pageNumber}\\s*页|slide\\s*${pageNumber}\\b)`, 'i').test(heading)
        ) {
          return true
        }
        return Boolean(title) && heading.includes(title)
      }) || null
    )
  }, [currentPageNumber, currentPageTitle, script, speechConfig.scope])

  // Load on mount / session change
  useEffect(() => {
    loadScript()
  }, [loadScript])

  // Reload after generation finishes (skip initial render via ref)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!isGenerating) {
      loadScript()
    }
  }, [isGenerating, loadScript])

  const handleScopeChange = (scope: SpeechScope): void => {
    setSpeechConfig({ ...speechConfig, scope })
  }

  const generationLabel =
    speechConfig.scope === 'single' && currentPageNumber
      ? t('sessionDetail.speechScriptGeneratingSingle', { pageNumber: currentPageNumber })
      : speechProgress
        ? t('sessionDetail.speechScriptGenerating', {
            current: speechProgress.current,
            total: speechProgress.total
          })
        : t('sessionDetail.speechScriptGeneratingInit')

  useEffect(() => {
    setCopied(false)
  }, [visibleScript])

  const handleCopy = async (): Promise<void> => {
    if (!visibleScript) return
    try {
      await navigator.clipboard.writeText(visibleScript)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = visibleScript
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }

  const handleViewFile = (): void => {
    void ipc.openSpeechScriptFile(sessionId)
  }

  const handleGenerate = (modelConfigId: string): void => {
    const nextConfig = { ...speechConfig, modelConfigId }
    setSpeechConfig(nextConfig)
    generate(nextConfig)
  }

  if (!open || !sessionId) return null

  return (
    <div className={sessionDetailRightPanelContentClass}>
      {/* Header card */}
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[0.85rem] border border-[#e4e4e7]/58 bg-[#ffffff]/68 px-2.5 py-2 shadow-[0_2px_8px_rgba(77,61,43,0.05)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#c7d9b4]/10" />
        <div className="relative flex items-center justify-between">
          <h3 className="text-[12px] font-semibold tracking-[0.03em] text-[#34402c]">
            {t('sessionDetail.speechScriptDialogTitle')}
          </h3>
          <button
            type="button"
            aria-label={t('sessionDetail.closeSpeechDrawer')}
            onClick={close}
            className="rounded-md p-0.5 text-[#9a8f80] transition-colors hover:bg-[#f4f4f5]/80 hover:text-[#3e4a32]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Scope tabs */}
        <div className="mt-2 flex gap-0.5 rounded-lg bg-[#ede5d6]/52 p-0.5">
          {(['all', 'single'] as SpeechScope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleScopeChange(s)}
              className={cn(
                'flex-1 rounded-[0.55rem] py-1 text-[11px] font-medium transition-all',
                speechConfig.scope === s
                  ? 'bg-[#ffffff] text-[#3e4a32] shadow-[0_1px_3px_rgba(74,59,42,0.08)]'
                  : 'text-[#9a8f80] hover:text-[#5a6b4a]'
              )}
            >
              {s === 'all'
                ? t('sessionDetail.speechScriptScopeAll')
                : t('sessionDetail.speechScriptScopeSingle')}
            </button>
          ))}
        </div>
      </div>

      {/* Scope description */}
      <p className="shrink-0 px-2.5 pt-2 text-[10px] text-[#9a8f80]">
        {speechConfig.scope === 'all'
          ? t('sessionDetail.speechScriptScopeAllDesc')
          : currentPageTitle || t('sessionDetail.speechScriptScopeSingleDesc')}
      </p>

      {/* Config card (fixed, no scroll) */}
      <div className="mx-2 mt-1.5 shrink-0 overflow-hidden rounded-[0.8rem] border border-[#e4e4e7]/58 bg-[#ffffff]/68 shadow-[0_2px_8px_rgba(77,61,43,0.05)]">
        {/* Style row */}
        <div className="flex items-center gap-2 border-b border-[#ede5d6]/50 px-2.5 py-1.5">
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.05em] text-[#7a875f]">
            {t('sessionDetail.speechScriptStyle')}
          </span>
          <Select
            value={speechConfig.style}
            onValueChange={(v) => setSpeechConfig({ ...speechConfig, style: v as SpeechStyle })}
          >
            <SelectTrigger className="h-7 flex-1 border-[#e4e4e7]/60 bg-[#ffffff]/60 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conversational">
                {t('sessionDetail.speechScriptStyleConversational')}
              </SelectItem>
              <SelectItem value="formal">{t('sessionDetail.speechScriptStyleFormal')}</SelectItem>
              <SelectItem value="storytelling">
                {t('sessionDetail.speechScriptStyleStorytelling')}
              </SelectItem>
              <SelectItem value="custom">{t('sessionDetail.speechScriptStyleCustom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom style textarea */}
        {speechConfig.style === 'custom' && (
          <div className="border-b border-[#ede5d6]/50 px-2.5 py-1.5">
            <textarea
              className="w-full resize-none rounded-lg border border-[#e4e4e7]/80 bg-[#ffffff]/88 px-2.5 py-1.5 text-[11px] text-[#3f4b35] placeholder:text-[#b0a898] focus:border-[#9bb98a] focus:outline-none"
              rows={2}
              placeholder={t('sessionDetail.speechScriptStyleCustomPlaceholder')}
              value={speechConfig.customStyle ?? ''}
              onChange={(e) => setSpeechConfig({ ...speechConfig, customStyle: e.target.value })}
            />
          </div>
        )}

        {/* Length row */}
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.05em] text-[#7a875f]">
            {t('sessionDetail.speechScriptLength')}
          </span>
          <Select
            value={speechConfig.length}
            onValueChange={(v) => setSpeechConfig({ ...speechConfig, length: v as SpeechLength })}
          >
            <SelectTrigger className="h-7 flex-1 border-[#e4e4e7]/60 bg-[#ffffff]/60 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">{t('sessionDetail.speechScriptLengthShort')}</SelectItem>
              <SelectItem value="medium">{t('sessionDetail.speechScriptLengthMedium')}</SelectItem>
              <SelectItem value="long">{t('sessionDetail.speechScriptLengthLong')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Generate button */}
        <div className="border-t border-[#ede5d6]/60 px-3 py-2.5">
          <ModelSplitButton
            modelAction={modelAction}
            label={t(
              visibleScript
                ? 'sessionDetail.speechScriptRegenerate'
                : 'sessionDetail.speechScriptGenerate'
            )}
            loadingLabel={generationLabel}
            loading={isGenerating}
            disabled={isGenerating}
            icon={FileText}
            tone="primary"
            size="sm"
            className="w-full rounded-xl"
            mainClassName="min-w-0 flex-1 justify-center text-xs"
            triggerClassName="h-8"
            onRun={handleGenerate}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 shrink-0 border-t border-[#e4e4e7]/50" />

      {/* Result area (only this section scrolls) */}
      {isGenerating ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#6f8159]" />
          <p className="text-center text-xs text-[#7a6b56]">{generationLabel}</p>
        </div>
      ) : visibleScript ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-2.5 pb-3">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.15rem] border border-[#e4e4e7]/72 bg-[#ffffff]/78 px-3 py-3 shadow-[0_4px_12px_rgba(77,61,43,0.06)]">
            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[#3f4b35]">
              {visibleScript}
            </pre>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-xs"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t('sessionDetail.speechScriptCopied') : t('sessionDetail.speechScriptCopy')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-xs"
              onClick={handleViewFile}
            >
              <FileText className="h-3.5 w-3.5" />
              {t('sessionDetail.speechScriptViewFile')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="py-6 text-center text-[11px] text-[#b0a898]">
          {t('sessionDetail.speechScriptEmptyHint')}
        </p>
      )}
    </div>
  )
}
