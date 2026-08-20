import { Move } from 'lucide-react'
import { InspectorSection } from './InspectorSection'
import type { ElementEditorProps, ElementEditDraft } from './types'
import { useT } from '@renderer/i18n'

const LAYOUT_FIELDS: Array<{ key: keyof ElementEditDraft; label: string }> = [
  { key: 'layoutX', label: 'X' },
  { key: 'layoutY', label: 'Y' },
  { key: 'layoutWidth', label: 'W' },
  { key: 'layoutHeight', label: 'H' }
]

export function LayoutInspector({ draft }: ElementEditorProps): React.JSX.Element {
  const t = useT()
  return (
    <InspectorSection
      title={t('sessionDetail.adjustLayout')}
      icon={<Move className="h-3.5 w-3.5 text-[#7a875f]" />}
    >
      <div className="grid grid-cols-4 gap-2">
        {LAYOUT_FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1 text-center">
            <span className="text-[11px] font-medium text-[#7a875f]">{label}</span>
            <div className="flex h-8 items-center justify-center rounded-full border border-[#d7cbb7]/40 bg-[#fafafa]/40 px-1.5 text-[11px] text-[#a0977e]/70">
              {draft[key]}
            </div>
          </div>
        ))}
      </div>
    </InspectorSection>
  )
}
