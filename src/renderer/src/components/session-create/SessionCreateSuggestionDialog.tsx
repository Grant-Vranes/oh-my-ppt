import { useState, type Dispatch, type ReactElement, type SetStateAction } from 'react'
import { Check, FileText, Pencil, Sparkles, X } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog'
import { Input, Textarea } from '../ui/Input'
import { useT } from '@renderer/i18n'
import {
  isInternalDocumentPlanPageReason,
  type DocumentPlanPageSkeletonItem,
  type ParsedDocumentPlanResult,
  type SourceDocumentPlan
} from '@shared/generation'

type AttachedReferenceFile = ParsedDocumentPlanResult['files'][number]

export type DocumentPlanSuggestion = Pick<
  ParsedDocumentPlanResult,
  'topic' | 'pageCount' | 'briefText' | 'sourcePlan'
>

export type DocumentPlanSuggestionDraft = {
  topic: string
  pageCount: string
  briefText: string
  sourcePlan?: SourceDocumentPlan
}

const renumberPageSkeleton = (
  items: DocumentPlanPageSkeletonItem[]
): DocumentPlanPageSkeletonItem[] =>
  items.map((item, index) => ({
    ...item,
    pageNumber: index + 1
  }))

const inferOutlineLanguageIsChinese = (text: string): boolean => /[\u3400-\u9fff]/.test(text)

const normalizeOutlineItemContent = (item: DocumentPlanPageSkeletonItem): string => {
  return item.reason && !isInternalDocumentPlanPageReason(item.reason) ? item.reason : item.title
}

export const formatSourceOutlineBriefText = (items: DocumentPlanPageSkeletonItem[]): string => {
  const joinedText = items.map((item) => `${item.title}\n${item.reason}`).join('\n')
  const useChineseLabels = inferOutlineLanguageIsChinese(joinedText)
  const outlineLabel = useChineseLabels ? '建议大纲' : 'Recommended outline'
  const contentLabel = useChineseLabels ? '简要总结' : 'Brief summary'
  const pageLabel = useChineseLabels ? '第' : 'Page'
  const pageSuffix = useChineseLabels ? ' 页' : ''

  return [
    `## ${outlineLabel}`,
    ...items.map(
      (item) =>
        `### ${pageLabel} ${item.pageNumber}${pageSuffix}: ${item.title}\n\n- **${contentLabel}:** ${normalizeOutlineItemContent(
          item
        )}`
    )
  ].join('\n\n')
}

export const buildSuggestionDraft = (
  suggestion: DocumentPlanSuggestion
): DocumentPlanSuggestionDraft => {
  const pageSkeleton = suggestion.sourcePlan?.pageSkeleton
  return {
    topic: suggestion.topic,
    pageCount: String(pageSkeleton?.length || suggestion.pageCount),
    briefText: suggestion.briefText,
    sourcePlan: suggestion.sourcePlan
      ? {
          ...suggestion.sourcePlan,
          pageSkeleton: renumberPageSkeleton(suggestion.sourcePlan.pageSkeleton).map((item) => ({
            ...item,
            reason: normalizeOutlineItemContent(item)
          }))
        }
      : undefined
  }
}

export const updateDraftSourcePlanItems = (
  draft: DocumentPlanSuggestionDraft,
  updater: (items: DocumentPlanPageSkeletonItem[]) => DocumentPlanPageSkeletonItem[]
): DocumentPlanSuggestionDraft => {
  if (!draft.sourcePlan) return draft
  const pageSkeleton = renumberPageSkeleton(updater(draft.sourcePlan.pageSkeleton))
  return {
    ...draft,
    pageCount: pageSkeleton.length > 0 ? String(pageSkeleton.length) : draft.pageCount,
    sourcePlan:
      pageSkeleton.length > 0
        ? {
            ...draft.sourcePlan,
            pageSkeleton
          }
        : undefined
  }
}

export function SessionCreateSuggestionDialog({
  open,
  onOpenChange,
  attachedReferenceFile,
  suggestionDraft,
  setSuggestionDraft,
  applyTopicSuggestion,
  setApplyTopicSuggestion,
  applyPageCountSuggestion,
  setApplyPageCountSuggestion,
  applyBriefSuggestion,
  setApplyBriefSuggestion,
  onApplySelected
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  attachedReferenceFile: AttachedReferenceFile | null
  suggestionDraft: DocumentPlanSuggestionDraft | null
  setSuggestionDraft: Dispatch<SetStateAction<DocumentPlanSuggestionDraft | null>>
  applyTopicSuggestion: boolean
  setApplyTopicSuggestion: (value: boolean) => void
  applyPageCountSuggestion: boolean
  setApplyPageCountSuggestion: (value: boolean) => void
  applyBriefSuggestion: boolean
  setApplyBriefSuggestion: (value: boolean) => void
  onApplySelected: () => void
}): ReactElement {
  const t = useT()
  const [editingSuggestionField, setEditingSuggestionField] = useState<
    'topic' | 'pageCount' | 'brief' | null
  >(null)
  const [editingOutlineIndex, setEditingOutlineIndex] = useState<number | null>(null)
  const sourceOutlineItems = suggestionDraft?.sourcePlan?.pageSkeleton ?? []
  const hasSourceOutline = sourceOutlineItems.length > 0

  const close = (nextOpen: boolean): void => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setEditingSuggestionField(null)
      setEditingOutlineIndex(null)
    }
  }

  const updateSuggestionOutlineItem = (
    index: number,
    patch: Partial<DocumentPlanPageSkeletonItem>
  ): void => {
    setSuggestionDraft((current) =>
      current
        ? updateDraftSourcePlanItems(current, (items) =>
            items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
          )
        : current
    )
  }

  const deleteSuggestionOutlineItem = (index: number): void => {
    setSuggestionDraft((current) =>
      current
        ? updateDraftSourcePlanItems(current, (items) =>
            items.filter((_, itemIndex) => itemIndex !== index)
          )
        : current
    )
  }

  const suggestionCardClass =
    'rounded-lg border border-[#d7e8cc] bg-[#fbfff7] px-3 py-2.5 shadow-[0_4px_10px_rgba(93,107,77,0.06)]'
  const suggestionIconButtonClass =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#bfd9ae] bg-[#f8fff3] text-[#5f7448] transition-colors hover:bg-[#edf8e5]'
  const deleteSuggestionIconButtonClass =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#e1c4b9] bg-[#fff8f5] text-[#9a5d4d] transition-colors hover:bg-[#f5ded6]'

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden border-[#d8ccb5]/85 bg-[#f7f1e8] p-0">
        <DialogHeader className="border-b border-[#ded4c1] bg-[#fffaf1] px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#b9cda7]/75 bg-[#e6f1dc] text-[#405333] shadow-[0_4px_10px_rgba(93,107,77,0.08)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-sm">{t('home.analysisSuggestionTitle')}</DialogTitle>
              {attachedReferenceFile && (
                <span
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#d8ccb5]/72 bg-[#fff9ef]/86 px-2 py-1 text-[11px] font-medium text-[#5d6b4d]"
                  title={attachedReferenceFile.path}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{attachedReferenceFile.name}</span>
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {suggestionDraft && (
          <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
            <div className="space-y-2.5">
              <section
                className={`overflow-hidden rounded-xl border bg-[#fffdf8] shadow-[0_8px_18px_rgba(74,59,42,0.06)] transition-colors ${
                  applyTopicSuggestion
                    ? 'border-[#a9c693] ring-1 ring-[#cfe2c1]'
                    : 'border-[#e1d7c6]'
                }`}
              >
                <div className="p-3">
                  <div className={suggestionCardClass}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <input
                        type="checkbox"
                        checked={applyTopicSuggestion}
                        onChange={(event) => setApplyTopicSuggestion(event.target.checked)}
                        className="h-4 w-4 accent-[#6f8f64]"
                        aria-label={t('home.topic')}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSuggestionField(
                            editingSuggestionField === 'topic' ? null : 'topic'
                          )
                        }
                        className={suggestionIconButtonClass}
                        aria-label={
                          editingSuggestionField === 'topic' ? t('common.save') : t('common.edit')
                        }
                        title={
                          editingSuggestionField === 'topic' ? t('common.save') : t('common.edit')
                        }
                      >
                        {editingSuggestionField === 'topic' ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    {editingSuggestionField === 'topic' ? (
                      <Input
                        value={suggestionDraft.topic}
                        onChange={(event) =>
                          setSuggestionDraft((current) =>
                            current ? { ...current, topic: event.target.value } : current
                          )
                        }
                        className="h-8 border-[#cddfbe] bg-white text-xs text-[#405333]"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm font-medium leading-5 text-[#34402c]">
                        {suggestionDraft.topic || t('home.emptyValue')}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {hasSourceOutline && (
                <section
                  className={`overflow-hidden rounded-xl border bg-[#fffdf8] shadow-[0_8px_18px_rgba(74,59,42,0.06)] transition-colors ${
                    applyBriefSuggestion
                      ? 'border-[#a9c693] ring-1 ring-[#cfe2c1]'
                      : 'border-[#e1d7c6]'
                  }`}
                >
                  <div className="p-3">
                    <div className="rounded-lg bg-[#eef6e8] px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <input
                          type="checkbox"
                          checked={applyBriefSuggestion}
                          onChange={(event) => setApplyBriefSuggestion(event.target.checked)}
                          className="h-4 w-4 accent-[#6f8f64]"
                          aria-label={t('home.documentOutline')}
                        />
                        <span className="rounded-full border border-[#bfd9ae] bg-[#f8fff3] px-2 py-0.5 text-[11px] font-medium text-[#405333]">
                          {t('home.outlinePageCount', { count: sourceOutlineItems.length })}
                        </span>
                      </div>
                      <ol className="grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                        {sourceOutlineItems.map((item, index) => (
                          <li
                            key={`${item.pageNumber}-${item.lineStart}-${item.sourceHeading}`}
                            className="rounded-lg border border-[#d7e8cc] bg-[#fbfff7] px-3 py-2.5 shadow-[0_4px_10px_rgba(93,107,77,0.06)]"
                          >
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dceccb] text-[10px] font-semibold text-[#405333]">
                                  {item.pageNumber}
                                </span>
                                <div className="min-w-0">
                                  {editingOutlineIndex === index ? (
                                    <p className="text-[10px] font-medium text-[#6a8054]">
                                      {t('home.outlineItemTitle')}
                                    </p>
                                  ) : (
                                    <h4 className="min-w-0 break-words text-sm font-semibold leading-5 text-[#34402c]">
                                      {item.title || t('home.emptyValue')}
                                    </h4>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingOutlineIndex(
                                      editingOutlineIndex === index ? null : index
                                    )
                                  }
                                  className={suggestionIconButtonClass}
                                  aria-label={
                                    editingOutlineIndex === index
                                      ? t('common.save')
                                      : t('common.edit')
                                  }
                                  title={
                                    editingOutlineIndex === index
                                      ? t('common.save')
                                      : t('common.edit')
                                  }
                                >
                                  {editingOutlineIndex === index ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Pencil className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSuggestionOutlineItem(index)}
                                  className={deleteSuggestionIconButtonClass}
                                  aria-label={t('common.delete')}
                                  title={t('common.delete')}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {editingOutlineIndex === index ? (
                              <div className="mt-2 grid min-w-0 gap-1.5">
                                <Input
                                  value={item.title}
                                  onChange={(event) =>
                                    updateSuggestionOutlineItem(index, {
                                      title: event.target.value
                                    })
                                  }
                                  className="h-7 min-w-0 border-[#cddfbe] bg-white px-2 text-xs font-semibold text-[#34402c]"
                                />
                                <p className="text-[10px] font-medium text-[#6a8054]">
                                  {t('home.outlineItemContent')}
                                </p>
                                <Textarea
                                  value={item.reason}
                                  onChange={(event) =>
                                    updateSuggestionOutlineItem(index, {
                                      reason: event.target.value
                                    })
                                  }
                                  className="max-h-24 min-h-14 resize-y border-[#d7e8cc] bg-white px-2 py-1.5 text-[11px] leading-5 text-[#6d604d]"
                                />
                              </div>
                            ) : (
                              <div className="mt-2">
                                <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-[#6d604d]">
                                  {item.reason || t('home.emptyValue')}
                                </p>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </section>
              )}

              {!hasSourceOutline && (
                <section
                  className={`overflow-hidden rounded-xl border bg-[#fffdf8] shadow-[0_8px_18px_rgba(74,59,42,0.06)] transition-colors ${
                    applyPageCountSuggestion
                      ? 'border-[#a9c693] ring-1 ring-[#cfe2c1]'
                      : 'border-[#e1d7c6]'
                  }`}
                >
                  <div className="grid gap-3 p-3 md:grid-cols-[120px_1fr] md:items-center">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={applyPageCountSuggestion}
                        onChange={(event) => setApplyPageCountSuggestion(event.target.checked)}
                        className="h-4 w-4 accent-[#6f8f64]"
                      />
                      <span className="text-sm font-semibold text-[#34402c]">
                        {t('home.pageCount')}
                      </span>
                    </label>
                    <div className={suggestionCardClass}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingSuggestionField(
                              editingSuggestionField === 'pageCount' ? null : 'pageCount'
                            )
                          }
                          className={suggestionIconButtonClass}
                          aria-label={
                            editingSuggestionField === 'pageCount'
                              ? t('common.save')
                              : t('common.edit')
                          }
                          title={
                            editingSuggestionField === 'pageCount'
                              ? t('common.save')
                              : t('common.edit')
                          }
                        >
                          {editingSuggestionField === 'pageCount' ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {editingSuggestionField === 'pageCount' ? (
                        <Input
                          value={suggestionDraft.pageCount}
                          inputMode="numeric"
                          onChange={(event) => {
                            const next = event.target.value
                            if (next === '' || /^\d+$/.test(next)) {
                              setSuggestionDraft((current) =>
                                current ? { ...current, pageCount: next } : current
                              )
                            }
                          }}
                          className="h-8 border-[#cddfbe] bg-white text-xs text-[#405333]"
                        />
                      ) : (
                        <p className="text-sm font-semibold leading-5 text-[#34402c]">
                          {suggestionDraft.pageCount || t('home.emptyValue')}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {!hasSourceOutline && (
                <section
                  className={`overflow-hidden rounded-xl border bg-[#fffdf8] shadow-[0_8px_18px_rgba(74,59,42,0.06)] transition-colors ${
                    applyBriefSuggestion
                      ? 'border-[#a9c693] ring-1 ring-[#cfe2c1]'
                      : 'border-[#e1d7c6]'
                  }`}
                >
                  <div className="grid gap-3 p-3 md:grid-cols-[120px_1fr] md:items-start">
                    <label className="flex cursor-pointer items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        checked={applyBriefSuggestion}
                        onChange={(event) => setApplyBriefSuggestion(event.target.checked)}
                        className="h-4 w-4 accent-[#6f8f64]"
                      />
                      <span className="truncate text-sm font-semibold text-[#34402c]">
                        {t('home.brief')}
                      </span>
                    </label>
                    <div className={suggestionCardClass}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingSuggestionField(
                              editingSuggestionField === 'brief' ? null : 'brief'
                            )
                          }
                          className={suggestionIconButtonClass}
                          aria-label={
                            editingSuggestionField === 'brief' ? t('common.save') : t('common.edit')
                          }
                          title={
                            editingSuggestionField === 'brief' ? t('common.save') : t('common.edit')
                          }
                        >
                          {editingSuggestionField === 'brief' ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      {editingSuggestionField === 'brief' ? (
                        <Textarea
                          value={suggestionDraft.briefText}
                          onChange={(event) =>
                            setSuggestionDraft((current) =>
                              current ? { ...current, briefText: event.target.value } : current
                            )
                          }
                          className="max-h-40 min-h-24 resize-y border-[#cddfbe] bg-white text-xs leading-5 text-[#405333]"
                        />
                      ) : (
                        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#405333]">
                          {suggestionDraft.briefText || t('home.emptyValue')}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-1.5 border-t border-[#ded4c1] bg-[#fffaf1] px-5 py-2.5 sm:flex-row">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => close(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="h-8 px-3 text-xs" onClick={onApplySelected}>
            {t('home.applySelectedFields')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
