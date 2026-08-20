import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Type, X } from 'lucide-react'
import { RichTextBox } from '../ui/RichTextBox'
import { ToggleGroup, ToggleGroupItem } from '../ui/ToggleGroup'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip'
import { InspectorSection } from '../session-detail/element-inspector/InspectorSection'
import { AppearanceInspector } from '../session-detail/element-inspector/AppearanceInspector'
import { ArtTextInspector } from '../session-detail/element-inspector/ArtTextInspector'
import { ChartInspector } from '../session-detail/element-inspector/ChartInspector'
import { FormulaInspector } from '../session-detail/element-inspector/FormulaInspector'
import { LayerInspector } from '../session-detail/element-inspector/LayerInspector'
import { LayoutInspector } from '../session-detail/element-inspector/LayoutInspector'
import { MediaInspector } from '../session-detail/element-inspector/MediaInspector'
import type { ElementEditDraft } from '../session-detail/element-inspector/types'
import {
  getElementKindLabel,
  hasCapability,
  isArtTextSelection
} from '../session-detail/element-inspector/types'
import type { EditSelectionPayload } from '@arcsin1/presentation-editor-runtime'
import { useT } from '@renderer/i18n'

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
  { value: 'justify', icon: AlignJustify }
] as const

type DraftChange = (
  draft: ElementEditDraft,
  options?: { commit?: boolean; fields?: Array<keyof ElementEditDraft> }
) => void

function getPreviewScale(fontSize: string): number | undefined {
  const parsed = Number(String(fontSize || '').replace(/px$/i, ''))
  if (!Number.isFinite(parsed) || parsed <= 36) return undefined
  return 1 / 3
}

export function HtmlEditorTextInspector({
  draft,
  onDraftChange
}: {
  draft: ElementEditDraft
  onDraftChange: DraftChange
}): React.JSX.Element {
  const t = useT()
  const textAlign = draft.textAlign || 'left'
  const previewScale = getPreviewScale(draft.fontSize)
  const getAlignLabel = (value: (typeof TEXT_ALIGN_OPTIONS)[number]['value']): string => {
    switch (value) {
      case 'center':
        return t('sessionDetail.alignCenter')
      case 'right':
        return t('sessionDetail.alignRight')
      case 'justify':
        return t('sessionDetail.alignJustify')
      default:
        return t('sessionDetail.alignLeft')
    }
  }

  return (
    <InspectorSection
      title={t('sessionDetail.textContent')}
      icon={<Type className="h-3.5 w-3.5 text-[#71717a]" />}
    >
      <RichTextBox
        value={draft.html}
        fallbackText={draft.text}
        defaultColor={draft.color}
        defaultFontSize={draft.fontSize}
        previewScale={previewScale}
        onChange={(value) => onDraftChange({ ...draft, html: value.html, text: value.text })}
        onCommit={(value) =>
          onDraftChange(
            { ...draft, html: value.html, text: value.text },
            { commit: true, fields: ['html'] }
          )
        }
      />
      <div className="mt-3 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a806b]">
          {t('sessionDetail.textAlign')}
        </div>
        <ToggleGroup
          type="single"
          value={textAlign}
          onValueChange={(value) => {
            if (!value) return
            onDraftChange({ ...draft, textAlign: value }, { commit: true, fields: ['textAlign'] })
          }}
          aria-label={t('sessionDetail.textAlign')}
          className="inline-flex overflow-hidden rounded-md border border-[#e4e4e7]/72 bg-[#ffffff]/90 p-0.5 shadow-[inset_0_1px_2px_rgba(77,63,46,0.06)]"
        >
          {TEXT_ALIGN_OPTIONS.map(({ value, icon: Icon }) => {
            const label = getAlignLabel(value)
            return (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={value}
                    aria-label={label}
                    title={label}
                    className="rounded-[6px]"
                    onPointerDown={(event) => event.preventDefault()}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            )
          })}
        </ToggleGroup>
      </div>
    </InspectorSection>
  )
}

export function HtmlEditorInspectorPanel({
  selection,
  draft,
  onDraftChange,
  onClose
}: {
  selection: EditSelectionPayload | null
  draft: ElementEditDraft
  onDraftChange: DraftChange
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const snapshot = selection?.snapshot
  const isArtText = isArtTextSelection(selection)

  return (
    <div className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden">
      <div className="relative mx-2 mt-2 overflow-hidden rounded-lg border border-[#e4e4e7]/58 bg-[#ffffff]/68 px-2.5 py-2 shadow-[0_2px_8px_rgba(77,61,43,0.05)]">
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#71717a]/90">
              {t('sessionDetail.elementInspector')}
            </div>
            {selection ? (
              <div className="mt-0.5 text-[10px] text-[#a0977e]">
                {isArtText ? t('editMode.artText') : getElementKindLabel(selection)}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#667257] transition-colors hover:bg-[#fff7ed]/70 hover:text-[#18181b]"
            aria-label={t('sessionDetail.closeInspector')}
            title={t('sessionDetail.closeInspector')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-2 py-2">
        {!selection || !snapshot ? (
          <div className="rounded-lg border border-[#e8c8c6]/62 bg-[#fdf0ef]/76 px-3 py-3 text-center shadow-[0_4px_10px_rgba(74,59,42,0.06)]">
            <p className="whitespace-pre-line text-[11px] leading-5 text-[#dc2626]">
              {t('sessionDetail.inspectorUnavailable')}
            </p>
          </div>
        ) : (
          <>
            <LayoutInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            {hasCapability(selection, 'layer') ? (
              <LayerInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            ) : null}
            {isArtText ? (
              <ArtTextInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            ) : null}
            {!isArtText && hasCapability(selection, 'text') ? (
              <HtmlEditorTextInspector draft={draft} onDraftChange={onDraftChange} />
            ) : null}
            {hasCapability(selection, 'formula') ? (
              <FormulaInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            ) : null}
            {hasCapability(selection, 'chart') ? (
              <ChartInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            ) : null}
            {hasCapability(selection, 'appearance') ? (
              <AppearanceInspector
                selection={selection}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            ) : null}
            {hasCapability(selection, 'media') ? (
              <MediaInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
