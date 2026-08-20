import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Type } from 'lucide-react'
import { RichTextBox } from '../../ui/RichTextBox'
import { ToggleGroup, ToggleGroupItem } from '../../ui/ToggleGroup'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip'
import { InspectorSection } from './InspectorSection'
import type { ElementEditorProps } from './types'
import { useT } from '@renderer/i18n'

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
  { value: 'justify', icon: AlignJustify }
] as const

function getPreviewScale(fontSize: string): number | undefined {
  const parsed = Number(String(fontSize || '').replace(/px$/i, ''))
  if (!Number.isFinite(parsed) || parsed <= 36) return undefined
  return 1 / 3
}

export function TextInspector({ draft, onDraftChange }: ElementEditorProps): React.JSX.Element {
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
    <>
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
            className="inline-flex overflow-hidden rounded-[9px] border border-[#e4e4e7]/72 bg-[#ffffff]/90 p-0.5 shadow-[inset_0_1px_2px_rgba(77,63,46,0.06)]"
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
                      className="rounded-[7px]"
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
    </>
  )
}
