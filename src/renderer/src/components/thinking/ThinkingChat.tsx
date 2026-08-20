import { useState, useRef, useEffect, useMemo, type KeyboardEvent, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import { useT } from '@renderer/i18n'
import { useToastStore } from '@renderer/store'
import { ipc } from '@renderer/lib/ipc'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip'
import {
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileSearch,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Send,
  User,
  X
} from 'lucide-react'
import { ScrollArea } from '../ui/ScrollArea'
import type { ThinkingChatMessage, ThinkingSource } from '@shared/thinking'
import { ModelSelectButton } from '../model/ModelActionButton'
import { useModelAction } from '@renderer/hooks/useModelAction'

const MAX_DOCUMENT_SIZE_MB = 10
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024
const MAX_IMAGE_SIZE_MB = 5
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['.md', '.txt', '.text', '.csv', '.docx'])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

interface ThinkingStep {
  type: 'tool_call' | 'tool_result'
  toolName: string
  summary: string
}

const getFileExtension = (name: string): string => {
  const match = name
    .trim()
    .toLowerCase()
    .match(/\.[^.]+$/)
  return match?.[0] || ''
}

const isSupportedImageFile = (file: File): boolean => {
  const ext = getFileExtension(file.name)
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

const isSupportedThinkingFile = (file: File): boolean => {
  const ext = getFileExtension(file.name)
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(ext) || SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

function StepIcon({ step }: { step: ThinkingStep }): ReactElement {
  const name = step.toolName
  if (name === 'read_file') return <FolderOpen className="h-3 w-3 shrink-0 text-[#7a8fa6]" />
  if (name === 'grep') return <FileSearch className="h-3 w-3 shrink-0 text-[#7a8fa6]" />
  if (name === 'update_thinking_document')
    return <Pencil className="h-3 w-3 shrink-0 text-[#8b7a5a]" />
  if (name === 'update_context_document')
    return <BookOpen className="h-3 w-3 shrink-0 text-[#6b8a6a]" />
  return <Check className="h-3 w-3 shrink-0 text-[#8b967e]" />
}

interface ThinkingChatProps {
  thinkingId: string
  messages: ThinkingChatMessage[]
  sources: ThinkingSource[]
  pendingSources: ThinkingSource[]
  loading: boolean
  thinkingSteps: ThinkingStep[]
  animatingText: string
  onSend: (content: string, modelConfigId: string) => void
  onSourcesUploaded: (sources: ThinkingSource[]) => void
  onSourceRemoved: (sourceId: string) => void
}

function MessageMarkdown({
  content,
  role
}: {
  content: string
  role: ThinkingChatMessage['role']
}): ReactElement {
  const isUser = role === 'user'
  const mutedText = isUser ? 'text-white/85' : 'text-[#5f6658]'
  const strongText = isUser ? 'text-white' : 'text-[#2f3329]'
  const borderColor = isUser ? 'border-white/30' : 'border-[#d7ddcf]'
  const listClass = isUser
    ? 'mb-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed marker:text-white/70'
    : 'mb-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed marker:text-[#8b967e]'
  const orderedListClass = isUser
    ? 'mb-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed marker:text-white/70'
    : 'mb-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed marker:text-[#8b967e]'
  const codeClass = isUser
    ? 'rounded bg-white/15 px-1 py-0.5 font-mono text-[12px] text-white'
    : 'rounded bg-[#edf0e7] px-1 py-0.5 font-mono text-[12px] text-[#2f3329]'

  return (
    <div className="markdown-message [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p
              className={`mb-2 whitespace-pre-wrap text-[13px] leading-relaxed ${isUser ? 'text-white' : 'text-[#2f3329]'}`}
            >
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className={`font-semibold ${strongText}`}>{children}</strong>
          ),
          em: ({ children }) => <em className={mutedText}>{children}</em>,
          ul: ({ children }) => <ul className={listClass}>{children}</ul>,
          ol: ({ children }) => <ol className={orderedListClass}>{children}</ol>,
          li: ({ children }) => (
            <li className={isUser ? 'text-white' : 'text-[#2f3329]'}>{children}</li>
          ),
          code: ({ children }) => <code className={codeClass}>{children}</code>,
          pre: ({ children }) => (
            <pre
              className={`mb-2 overflow-x-auto rounded-md p-3 text-[12px] leading-relaxed ${isUser ? 'bg-black/15 text-white' : 'bg-[#edf0e7] text-[#2f3329]'}`}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={`mb-2 border-l-2 pl-3 text-[13px] leading-relaxed ${borderColor} ${mutedText}`}
            >
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={
                isUser
                  ? 'underline decoration-white/50 underline-offset-2'
                  : 'text-[#466938] underline underline-offset-2'
              }
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function ThinkingChat({
  thinkingId,
  messages,
  sources,
  pendingSources,
  loading,
  thinkingSteps,
  animatingText,
  onSend,
  onSourcesUploaded,
  onSourceRemoved
}: ThinkingChatProps): ReactElement {
  const t = useT()
  const { success, error: toastError } = useToastStore()
  const modelAction = useModelAction()
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null)
  const [thinkingExpanded, setThinkingExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)

  const visibleThinkingSteps = useMemo(
    () => thinkingSteps.filter((step) => step.type === 'tool_call' && step.summary.trim()),
    [thinkingSteps]
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth'
      })
    })
  }, [messages, loading, visibleThinkingSteps, animatingText])

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || loading || modelAction.activatingModelConfigId) return
    const modelConfigId = await modelAction.ensureModelActive()
    if (!modelConfigId) return
    onSend(text, modelConfigId)
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (composingRef.current || e.nativeEvent.isComposing) return
      e.preventDefault()
      void handleSend()
    }
  }

  const handleAttachClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (files: FileList | null): Promise<void> => {
    const selectedFiles = Array.from(files || [])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (selectedFiles.length === 0) return

    const unsupportedFile = selectedFiles.find((file) => !isSupportedThinkingFile(file))
    if (unsupportedFile) {
      toastError(t('home.unsupportedFileTitle'), {
        description: t('thinking.uploadTooltip', {
          documentMaxSize: MAX_DOCUMENT_SIZE_MB,
          imageMaxSize: MAX_IMAGE_SIZE_MB
        })
      })
      return
    }

    const oversizedFile = selectedFiles.find((file) => {
      const maxSizeBytes = isSupportedImageFile(file)
        ? MAX_IMAGE_SIZE_BYTES
        : MAX_DOCUMENT_SIZE_BYTES
      return file.size > maxSizeBytes
    })
    if (oversizedFile) {
      const isImage = isSupportedImageFile(oversizedFile)
      toastError(t('home.documentTooLargeTitle'), {
        description: isImage
          ? t('home.imageTooLarge', { maxSize: MAX_IMAGE_SIZE_MB })
          : t('home.documentTooLarge', { maxSize: MAX_DOCUMENT_SIZE_MB })
      })
      return
    }

    const payloadFiles = selectedFiles
      .map((file) => ({
        path: window.electron?.getPathForFile?.(file) || '',
        name: file.name
      }))
      .filter((file) => file.path)

    if (payloadFiles.length === 0) return

    setUploading(true)
    try {
      const result = await ipc.thinkingUploadSources({
        thinkingId,
        files: payloadFiles
      })
      onSourcesUploaded(
        result.sources.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind as ThinkingSource['kind']
        }))
      )
      const hasDocumentFile = payloadFiles.some((file) =>
        SUPPORTED_DOCUMENT_EXTENSIONS.has(getFileExtension(file.name))
      )
      success(t('thinking.sourceUploaded'), {
        description: hasDocumentFile ? t('thinking.sourcePreprocessHint') : undefined
      })
    } catch (err) {
      toastError(t('thinking.uploadFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveSource = async (sourceId: string): Promise<void> => {
    if (loading || removingSourceId) return
    setRemovingSourceId(sourceId)
    try {
      await ipc.thinkingRemoveSource({ thinkingId, sourceId })
      onSourceRemoved(sourceId)
    } catch (err) {
      toastError(t('thinking.removeSourceFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setRemovingSourceId(null)
    }
  }

  const sourceIcon = (kind: ThinkingSource['kind']): ReactElement =>
    kind === 'image' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="flex-1 px-5 py-5" viewportRef={scrollRef}>
        {sources.length > 0 && (
          <div className="mb-4 flex justify-end">
            <div className="rounded-full bg-[#d4e4c1] px-3 py-1 text-[11px] font-semibold text-[#5d6b4d]">
              {t('thinking.sourceCount', { count: sources.length })}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[5%_95%_10%_90%/85%_15%_85%_15%] ${
                  msg.role === 'user' ? 'bg-[#5d6b4d] text-white' : 'bg-[#8fbc8f] text-white'
                }`}
              >
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[78%] rounded-[1.5rem] px-4 py-3 text-[13px] leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#5d6b4d] text-white'
                    : 'border border-[#e4e4e7] bg-[#f4f4f5] text-[#2f3329]'
                }`}
              >
                <MessageMarkdown content={msg.content} role={msg.role} />
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.attachments.map((att) => (
                      <span
                        key={att.id}
                        className={`inline-flex max-w-[200px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                          msg.role === 'user'
                            ? 'border border-white/20 bg-white/15 text-white/90'
                            : 'border border-[#c8d6ba] bg-[#d4e4c1] text-[#4f6340]'
                        }`}
                      >
                        {sourceIcon(att.kind)}
                        <span className="truncate">{att.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5%_95%_10%_90%/85%_15%_85%_15%] bg-[#8fbc8f] text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[78%] space-y-2">
                {/* Thinking process - collapsible */}
                {visibleThinkingSteps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setThinkingExpanded(!thinkingExpanded)}
                    className="flex w-[180px] items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-[#f4f4f5] px-3 py-2 text-left text-[11px] text-[#5d6b4d] transition-colors hover:bg-[#d4e4c1]"
                  >
                    {thinkingExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <span className="font-medium">{t('thinking.thinking')}</span>
                    <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                  </button>
                )}
                {thinkingExpanded && visibleThinkingSteps.length > 0 && (
                  <div className="w-[180px] rounded-[1.25rem] border border-[#e4e4e7] bg-[#f4f4f5]">
                    <div className="space-y-1.5 px-3 py-2">
                      {visibleThinkingSteps.map((step, idx) => (
                        <div
                          key={`${step.toolName}-${step.summary}-${idx}`}
                          className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#7a7060]"
                        >
                          <StepIcon step={step} />
                          <span className="min-w-0 break-words">{step.summary}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Animated response text */}
                {animatingText ? (
                  <div className="rounded-[1.5rem] border border-[#e4e4e7] bg-[#f4f4f5] px-4 py-3 text-[13px] leading-relaxed shadow-sm">
                    <MessageMarkdown content={animatingText} role="assistant" />
                  </div>
                ) : visibleThinkingSteps.length === 0 ? (
                  <div className="w-[180px] rounded-[1.5rem] border border-[#e4e4e7] bg-[#f4f4f5] px-4 py-3 text-[13px] text-[#5d6b4d] shadow-sm">
                    <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin align-[-2px]" />
                    {t('thinking.thinking')}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-[#e4e4e7] bg-[#ffffff] px-4 py-3">
        <div className="rounded-xl border border-[#e4e4e7] bg-[#f4f4f5] px-2 py-2 shadow-sm focus-within:border-[#8fbc8f] focus-within:ring-2 focus-within:ring-[#d4e4c1]">
          {pendingSources.length > 0 && (
            <div className="flex max-h-16 flex-wrap gap-1.5 overflow-y-auto px-2 pb-1.5">
              {pendingSources.map((source) => (
                <span
                  key={source.id}
                  className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-[#b8cca5] bg-[#d4e4c1] px-2.5 py-1 text-[10px] font-medium text-[#4f6340]"
                >
                  {sourceIcon(source.kind)}
                  <span className="truncate">{source.name}</span>
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#b9cfa6] disabled:opacity-40"
                    onClick={() => void handleRemoveSource(source.id)}
                    disabled={loading || removingSourceId === source.id}
                    title={t('thinking.removeSource')}
                  >
                    {removingSourceId === source.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleAttachClick}
                    disabled={loading || uploading}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5d6b4d] transition-colors hover:bg-[#d4e4c1] hover:text-[#3e4a32] disabled:opacity-40"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-[12px]">
                  {t('thinking.uploadTooltip', {
                    documentMaxSize: MAX_DOCUMENT_SIZE_MB,
                    imageMaxSize: MAX_IMAGE_SIZE_MB
                  })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <textarea
              className="max-h-36 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[13px] leading-relaxed text-[#2f3329] placeholder:text-[#9a9b8c] focus:outline-none"
              placeholder={t('thinking.inputPlaceholder')}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onCompositionStart={() => {
                composingRef.current = true
              }}
              onCompositionEnd={() => {
                composingRef.current = false
              }}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <div className="flex shrink-0 items-center gap-1">
              <ModelSelectButton modelAction={modelAction} disabled={loading} />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || Boolean(modelAction.activatingModelConfigId) || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3e4a32] text-white transition-colors hover:bg-[#5d6b4d] disabled:opacity-40 disabled:hover:bg-[#3e4a32]"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,.text,.csv,.docx,.png,.jpg,.jpeg,.webp"
          multiple
          className="hidden"
          onChange={(event) => void handleFilesSelected(event.target.files)}
        />
      </div>
    </div>
  )
}
