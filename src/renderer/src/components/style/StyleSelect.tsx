import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useThumbnailUpdates } from '../../hooks/useThumbnailUpdates'
import type { HtmlThumbnailTask } from '../../lib/ipc'
import { cn } from '@renderer/lib/utils'

export type StyleSelectOption = {
  id: string
  label: string
  description?: string
  styleCase?: string
  thumbnailPath?: string | null
}

export type StyleSelectProps = {
  value: string
  onChange: (id: string) => void
  options: StyleSelectOption[]
  placeholder?: string
  compact?: boolean
  disabled?: boolean
  className?: string
}

const thumbnailUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test'
    ? 'about:blank'
    : `local-asset://${encodeURIComponent(filePath)}`

export function StyleSelect({
  value,
  onChange,
  options,
  placeholder,
  compact = false,
  disabled,
  className
}: StyleSelectProps): React.JSX.Element {
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({})

  const applyThumbnail = useCallback((task: HtmlThumbnailTask): void => {
    const path = task.thumbnailPath
    if (!path) return
    setThumbnailOverrides((current) =>
      current[task.resourceId] === path ? current : { ...current, [task.resourceId]: path }
    )
  }, [])
  useThumbnailUpdates('style', applyThumbnail)

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-[#d8ccb5]/80 bg-[#fff9ef]/86 py-2.5 pl-3 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(77,63,46,0.08)] focus:outline-none focus:ring-2 focus:ring-[#8fbc8f] disabled:cursor-not-allowed disabled:opacity-50',
          '[&>span]:min-w-0 [&>span]:truncate [&>span]:whitespace-nowrap',
          compact ? 'h-9 px-2.5 text-xs' : 'pr-3',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cn(
            'relative z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-[#d8ccb5]/85 bg-[#fff9ef] text-foreground shadow-[0_12px_28px_rgba(88,72,54,0.18)]',
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1'
          )}
          position="popper"
        >
          <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport
            className={cn(
              'p-1',
              'w-full min-w-[var(--radix-select-trigger-width)]'
            )}
          >
            {options.map((option) => {
              const thumb = thumbnailOverrides[option.id] || option.thumbnailPath
              return (
                <SelectPrimitive.Item
                  key={option.id}
                  value={option.id}
                  className={cn(
                    'relative flex w-full cursor-default select-none items-stretch gap-2.5 rounded-md px-2.5 py-2 outline-none focus:bg-[#efe5d3]/70 data-[state=checked]:bg-[#dbe7ca] data-[state=checked]:text-[#2f3b28]',
                    compact && 'py-1.5'
                  )}
                >
                  {thumb ? (
                    <img
                      src={thumbnailUrl(thumb)}
                      alt=""
                      aria-hidden="true"
                      className="h-11 w-[78px] shrink-0 rounded-[3px] border border-black/5 object-cover"
                    />
                  ) : (
                    <span className="h-11 w-[78px] shrink-0 rounded-[3px] border border-[#e5ddc8] bg-[#f5f1e8]" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
                    <SelectPrimitive.ItemText asChild>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
                          {option.label}
                        </span>
                        {option.styleCase && (
                          <span className="shrink-0 truncate rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-px text-[10px] font-medium leading-tight text-[#7c6a4c]">
                            {option.styleCase}
                          </span>
                        )}
                      </span>
                    </SelectPrimitive.ItemText>
                    {option.description && (
                      <span
                        className={cn(
                          'truncate leading-tight text-muted-foreground',
                          compact ? 'text-[10px]' : 'text-[11px]'
                        )}
                      >
                        {option.description}
                      </span>
                    )}
                  </div>
                </SelectPrimitive.Item>
              )
            })}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
