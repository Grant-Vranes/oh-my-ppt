import type { JSX } from 'react'
import type { AnimationPreferenceId } from '@shared/generation'
import { useToastStore } from '../../store'
import { useT, type I18nKey } from '../../i18n'

const MAX_SELECTED_ANIMATION_PREFERENCES = 3

const OPTIONS: Array<{ id: AnimationPreferenceId; labelKey: I18nKey }> = [
  { id: 'fade', labelKey: 'home.animationPreferenceOptions.fade' },
  { id: 'fade-up', labelKey: 'home.animationPreferenceOptions.fade-up' },
  { id: 'fade-down', labelKey: 'home.animationPreferenceOptions.fade-down' },
  { id: 'fade-left', labelKey: 'home.animationPreferenceOptions.fade-left' },
  { id: 'fade-right', labelKey: 'home.animationPreferenceOptions.fade-right' },
  { id: 'scale-in', labelKey: 'home.animationPreferenceOptions.scale-in' },
  { id: 'slide-up', labelKey: 'home.animationPreferenceOptions.slide-up' },
  { id: 'slide-down', labelKey: 'home.animationPreferenceOptions.slide-down' },
  { id: 'slide-left', labelKey: 'home.animationPreferenceOptions.slide-left' },
  { id: 'slide-right', labelKey: 'home.animationPreferenceOptions.slide-right' },
  { id: 'fly-in', labelKey: 'home.animationPreferenceOptions.fly-in' },
  { id: 'wipe', labelKey: 'home.animationPreferenceOptions.wipe' },
  { id: 'zoom-in', labelKey: 'home.animationPreferenceOptions.zoom-in' },
  { id: 'spin-in', labelKey: 'home.animationPreferenceOptions.spin-in' },
  { id: 'pulse-soft', labelKey: 'home.animationPreferenceOptions.pulse-soft' },
  { id: 'pulse', labelKey: 'home.animationPreferenceOptions.pulse' },
  { id: 'pulse-strong', labelKey: 'home.animationPreferenceOptions.pulse-strong' },
  { id: 'grow-shrink-soft', labelKey: 'home.animationPreferenceOptions.grow-shrink-soft' },
  { id: 'grow-shrink', labelKey: 'home.animationPreferenceOptions.grow-shrink' },
  { id: 'grow-shrink-strong', labelKey: 'home.animationPreferenceOptions.grow-shrink-strong' }
]

type AnimationPreferenceChipsProps = {
  selectedIds: AnimationPreferenceId[]
  onChange: (ids: AnimationPreferenceId[]) => void
  compact?: boolean
}

export function AnimationPreferenceChips({
  selectedIds,
  onChange,
  compact = false
}: AnimationPreferenceChipsProps): JSX.Element {
  const { warning } = useToastStore()
  const t = useT()
  const selectedSet = new Set(selectedIds)

  const togglePreference = (id: AnimationPreferenceId): void => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id))
      return
    }
    if (selectedIds.length >= MAX_SELECTED_ANIMATION_PREFERENCES) {
      warning(t('home.animationPreferenceLimitReached'))
      return
    }
    onChange([...selectedIds, id])
  }

  return (
    <div className={compact ? 'grid grid-cols-2 gap-1.5 xl:grid-cols-3' : 'flex flex-wrap gap-2'}>
      {OPTIONS.map((option) => {
        const selected = selectedSet.has(option.id)
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => togglePreference(option.id)}
            className={`rounded-lg text-xs transition-colors ${
              compact ? 'px-2 py-1.5 text-[11px] font-medium' : 'border px-3 py-1.5 font-semibold'
            } ${
              selected
                ? compact
                  ? 'bg-[#8fbc8f] text-[#25351f] shadow-[inset_0_0_0_1px_rgba(62,74,50,0.34),0_2px_6px_rgba(93,107,77,0.12)] hover:bg-[#7eab7e] hover:text-[#1f2c19] hover:shadow-[inset_0_0_0_1px_rgba(62,74,50,0.5),0_3px_8px_rgba(93,107,77,0.16)]'
                  : 'border-[#65794d] bg-[#d4e8c6] text-[#28331f] shadow-[0_2px_8px_rgba(93,107,77,0.12)] hover:border-[#4f623d] hover:bg-[#c3dcb2] hover:text-[#202b18]'
                : compact
                  ? 'bg-[#fffdf8]/72 text-[#5d6b4d] hover:bg-[#dfeccd] hover:text-[#33402a] hover:shadow-[inset_0_0_0_1px_rgba(93,107,77,0.18)]'
                  : 'border-[#d8ccb5]/75 bg-white/65 text-[#7f8a70] hover:border-[#a9c394] hover:bg-[#dfeccd] hover:text-[#33402a]'
            }`}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
