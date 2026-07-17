import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Loader2, Send, Sparkles, Tag, X } from 'lucide-react'
import { useT } from '../../i18n'
import { ipc, type HtmlEditorAiElementContext, type HtmlEditorAiMessage } from '../../lib/ipc'
import { useModelAction } from '../../hooks/useModelAction'
import { useHtmlEditStore } from '../../store/htmlEditStore'
import { useHtmlEditHistoryStore } from '../../store/htmlEditHistoryStore'
import { useHtmlEditorAiStore } from '../../store/htmlEditorAiStore'
import { useHtmlEditorStore } from '../../store/htmlEditorStore'
import { useHtmlEditorUiStore } from '../../store/htmlEditorUiStore'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'
import { ModelSplitButton } from '../model/ModelActionButton'

const MAX_AI_HISTORY_MESSAGES = 6
const MAX_AI_HISTORY_MESSAGE_LENGTH = 1_800
const MAX_AI_ELEMENT_HTML_LENGTH = 10_000

function HtmlEditorAiMessageBubble({
  role,
  content,
  selectedElement
}: {
  role: HtmlEditorAiMessage['role']
  content: string
  selectedElement?: HtmlEditorAiElementContext
}): ReactElement {
  const isUser = role === 'user'
  const selectedElementLabel =
    selectedElement?.label ||
    (selectedElement?.elementTag
      ? `<${selectedElement.elementTag}>`
      : selectedElement?.selector || '')
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[280px] whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-[13px] leading-5 shadow-sm ${
          isUser
            ? 'border-[#c7d9b4]/80 bg-[#e6f1dc]/85 text-[#34402c]'
            : 'border-[#ded2bd]/80 bg-[#fffaf1]/90 text-[#3f372b]'
        }`}
      >
        {isUser && selectedElement?.selector ? (
          <div
            className="mb-1.5 flex min-w-0 items-center gap-1 text-[10px] leading-4 text-[#537044]"
            title={selectedElement.selector}
          >
            <Tag className="h-3 w-3 shrink-0" />
            <span className="truncate">{selectedElementLabel}</span>
          </div>
        ) : null}
        {content}
      </div>
    </div>
  )
}

export function HtmlEditorAiPanel(): ReactElement {
  const t = useT()
  const modelAction = useModelAction()
  const docId = useHtmlEditorStore((state) => state.docId)
  const documentTitle = useHtmlEditorStore((state) => state.title)
  const input = useHtmlEditorAiStore((state) => state.input)
  const messages = useHtmlEditorAiStore((state) => state.messages)
  const isSending = useHtmlEditorAiStore((state) => state.isSending)
  const error = useHtmlEditorAiStore((state) => state.error)
  const setInput = useHtmlEditorAiStore((state) => state.setInput)
  const addMessage = useHtmlEditorAiStore((state) => state.addMessage)
  const setMessages = useHtmlEditorAiStore((state) => state.setMessages)
  const setSending = useHtmlEditorAiStore((state) => state.setSending)
  const setError = useHtmlEditorAiStore((state) => state.setError)
  const setPlan = useHtmlEditorAiStore((state) => state.setPlan)
  const clearConversation = useHtmlEditorAiStore((state) => state.clearConversation)
  const pendingPlan = useHtmlEditorAiStore((state) => state.pendingPlan)
  const requiresConfirmation = useHtmlEditorAiStore((state) => state.requiresConfirmation)
  const selectedSelector = useHtmlEditorUiStore((state) => state.selectedSelector)
  const selectorLabel = useHtmlEditorUiStore((state) => state.selectorLabel)
  const elementTag = useHtmlEditorUiStore((state) => state.elementTag)
  const elementText = useHtmlEditorUiStore((state) => state.elementText)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const [selectedHtml, setSelectedHtml] = useState('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    let disposed = false
    if (!selectedSelector) {
      setSelectedHtml('')
      return () => {
        disposed = true
      }
    }
    const iframe = useHtmlEditStore.getState().iframeHandle
    if (!iframe?.readElementHtml) return undefined
    void iframe
      .readElementHtml(selectedSelector)
      .then((html) => {
        if (!disposed) setSelectedHtml(String(html || '').slice(0, MAX_AI_ELEMENT_HTML_LENGTH))
      })
      .catch(() => {
        if (!disposed) setSelectedHtml('')
      })
    return () => {
      disposed = true
    }
  }, [selectedSelector])

  useEffect(() => {
    let disposed = false
    if (!docId) return undefined
    void ipc
      .listHtmlEditorMessages({ docId })
      .then(({ messages: storedMessages }) => {
        if (disposed) return
        setMessages(storedMessages)
        const latestPlanMessage = [...storedMessages]
          .reverse()
          .find((message) => message.role === 'assistant' && message.plan)
        setPlan({
          intent: latestPlanMessage?.intent || latestPlanMessage?.plan?.intent || 'other',
          plan: latestPlanMessage?.plan || null,
          requiresConfirmation: latestPlanMessage?.requiresConfirmation === true
        })
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : t('htmlEditor.aiFailed'))
        }
      })
    return () => {
      disposed = true
    }
  }, [docId, setError, setMessages, setPlan, t])

  const sendMessage = async (modelConfigId: string): Promise<void> => {
    const userMessage = input.trim()
    if (!userMessage || isSending || !docId) return

    const recentMessages: HtmlEditorAiMessage[] = messages
      .slice(-MAX_AI_HISTORY_MESSAGES)
      .map(({ role, content }) => ({
        role,
        content: content.slice(0, MAX_AI_HISTORY_MESSAGE_LENGTH)
      }))
    const planForConfirmation = requiresConfirmation ? pendingPlan : undefined
    const messageSelectedElement = selectedSelector
      ? {
          selector: selectedSelector,
          label: selectorLabel,
          elementTag,
          elementText
        }
      : undefined
    addMessage({ role: 'user', content: userMessage, selectedElement: messageSelectedElement })
    setInput('')
    setError(null)
    setPlan({ intent: 'other', plan: null, requiresConfirmation: false })
    setSending(true)

    try {
      let latestSelectedHtml = selectedHtml
      if (selectedSelector) {
        const iframe = useHtmlEditStore.getState().iframeHandle
        if (iframe?.readElementHtml) {
          try {
            latestSelectedHtml = (await iframe.readElementHtml(selectedSelector)).slice(
              0,
              MAX_AI_ELEMENT_HTML_LENGTH
            )
          } catch {
            // Use the last successfully read fragment when the webview is reloading.
          }
        }
      }
      const result = await ipc.htmlEditorAiChat({
        documentId: docId,
        documentTitle,
        pageHtml: '',
        selectedElement: selectedSelector
          ? {
              selector: selectedSelector,
              label: selectorLabel,
              elementTag,
              elementText,
              html: latestSelectedHtml
            }
          : undefined,
        recentMessages,
        pendingPlan: planForConfirmation || undefined,
        userMessage,
        modelConfigId
      })
      addMessage({
        role: 'assistant',
        content: result.reply,
        selectedElement: messageSelectedElement
      })
      if (result.applied && result.appliedHtml) {
        useHtmlEditorStore.getState().setHtml(result.appliedHtml)
        useHtmlEditStore.getState().resetForPage()
        useHtmlEditHistoryStore.getState().clearPage(docId)
        useHtmlEditorUiStore.getState().clearSelectedElement()
        useHtmlEditorUiStore.getState().bumpPreviewKey()
      }
      setPlan({
        intent: result.intent,
        plan: result.plan,
        requiresConfirmation: result.requiresConfirmation
      })
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('htmlEditor.aiFailed'))
    } finally {
      setSending(false)
    }
  }

  const sendDisabled = !input.trim() || isSending || !docId
  const selectedLabel = selectorLabel || selectedSelector || ''

  const handleClearConversation = async (): Promise<void> => {
    if (!docId) return
    try {
      await ipc.clearHtmlEditorMessages({ docId })
      clearConversation()
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : t('htmlEditor.aiFailed'))
    }
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[#e2dccf] bg-[#f5f1e8]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e2dccf] px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-[#5d6b4d]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#34402c]">{t('htmlEditor.aiMode')}</div>
          <div className="text-[10px] text-[#7a806e]">{t('htmlEditor.aiInspectHint')}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            useHtmlEditorAiStore.getState().setEnabled(false)
            useHtmlEditorUiStore.getState().clearSelectedElement()
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#6d604d] transition-colors hover:bg-[#ece5d6]"
          title={t('htmlEditor.closeAiMode')}
          aria-label={t('htmlEditor.closeAiMode')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2.5">
          {messages.length === 0 ? (
            <div className="py-10 text-center text-xs leading-5 text-[#817664]">
              {t('htmlEditor.aiEmpty')}
            </div>
          ) : (
            messages.map((message) => (
              <HtmlEditorAiMessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
                selectedElement={message.selectedElement}
              />
            ))
          )}
          {isSending ? (
            <div className="flex items-center gap-2 text-xs text-[#7a806e]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('htmlEditor.aiThinking')}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl bg-[#f3e6e2] px-3 py-2 text-xs leading-5 text-[#8e5a53]">
              {error}
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-[#e2dccf] bg-[#fffaf1]/45 p-3">
        {selectedSelector ? (
          <div className="mb-2 rounded-xl border border-[#c7d9b4]/70 bg-[#e6f1dc]/70 px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-[#4f6340]">
                {t('htmlEditor.selectedElement')}
              </span>
              <button
                type="button"
                onClick={() => useHtmlEditorUiStore.getState().clearSelectedElement()}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#64735a] hover:bg-[#d4e4c1]"
                title={t('htmlEditor.clearSelectedElement')}
                aria-label={t('htmlEditor.clearSelectedElement')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="truncate text-xs font-medium text-[#405333]" title={selectedSelector}>
              {selectedLabel}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[#5f6e50]">
              {elementTag ? `<${elementTag}>` : ''}
              {elementText ? ` ${elementText}` : ''}
            </div>
          </div>
        ) : (
          <div className="mb-2 rounded-xl border border-dashed border-[#cfc4b1] bg-[#fffaf1]/70 px-3 py-2 text-xs leading-5 text-[#766c5b]">
            {t('htmlEditor.aiSelectHint')}
          </div>
        )}
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              if (composingRef.current || event.nativeEvent.isComposing) return
              event.preventDefault()
              if (!sendDisabled) {
                void modelAction.ensureModelActive().then((modelConfigId) => {
                  if (modelConfigId) void sendMessage(modelConfigId)
                })
              }
            }
          }}
          placeholder={t('htmlEditor.aiPlaceholder')}
          disabled={isSending}
          rows={4}
          className="min-h-[96px] resize-none rounded-xl border-[#ded2bd]/75 bg-[#fffdf8]/90 text-[13px] leading-5 focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] text-[#827662]">
            {selectedSelector
              ? t('htmlEditor.aiSelectedContext')
              : t('htmlEditor.aiDocumentContext')}
          </span>
          <ModelSplitButton
            modelAction={modelAction}
            label={t('htmlEditor.aiSend')}
            loadingLabel={t('htmlEditor.aiThinking')}
            loading={isSending}
            disabled={sendDisabled}
            icon={Send}
            tone="subtle"
            size="sm"
            className="shrink-0"
            mainClassName="h-8 px-2.5 text-xs"
            triggerClassName="h-8 px-1.5"
            onRun={sendMessage}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleClearConversation()}
          className="mt-1 h-7 px-1 text-[11px] text-[#827662] hover:bg-transparent hover:text-[#4f6340]"
        >
          {t('htmlEditor.aiClearConversation')}
        </Button>
      </div>
    </aside>
  )
}
