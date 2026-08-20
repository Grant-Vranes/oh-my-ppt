import { Sparkles } from 'lucide-react'
import {
  buildArtTextInnerHtml,
  getArtTextTemplateLabel,
  isArtTextTemplateId
} from '@renderer/lib/artTextTemplates'
import { Input } from '../../ui/Input'
import { InspectorSection } from './InspectorSection'
import type { ElementEditorProps } from './types'
import { useT } from '@renderer/i18n'

export function ArtTextInspector({
  selection,
  draft,
  onDraftChange
}: ElementEditorProps): React.JSX.Element {
  const t = useT()
  const templateId = selection.snapshot?.attrs.artTextTemplate || draft.artTextTemplateId
  const templateLabel = getArtTextTemplateLabel(templateId) || t('editMode.artText')
  const canEditText = isArtTextTemplateId(templateId)

  const updateText = (text: string, commit = false): void => {
    if (!canEditText) return
    onDraftChange(
      {
        ...draft,
        text,
        html: buildArtTextInnerHtml(templateId, text),
        artTextTemplateId: templateId
      },
      commit ? { commit: true, fields: ['html'] } : undefined
    )
  }

  return (
    <InspectorSection
      title={t('editMode.artText')}
      icon={<Sparkles className="h-3.5 w-3.5 text-[#7a875f]" />}
    >
      <div className="space-y-2.5">
        <div className="rounded-[1rem] border border-[#e4e4e7]/60 bg-[#ffffff]/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a806b]">
            {t('editMode.artTextEffect')}
          </div>
          <div className="mt-1 text-xs font-semibold text-[#3f4b35]">{templateLabel}</div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-medium text-[#7a875f]">
            {t('editMode.artTextContent')}
          </span>
          <Input
            value={draft.text}
            onChange={(event) => updateText(event.target.value)}
            onBlur={(event) => updateText(event.target.value, true)}
            disabled={!canEditText}
            className="h-8 rounded-full border border-[#e4e4e7]/72 bg-[#ffffff]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-medium text-[#7a875f]">
            {t('editMode.artTextFontSize')}
          </span>
          <Input
            type="number"
            min={8}
            max={160}
            value={draft.fontSize}
            onChange={(event) => onDraftChange({ ...draft, fontSize: event.target.value })}
            onBlur={(event) =>
              onDraftChange(
                { ...draft, fontSize: event.target.value },
                { commit: true, fields: ['fontSize'] }
              )
            }
            className="h-8 rounded-full border border-[#e4e4e7]/72 bg-[#ffffff]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </label>
      </div>
    </InspectorSection>
  )
}
