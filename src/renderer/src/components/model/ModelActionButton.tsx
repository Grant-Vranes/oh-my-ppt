import { useEffect, useState, type ReactElement } from 'react'
import { Check, ChevronDown, Loader2, type LucideIcon } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/utils'
import type { ModelActionState } from '@renderer/hooks/useModelAction'
import { Button } from '../ui/Button'
import { ButtonGroup, ButtonGroupSeparator } from '../ui/ButtonGroup'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'

type ModelSplitButtonTone = 'primary' | 'subtle'
type ModelSplitButtonSize = 'sm' | 'md'

interface ModelSplitButtonProps {
  modelAction: ModelActionState
  label: string
  loadingLabel?: string
  loading?: boolean
  disabled?: boolean
  icon?: LucideIcon
  tone?: ModelSplitButtonTone
  size?: ModelSplitButtonSize
  ariaLabel?: string
  dropdownAlign?: 'start' | 'center' | 'end'
  className?: string
  mainClassName?: string
  triggerClassName?: string
  onRun: (modelConfigId: string) => void | Promise<void>
}

interface ModelSelectButtonProps {
  modelAction: ModelActionState
  disabled?: boolean
  className?: string
  dropdownAlign?: 'start' | 'center' | 'end'
}

const runModelAction = (
  modelConfigId: string | undefined,
  modelAction: ModelActionState,
  onRun: (modelConfigId: string) => void | Promise<void>
): void => {
  void modelAction
    .ensureModelActive(modelConfigId)
    .then((resolvedModelConfigId) => {
      if (!resolvedModelConfigId) return undefined
      return onRun(resolvedModelConfigId)
    })
    .catch((error) => {
      console.error('[ModelActionButton] model action failed', error)
    })
}

function ModelMenuItems({
  modelAction,
  selectedModelConfigId,
  onSelectModel
}: {
  modelAction: ModelActionState
  selectedModelConfigId: string
  onSelectModel: (modelConfigId: string) => void
}): ReactElement {
  return (
    <>
      {modelAction.modelConfigs.map((config) => (
        <DropdownMenuItem
          key={config.id}
          className="py-1.5 text-xs"
          onSelect={() => onSelectModel(config.id)}
        >
          <Check
            className={cn(
              'h-4 w-4 shrink-0',
              config.id === selectedModelConfigId ? 'opacity-100' : 'opacity-0'
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-[#33402a]">{config.name}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {config.provider} · {config.model}
            </span>
          </span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

export function ModelSplitButton({
  modelAction,
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  icon: Icon,
  tone = 'primary',
  size = 'sm',
  ariaLabel,
  dropdownAlign = 'end',
  className,
  mainClassName,
  triggerClassName,
  onRun
}: ModelSplitButtonProps): ReactElement {
  const t = useT()
  const hasMultiple = modelAction.hasMultipleModelConfigs
  const activating = Boolean(modelAction.activatingModelConfigId)
  const busy = loading || activating
  const disabledState = disabled || busy
  const isPrimary = tone === 'primary'
  const RunningIcon = busy ? Loader2 : Icon
  const [pendingModelConfigId, setPendingModelConfigId] = useState<string | null>(null)

  useEffect(() => {
    setPendingModelConfigId((current) => {
      if (!current || modelAction.modelConfigs.some((config) => config.id === current)) {
        return current
      }
      return null
    })
  }, [modelAction.modelConfigs])

  const effectiveModelConfigId =
    pendingModelConfigId ||
    modelAction.selectedModelConfigId ||
    modelAction.modelConfigs[0]?.id ||
    ''

  const runSelectedModelAction = (): void => {
    setPendingModelConfigId(null)
    runModelAction(effectiveModelConfigId || undefined, modelAction, onRun)
  }

  return (
    <ButtonGroup
      aria-label={ariaLabel || label}
      aria-disabled={disabledState}
      className={cn(
        isPrimary
          ? hasMultiple
            ? 'rounded-full border-0 bg-gradient-to-r from-[#6f8159] to-[#4f613f] shadow-[0_10px_22px_rgba(93,107,77,0.24)]'
            : 'rounded-full border-0 bg-transparent'
          : 'h-8 rounded-lg border-[#d8ccb5]/80 bg-[#fffdf8]/76 shadow-none',
        disabledState && 'cursor-not-allowed opacity-50 shadow-none saturate-75',
        className
      )}
    >
      <Button
        type="button"
        variant={isPrimary && !hasMultiple ? 'default' : 'ghost'}
        size={size}
        onClick={runSelectedModelAction}
        disabled={disabledState}
        className={cn(
          hasMultiple
            ? isPrimary
              ? 'rounded-none bg-transparent px-4 text-white shadow-none hover:bg-white/10 hover:text-white hover:shadow-none'
              : 'h-full rounded-none border-0 bg-transparent px-2.5 text-xs text-[#405333] shadow-none hover:bg-[#f3f7ed] hover:text-[#2f3b28] hover:shadow-none'
            : isPrimary
              ? 'rounded-full'
              : 'h-full rounded-lg border-0 bg-transparent px-2.5 text-xs text-[#405333] shadow-none hover:bg-[#f3f7ed] hover:text-[#2f3b28] hover:shadow-none',
          mainClassName
        )}
      >
        {RunningIcon ? (
          <RunningIcon
            className={cn(
              isPrimary ? 'mr-2 h-4 w-4' : 'mr-1.5 h-3.5 w-3.5',
              busy ? 'animate-spin' : ''
            )}
          />
        ) : null}
        {busy && loadingLabel ? loadingLabel : label}
      </Button>
      {hasMultiple && (
        <>
          <ButtonGroupSeparator
            className={isPrimary ? 'bg-white/20' : 'my-2 bg-[#d8ccb5]/80'}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size={size}
                disabled={disabledState}
                className={cn(
                  isPrimary
                    ? 'shrink-0 rounded-none border-0 bg-transparent px-2.5 text-white shadow-none hover:bg-white/10 hover:text-white hover:shadow-none'
                    : 'h-full w-8 shrink-0 rounded-none border-0 bg-transparent px-0 text-[#405333] shadow-none hover:bg-[#f3f7ed] hover:text-[#2f3b28] hover:shadow-none',
                  triggerClassName
                )}
                aria-label={t('settings.generationModel')}
              >
                <ChevronDown className={isPrimary ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={dropdownAlign} className="w-64">
              <ModelMenuItems
                modelAction={modelAction}
                selectedModelConfigId={effectiveModelConfigId}
                onSelectModel={setPendingModelConfigId}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </ButtonGroup>
  )
}

export function ModelSelectButton({
  modelAction,
  disabled = false,
  className,
  dropdownAlign = 'end'
}: ModelSelectButtonProps): ReactElement | null {
  const t = useT()
  if (!modelAction.hasMultipleModelConfigs) return null

  const disabledState = disabled || Boolean(modelAction.activatingModelConfigId)
  const label = modelAction.currentModelConfig?.name || t('settings.generationModel')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabledState}
          className={cn(
            'flex h-8 max-w-[10rem] items-center gap-1 rounded-full border border-[#d0c8b8] bg-[#ece6d8] px-2 text-[11px] text-[#5d6b4d] transition-colors hover:bg-[#d4e4c1] hover:text-[#3e4a32] disabled:opacity-40',
            className
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          {modelAction.activatingModelConfigId ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={dropdownAlign} className="w-64">
        <ModelMenuItems
          modelAction={modelAction}
          selectedModelConfigId={modelAction.selectedModelConfigId}
          onSelectModel={(modelConfigId) => {
            void modelAction.ensureModelActive(modelConfigId).catch((error) => {
              console.error('[ModelActionButton] model activation failed', error)
            })
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
