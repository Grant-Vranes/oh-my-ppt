import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, MousePointer2, Sparkles } from 'lucide-react'
import { useParams } from 'react-router-dom'
import {
  DATA_ANIM_EDITABLE_TYPES,
  type DataAnimType,
  type ElementAnimationConfig,
  type ElementAnimationEditableFrom,
  type ElementAnimationEditableType,
  type ElementAnimationPatch
} from '@shared/element-animation.js'
import { useT, type I18nKey } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useSessionDetailRuntimeStore,
  useSessionDetailUiStore,
  useToastStore
} from '@renderer/store'
import { normalizePagesForSelection } from '../../../shared'
import { Popover, PopoverContent, PopoverTrigger } from '../../../../ui/Popover'

type AnimationCategory = 'entrance' | 'emphasis' | 'exit'

interface AnimationPreset {
  type: ElementAnimationEditableType
  category: AnimationCategory
  labelKey: I18nKey
}

const EXIT_TYPES = new Set<DataAnimType>([
  'exit-fade',
  'exit-scale',
  'exit-zoom',
  'exit-wipe',
  'exit-fly'
])
const DIRECTIONAL_TYPES = new Set<DataAnimType>(['fly-in', 'wipe', 'exit-wipe', 'exit-fly'])
const EMPHASIS_TYPES = new Set<DataAnimType>([
  'pulse-soft',
  'pulse',
  'pulse-strong',
  'grow-shrink-soft',
  'grow-shrink',
  'grow-shrink-strong'
])

const labelKeys: Record<ElementAnimationEditableType, I18nKey> = {
  fade: 'home.animationPreferenceOptions.fade',
  'fade-up': 'home.animationPreferenceOptions.fade-up',
  'fade-down': 'home.animationPreferenceOptions.fade-down',
  'fade-left': 'home.animationPreferenceOptions.fade-left',
  'fade-right': 'home.animationPreferenceOptions.fade-right',
  'scale-in': 'home.animationPreferenceOptions.scale-in',
  'slide-up': 'home.animationPreferenceOptions.slide-up',
  'slide-down': 'home.animationPreferenceOptions.slide-down',
  'slide-left': 'home.animationPreferenceOptions.slide-left',
  'slide-right': 'home.animationPreferenceOptions.slide-right',
  'fly-in': 'home.animationPreferenceOptions.fly-in',
  wipe: 'home.animationPreferenceOptions.wipe',
  'zoom-in': 'home.animationPreferenceOptions.zoom-in',
  'spin-in': 'home.animationPreferenceOptions.spin-in',
  'pulse-soft': 'home.animationPreferenceOptions.pulse-soft',
  pulse: 'home.animationPreferenceOptions.pulse',
  'pulse-strong': 'home.animationPreferenceOptions.pulse-strong',
  'grow-shrink-soft': 'home.animationPreferenceOptions.grow-shrink-soft',
  'grow-shrink': 'home.animationPreferenceOptions.grow-shrink',
  'grow-shrink-strong': 'home.animationPreferenceOptions.grow-shrink-strong',
  'exit-fade': 'sessionDetail.elementAnimationExitFade',
  'exit-scale': 'sessionDetail.elementAnimationExitScale',
  'exit-zoom': 'sessionDetail.elementAnimationExitZoom',
  'exit-wipe': 'sessionDetail.elementAnimationExitWipe',
  'exit-fly': 'sessionDetail.elementAnimationExitFly'
}

const presets: AnimationPreset[] = DATA_ANIM_EDITABLE_TYPES.map((type) => ({
  type,
  category: EXIT_TYPES.has(type) ? 'exit' : EMPHASIS_TYPES.has(type) ? 'emphasis' : 'entrance',
  labelKey: labelKeys[type]
}))

const durationOptions = [
  { value: 360, labelKey: 'sessionDetail.elementAnimationDurationFast' as I18nKey },
  { value: 600, labelKey: 'sessionDetail.elementAnimationDurationStandard' as I18nKey },
  { value: 900, labelKey: 'sessionDetail.elementAnimationDurationSlow' as I18nKey }
]

const directionOptions: Array<{
  value: ElementAnimationEditableFrom
  labelKey: I18nKey
}> = [
  { value: 'left', labelKey: 'sessionDetail.elementAnimationDirectionLeft' },
  { value: 'right', labelKey: 'sessionDetail.elementAnimationDirectionRight' },
  { value: 'top', labelKey: 'sessionDetail.elementAnimationDirectionTop' },
  { value: 'bottom', labelKey: 'sessionDetail.elementAnimationDirectionBottom' }
]

const elementAnimationPreviewStyles = `
.ppt-element-animation-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.ppt-element-animation-card {
  position: relative;
  height: 84px;
  overflow: hidden;
  border: 1px solid rgba(216,204,181,.82);
  border-radius: 8px;
  background: linear-gradient(180deg,rgba(255,253,248,.98),rgba(246,241,229,.96));
  transition: transform 160ms ease,border-color 160ms ease,box-shadow 160ms ease;
}
.ppt-element-animation-card:hover,.ppt-element-animation-card:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(111,129,89,.58);
  box-shadow: 0 10px 22px rgba(74,59,42,.11);
  outline: none;
}
.ppt-element-animation-card[data-selected="true"] {
  border-color: rgba(93,107,77,.78);
  box-shadow: inset 0 0 0 1px rgba(93,107,77,.2),0 10px 22px rgba(74,59,42,.09);
}
.ppt-element-animation-stage {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 8px;
  height: 43px;
  overflow: hidden;
  border-radius: 6px;
  background: linear-gradient(90deg,rgba(229,221,204,.72) 1px,transparent 1px) 0 0/12px 12px,#fbf8f1;
}
.ppt-element-animation-object {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 22px;
  margin: -11px 0 0 -24px;
  border-radius: 6px;
  background: linear-gradient(135deg,#5d6b4d,#8fbc8f 58%,#f1b56f);
  box-shadow: 0 5px 10px rgba(62,74,50,.17);
  animation-duration: 1.8s;
  animation-iteration-count: infinite;
  animation-timing-function: cubic-bezier(.2,.82,.22,1);
}
.ppt-element-animation-card-label {
  position: absolute;
  left: 8px;
  right: 28px;
  bottom: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #314028;
  font-size: 10px;
  font-weight: 700;
}
.ppt-element-animation-check {
  position: absolute;
  right: 7px;
  bottom: 6px;
  display: inline-flex;
  width: 17px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #5d6b4d;
  color: white;
}
[data-element-animation="fade"] .ppt-element-animation-object { animation-name: pptElementFade; }
[data-element-animation="fade-up"] .ppt-element-animation-object { animation-name: pptElementFadeUp; }
[data-element-animation="fade-down"] .ppt-element-animation-object { animation-name: pptElementFadeDown; }
[data-element-animation="fade-left"] .ppt-element-animation-object { animation-name: pptElementFadeLeft; }
[data-element-animation="fade-right"] .ppt-element-animation-object { animation-name: pptElementFadeRight; }
[data-element-animation="scale-in"] .ppt-element-animation-object { animation-name: pptElementScale; }
[data-element-animation="slide-up"] .ppt-element-animation-object { animation-name: pptElementSlideUp; }
[data-element-animation="slide-down"] .ppt-element-animation-object { animation-name: pptElementSlideDown; }
[data-element-animation="slide-left"] .ppt-element-animation-object { animation-name: pptElementSlideLeft; }
[data-element-animation="slide-right"] .ppt-element-animation-object { animation-name: pptElementSlideRight; }
[data-element-animation="fly-in"] .ppt-element-animation-object { animation-name: pptElementSlideRight; }
[data-element-animation="wipe"] .ppt-element-animation-object { animation-name: pptElementWipe; }
[data-element-animation="zoom-in"] .ppt-element-animation-object { animation-name: pptElementZoom; }
[data-element-animation="spin-in"] .ppt-element-animation-object { animation-name: pptElementSpin; }
[data-element-animation^="pulse"] .ppt-element-animation-object { animation-name: pptElementPulse; }
[data-element-animation^="grow-shrink"] .ppt-element-animation-object { animation-name: pptElementGrow; }
[data-element-animation="exit-fade"] .ppt-element-animation-object { animation-name: pptElementExitFade; }
[data-element-animation="exit-scale"] .ppt-element-animation-object { animation-name: pptElementExitScale; }
[data-element-animation="exit-zoom"] .ppt-element-animation-object { animation-name: pptElementExitZoom; }
[data-element-animation="exit-wipe"] .ppt-element-animation-object { animation-name: pptElementExitWipe; }
[data-element-animation="exit-fly"] .ppt-element-animation-object { animation-name: pptElementExitFly; }
@keyframes pptElementFade { 0%,18%{opacity:0} 58%,100%{opacity:1} }
@keyframes pptElementFadeUp { 0%,18%{opacity:0;transform:translateY(18px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementFadeDown { 0%,18%{opacity:0;transform:translateY(-18px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementFadeLeft { 0%,18%{opacity:0;transform:translateX(18px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementFadeRight { 0%,18%{opacity:0;transform:translateX(-18px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementScale { 0%,18%{opacity:0;transform:scale(.75)} 58%,100%{opacity:1;transform:scale(1)} }
@keyframes pptElementSlideUp { 0%,18%{opacity:0;transform:translateY(52px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementSlideDown { 0%,18%{opacity:0;transform:translateY(-52px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementSlideLeft { 0%,18%{opacity:0;transform:translateX(68px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementSlideRight { 0%,18%{opacity:0;transform:translateX(-68px)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementWipe { 0%,18%{clip-path:inset(0 100% 0 0);opacity:0} 58%,100%{clip-path:inset(0);opacity:1} }
@keyframes pptElementZoom { 0%,18%{opacity:0;transform:scale(.6)} 58%,100%{opacity:1;transform:scale(1)} }
@keyframes pptElementSpin { 0%,18%{opacity:0;transform:rotate(-20deg) scale(.78)} 58%,100%{opacity:1;transform:none} }
@keyframes pptElementPulse { 0%,18%,100%{transform:scale(1)} 48%{transform:scale(1.12)} }
@keyframes pptElementGrow { 0%,18%,100%{transform:scale(.92)} 48%{transform:scale(1.16)} }
@keyframes pptElementExitFade { 0%,18%{opacity:1} 58%,100%{opacity:0} }
@keyframes pptElementExitScale { 0%,18%{opacity:1;transform:scale(1)} 58%,100%{opacity:0;transform:scale(.82)} }
@keyframes pptElementExitZoom { 0%,18%{opacity:1;transform:scale(1)} 58%,100%{opacity:0;transform:scale(.55)} }
@keyframes pptElementExitWipe { 0%,18%{clip-path:inset(0);opacity:1} 58%,100%{clip-path:inset(0 0 0 100%);opacity:0} }
@keyframes pptElementExitFly { 0%,18%{opacity:1;transform:none} 58%,100%{opacity:0;transform:translateX(42px)} }
@media (prefers-reduced-motion: reduce) {
  .ppt-element-animation-object { animation: none !important; }
  .ppt-element-animation-card { transition: none !important; }
}
`

export function ElementAnimationPicker({ disabled = false }: { disabled?: boolean }): React.JSX.Element {
  const { id: sessionId } = useParams<{ id: string }>()
  const t = useT()
  const currentPages = useGenerateStore((state) => state.currentPages)
  const selectedPageId = useSessionDetailUiStore((state) => state.selectedPageId)
  const selectedSelector = useSessionDetailUiStore((state) => state.selectedSelector)
  const refreshCurrentPreview = useSessionDetailRuntimeStore(
    (state) => state.refreshCurrentPreview
  )
  const setInteractionMode = useSessionDetailUiStore((state) => state.setInteractionMode)
  const bumpThumbnailVersion = useSessionDetailUiStore((state) => state.bumpThumbnailVersion)
  const toastSuccess = useToastStore((state) => state.success)
  const toastError = useToastStore((state) => state.error)
  const [animation, setAnimation] = useState<ElementAnimationConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<AnimationCategory>('entrance')

  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId]
  )
  const htmlPath = selectedPage?.htmlPath
  const pageId = selectedPage?.pageId
  const targetKey = `${sessionId || ''}:${htmlPath || ''}:${pageId || ''}:${selectedSelector || ''}`
  const targetKeyRef = useRef(targetKey)
  targetKeyRef.current = targetKey

  useEffect(() => {
    setInteractionMode('animation-select')
  }, [pageId, setInteractionMode])

  useEffect(() => {
    if (!sessionId || !htmlPath || !pageId || !selectedSelector) {
      setAnimation(null)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setAnimation(null)
    setIsLoading(true)
    void ipc
      .getElementAnimation({ sessionId, htmlPath, pageId, selector: selectedSelector })
      .then((result) => {
        if (!cancelled) {
          setAnimation(result.animation)
          if (result.animation?.type && EXIT_TYPES.has(result.animation.type)) setCategory('exit')
          else if (result.animation?.type && EMPHASIS_TYPES.has(result.animation.type))
            setCategory('emphasis')
          else setCategory('entrance')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toastError(
            error instanceof Error ? error.message : t('sessionDetail.elementAnimationLoadFailed')
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [htmlPath, pageId, selectedSelector, sessionId, t, toastError])

  const savePatch = async (patch: ElementAnimationPatch): Promise<void> => {
    if (
      !sessionId ||
      !htmlPath ||
      !pageId ||
      !selectedSelector ||
      disabled ||
      isLoading ||
      isSaving
    )
      return
    const previous = animation
    const savingTargetKey = targetKey
    setIsSaving(true)
    try {
      const result = await ipc.setElementAnimation({
        sessionId,
        htmlPath,
        pageId,
        selector: selectedSelector,
        patch
      })
      if (targetKeyRef.current === savingTargetKey) {
        setAnimation(result.animation)
      }
      if (result.changed) {
        bumpThumbnailVersion(pageId)
        // Match index-transition: reload the page so the iframe reflects the saved
        // data-anim. The reload clears the canvas highlight, but selectedSelector
        // stays in the store and PreviewStage restores the animation selection.
        refreshCurrentPreview()
        toastSuccess(t('sessionDetail.elementAnimationSaved'))
      }
    } catch (error) {
      if (targetKeyRef.current === savingTargetKey) {
        setAnimation(previous)
      }
      toastError(
        error instanceof Error ? error.message : t('sessionDetail.elementAnimationSaveFailed')
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleTypeChange = (type: ElementAnimationEditableType | null): void => {
    if (type === null) {
      if (!animation) return
      setOpen(false)
      void savePatch({ type: null })
      return
    }
    if (animation?.type === type) return
    setOpen(false)
    const patch: ElementAnimationPatch = { type }
    if (!animation) {
      patch.trigger = EXIT_TYPES.has(type) ? 'click' : 'load'
      patch.durationMs = 600
    } else if (EXIT_TYPES.has(type) && animation.trigger !== 'click') {
      patch.trigger = 'click'
    }
    if (DIRECTIONAL_TYPES.has(type) && (!animation?.from || animation.from === 'center')) {
      patch.from = 'left'
    }
    void savePatch(patch)
  }

  const options = presets.filter((preset) => preset.category === category)
  const selectedType = animation?.type
  const triggerBucket = animation?.trigger === 'click' ? 'click' : 'load'
  const currentDuration = animation?.durationMs ?? 600
  const currentDirection =
    animation?.from && animation.from !== 'center' ? animation.from : null
  const customDuration = !durationOptions.some((option) => option.value === currentDuration)
  const currentLabel =
    selectedType === 'path'
      ? t('sessionDetail.elementAnimationAdvancedPath')
      : selectedType
        ? t(labelKeys[selectedType])
        : t('sessionDetail.indexTransitionNone')
  const disabledState = disabled || isLoading || isSaving || !sessionId || !htmlPath || !pageId
  const hasAnimation = animation !== null
  // Lock type switching while an animation exists: clear via "None" first.
  // Timing (duration / trigger / direction) stays editable.
  const typeLocked = disabledState || hasAnimation
  const triggerDisabled = disabledState || !selectedSelector
  const TriggerIcon = isLoading || isSaving ? Loader2 : Sparkles

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={triggerDisabled}
          className="inline-flex h-7 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border border-[#d8ccb5]/70 bg-[#fffdf8]/88 px-2.5 text-[10px] font-bold leading-none text-[#314028] shadow-[inset_0_1px_2px_rgba(74,59,42,0.04)] transition-colors hover:bg-[#f3f7ed] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <TriggerIcon
            className={`h-3 w-3 shrink-0 ${isLoading || isSaving ? 'animate-spin' : ''}`}
          />
          <span className="shrink-0">{t('sessionDetail.elementAnimationLabel')}</span>
          <span className="min-w-0 truncate text-[#6f8159]">
            {selectedSelector ? currentLabel : t('sessionDetail.elementAnimationSelectTarget')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[536px] max-w-[calc(100vw-2rem)] border-[#d8ccb5]/85 bg-[#fff9ef] p-2"
      >
        <style>{elementAnimationPreviewStyles}</style>
        {!selectedSelector ? (
          <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#d8ccb5] bg-[#fffdf8]/72 text-center">
            <MousePointer2 className="h-5 w-5 text-[#6f8159]" />
            <p className="text-xs font-bold text-[#314028]">
              {t('sessionDetail.elementAnimationSelectTargetTitle')}
            </p>
            <p className="text-[10px] text-[#7a806c]">
              {t('sessionDetail.elementAnimationSelectTargetHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-end gap-1 rounded-lg bg-[#f2ecdf]/72 px-2 py-1.5">
              {(['load', 'click'] as const).map((trigger) => (
                <button
                  key={trigger}
                  type="button"
                  disabled={disabledState || !animation}
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    triggerBucket === trigger
                      ? 'bg-[#5d6b4d] text-white'
                      : 'bg-[#fffdf8] text-[#617253] hover:bg-[#e5eedb]'
                  }`}
                  onClick={() => {
                    if (!animation || triggerBucket === trigger) return
                    void savePatch({ trigger })
                  }}
                >
                  {t(
                    trigger === 'load'
                      ? 'sessionDetail.elementAnimationTriggerAuto'
                      : 'sessionDetail.elementAnimationTriggerClick'
                  )}
                </button>
              ))}
            </div>

            {animation ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10px] font-bold text-[#6b765e]">
                  {t('sessionDetail.elementAnimationDuration')}
                </span>
                {durationOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabledState}
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      currentDuration === option.value
                        ? 'bg-[#d9e8cb] text-[#314028]'
                        : 'bg-[#fffdf8] text-[#69745e] hover:bg-[#edf4e6]'
                    }`}
                    onClick={() => {
                      if (currentDuration === option.value) return
                      void savePatch({ durationMs: option.value })
                    }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
                {customDuration ? (
                  <span className="rounded-full bg-[#d9e8cb] px-2 py-1 text-[10px] font-bold text-[#314028]">
                    {t('sessionDetail.elementAnimationDurationCustom', {
                      duration: currentDuration
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}

            {animation && DIRECTIONAL_TYPES.has(animation.type) ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10px] font-bold text-[#6b765e]">
                  {t('sessionDetail.elementAnimationDirection')}
                </span>
                {directionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabledState}
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      currentDirection === option.value
                        ? 'bg-[#d9e8cb] text-[#314028]'
                        : 'bg-[#fffdf8] text-[#69745e] hover:bg-[#edf4e6]'
                    }`}
                    onClick={() => {
                      if (currentDirection === option.value) return
                      void savePatch({ from: option.value })
                    }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            ) : null}

            {hasAnimation ? (
              <p className="rounded-md bg-[#f6ece2] px-2 py-1 text-[10px] font-bold leading-snug text-[#8b6658]">
                {t('sessionDetail.elementAnimationClearFirstHint')}
              </p>
            ) : null}

            <div className="flex items-center gap-1">
              {(['entrance', 'emphasis', 'exit'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={typeLocked}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    category === item
                      ? 'bg-[#5d6b4d] text-white'
                      : 'bg-[#efe8da] text-[#617253] hover:bg-[#e3ecd9]'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  onClick={() => setCategory(item)}
                >
                  {t(`sessionDetail.elementAnimationCategory${item[0].toUpperCase()}${item.slice(1)}` as I18nKey)}
                </button>
              ))}
              <button
                type="button"
                disabled={disabledState}
                data-selected={!animation}
                className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasAnimation
                    ? 'bg-[#8b6658] text-white hover:bg-[#7a554a]'
                    : 'bg-[#fffdf8] text-[#8b6658] hover:bg-[#f8e8df]'
                }`}
                onClick={() => handleTypeChange(null)}
              >
                {t('sessionDetail.indexTransitionNone')}
              </button>
            </div>

            <div className="ppt-element-animation-grid">
              {options.map((option) => {
                const selected = option.type === selectedType
                return (
                  <button
                    type="button"
                    key={option.type}
                    data-selected={selected}
                    data-element-animation={option.type}
                    disabled={typeLocked}
                    className="ppt-element-animation-card disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleTypeChange(option.type)}
                  >
                    <span className="ppt-element-animation-stage" aria-hidden="true">
                      <span className="ppt-element-animation-object" />
                    </span>
                    <span className="ppt-element-animation-card-label">
                      {t(option.labelKey)}
                    </span>
                    {selected ? (
                      <span className="ppt-element-animation-check" aria-hidden="true">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
