import { Play } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { useSessionDetailRuntimeStore } from '@renderer/store'
import { ElementAnimationPicker } from './ElementAnimationPicker'
import { IndexTransitionPicker } from './IndexTransitionPicker'
import { ToolRowShell } from './ToolRowShell'
import type { ToolRowProps } from './types'

export function AnimationToolRow({ disabled }: ToolRowProps): React.JSX.Element {
  const t = useT()
  const refreshCurrentPreview = useSessionDetailRuntimeStore(
    (state) => state.refreshCurrentPreview
  )

  return (
    <ToolRowShell>
      <IndexTransitionPicker disabled={disabled} />
      <ElementAnimationPicker disabled={disabled} />
      <button
        type="button"
        disabled={disabled}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[#d8ccb5]/70 bg-[#fffdf8]/88 px-2.5 text-[10px] font-bold leading-none text-[#314028] shadow-[inset_0_1px_2px_rgba(74,59,42,0.04)] transition-colors hover:bg-[#f3f7ed] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          refreshCurrentPreview()
        }}
      >
        <Play className="h-3 w-3 shrink-0" />
        <span>{t('sessionDetail.elementAnimationPreview')}</span>
      </button>
    </ToolRowShell>
  )
}
