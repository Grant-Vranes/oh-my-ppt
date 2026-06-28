import 'katex/dist/katex.min.css'

import { Sigma } from 'lucide-react'
import { useMemo } from 'react'
import { Checkbox } from '../../ui/Checkbox'
import { InspectorSection } from './InspectorSection'
import { renderFormulaToHtml } from './formulaEditUtils'
import type { ElementEditorProps } from './types'
import { useT } from '@renderer/i18n'

const FORMULA_FIELDS = ['formulaLatex', 'formulaHtml', 'formulaDisplayMode'] as const

export function FormulaInspector({ draft, onDraftChange }: ElementEditorProps): React.JSX.Element {
  const t = useT()
  const rendered = useMemo(
    () => renderFormulaToHtml(draft.formulaLatex, draft.formulaDisplayMode),
    [draft.formulaDisplayMode, draft.formulaLatex]
  )

  const updateFormula = (latex: string, displayMode: boolean, commit = false): void => {
    const nextRendered = renderFormulaToHtml(latex, displayMode)
    const nextDraft = {
      ...draft,
      formulaLatex: latex,
      formulaDisplayMode: displayMode,
      formulaHtml: nextRendered.html
    }
    onDraftChange(
      nextDraft,
      commit && nextRendered.html ? { commit: true, fields: [...FORMULA_FIELDS] } : undefined
    )
  }

  return (
    <InspectorSection
      title={t('sessionDetail.formulaContent')}
      icon={<Sigma className="h-3.5 w-3.5 text-[#7a875f]" />}
    >
      <textarea
        value={draft.formulaLatex}
        onChange={(event) => updateFormula(event.target.value, draft.formulaDisplayMode)}
        onBlur={() => updateFormula(draft.formulaLatex, draft.formulaDisplayMode, true)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        className="min-h-[92px] w-full resize-y rounded-[9px] border border-[#d9cfbd]/72 bg-[#fffaf1]/92 px-2.5 py-2 font-mono text-[11px] leading-5 text-[#34402c] outline-none transition-colors placeholder:text-[#b1a58f] focus:border-[#9daf8a]"
        placeholder="x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
        spellCheck={false}
      />

      <label className="mt-2 flex items-center gap-2 text-[11px] text-[#6f664f]">
        <Checkbox
          checked={draft.formulaDisplayMode}
          onCheckedChange={(checked) =>
            updateFormula(draft.formulaLatex, checked === true, true)
          }
        />
        <span>{t('sessionDetail.formulaDisplayMode')}</span>
      </label>

      <div className="mt-3 rounded-[9px] border border-[#e1d6c4]/70 bg-white/64 px-2.5 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a806b]">
          {t('sessionDetail.formulaPreview')}
        </div>
        {rendered.html ? (
          <div
            className="overflow-x-auto text-[#0a0a0b]"
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />
        ) : (
          <p className="text-[11px] leading-5 text-[#a0977e]">
            {rendered.error || t('sessionDetail.formulaPreviewEmpty')}
          </p>
        )}
      </div>
    </InspectorSection>
  )
}
