import { MousePointer2 } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { InspectorSection } from '../../element-inspector/InspectorSection'
import { WorkbenchPanelShell } from './WorkbenchPanelShell'

export function EmptyEditWorkbenchPanel(): React.JSX.Element {
  const t = useT()
  return (
    <WorkbenchPanelShell title={t('sessionDetail.elementInspector')}>
      <InspectorSection
        title={t('sessionDetail.noElementSelected')}
        icon={<MousePointer2 className="h-3.5 w-3.5 text-[#7a875f]" />}
      >
        <div className="h-16 rounded-[0.95rem] border border-dashed border-[#e4e4e7]/72 bg-[#f7f1e7]/54" />
      </InspectorSection>
    </WorkbenchPanelShell>
  )
}
