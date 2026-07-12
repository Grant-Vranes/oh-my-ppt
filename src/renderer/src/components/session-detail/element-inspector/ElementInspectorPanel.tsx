import { X } from 'lucide-react'
import type { EditSelectionPayload } from '../../preview/edit-mode-script'
import { AppearanceInspector } from './AppearanceInspector'
import { ArtTextInspector } from './ArtTextInspector'
import { ChartInspector } from './ChartInspector'
import { FormulaInspector } from './FormulaInspector'
import { LayerInspector } from './LayerInspector'
import { LayoutInspector } from './LayoutInspector'
import { MediaInspector } from './MediaInspector'
import { TextInspector } from './TextInspector'
import type { ElementEditDraft } from './types'
import { getElementKindLabel, hasCapability, isArtTextSelection } from './types'
import { useT } from '@renderer/i18n'
import { sessionDetailRightPanelContentClass } from '../workspace/right-panel/styles'

export type { ElementEditDraft } from './types'

export function ElementInspectorPanel({
  selection,
  draft,
  onDraftChange,
  onClose
}: {
  selection: EditSelectionPayload | null
  draft: ElementEditDraft
  onDraftChange: (
    draft: ElementEditDraft,
    options?: { commit?: boolean; fields?: Array<keyof ElementEditDraft> }
  ) => void
  onClose: () => void
}): React.JSX.Element {
  const t = useT()
  const snapshot = selection?.snapshot
  const isArtText = isArtTextSelection(selection)

  return (
    <div className={sessionDetailRightPanelContentClass}>
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[0.85rem] border border-[#e1d6c4]/58 bg-[#fffaf1]/68 px-2.5 py-2 shadow-[0_2px_8px_rgba(77,61,43,0.05)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#c7d9b4]/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a875f]/90">
              {t('sessionDetail.elementInspector')}
            </div>
            {selection && (
              <div className="mt-0.5 text-[10px] text-[#a0977e]">
                {isArtText ? t('editMode.artText') : getElementKindLabel(selection)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#667257] transition-colors hover:bg-[#d4e4c1]/70 hover:text-[#34402c]"
            aria-label={t('sessionDetail.closeInspector')}
            title={t('sessionDetail.closeInspector')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-2 py-2">
        {!selection || !snapshot ? (
          <div className="rounded-[0.8rem] border border-[#e8c8c6]/62 bg-[#fdf0ef]/76 px-3 py-3 text-center shadow-[0_4px_10px_rgba(74,59,42,0.06)]">
            <p className="whitespace-pre-line text-[11px] leading-5 text-[#8e5a53]">
              {t('sessionDetail.inspectorUnavailable')}
            </p>
          </div>
        ) : (
          <>
            <LayoutInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            {hasCapability(selection, 'layer') && (
              <LayerInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
            {isArtText && (
              <ArtTextInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
            {!isArtText && hasCapability(selection, 'text') && (
              <TextInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
            {hasCapability(selection, 'formula') && (
              <FormulaInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
            {hasCapability(selection, 'chart') && (
              <ChartInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
            {hasCapability(selection, 'appearance') && (
              <AppearanceInspector
                selection={selection}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            )}
            {hasCapability(selection, 'media') && (
              <MediaInspector selection={selection} draft={draft} onDraftChange={onDraftChange} />
            )}
          </>
        )}

      </div>
    </div>
  )
}
