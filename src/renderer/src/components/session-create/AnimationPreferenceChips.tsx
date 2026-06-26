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
}

export function AnimationPreferenceChips({
  selectedIds,
  onChange
}: AnimationPreferenceChipsProps): JSX.Element {
  const { error } = useToastStore()
  const t = useT()
  const selectedSet = new Set(selectedIds)

  const togglePreference = (id: AnimationPreferenceId): void => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id))
      return
    }
    if (selectedIds.length >= MAX_SELECTED_ANIMATION_PREFERENCES) {
      error(t('home.animationPreferenceLimitReached'))
      return
    }
    onChange([...selectedIds, id])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const selected = selectedSet.has(option.id)
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => togglePreference(option.id)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected
                ? 'border-[#738a57]/80 bg-[#eef6e8] text-[#33402a] shadow-[0_2px_8px_rgba(93,107,77,0.08)]'
                : 'border-[#d8ccb5]/75 bg-white/65 text-[#7f8a70] hover:border-[#b8d0a3] hover:bg-[#f7fbf2] hover:text-[#33402a]'
            }`}
          >
            {t(option.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
