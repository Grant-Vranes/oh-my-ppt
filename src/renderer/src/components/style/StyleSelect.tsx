import * as React from 'react'
import { ChevronDown, Search, Star, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useThumbnailUpdates } from '../../hooks/useThumbnailUpdates'
import type { HtmlThumbnailTask } from '../../lib/ipc'
import { filterByStyleKeyword, parseStyleCases } from '../../lib/style-case'
import { useT } from '../../i18n'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'
import { cn } from '@renderer/lib/utils'

export type StyleSelectOption = {
  id: string
  label: string
  description?: string
  styleCase?: string
  thumbnailPath?: string | null
  favoriteAt?: number | null
}

export type StyleSelectProps = {
  value: string
  onChange: (id: string) => void
  options: StyleSelectOption[]
  placeholder?: string
  compact?: boolean
  disabled?: boolean
  className?: string
  dropdownAlign?: 'start' | 'center' | 'end'
  dropdownClassName?: string
}

const thumbnailUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test' ? 'about:blank' : `local-asset://${encodeURIComponent(filePath)}`

const compareFavoriteOptions = (
  a: StyleSelectOption,
  b: StyleSelectOption,
  order: Map<string, number>
): number => {
  const favoriteDiff = (b.favoriteAt || 0) - (a.favoriteAt || 0)
  if (favoriteDiff !== 0) return favoriteDiff
  return (order.get(a.id) || 0) - (order.get(b.id) || 0)
}

export function StyleSelect({
  value,
  onChange,
  options,
  placeholder,
  compact = false,
  disabled,
  className,
  dropdownAlign = 'start',
  dropdownClassName
}: StyleSelectProps): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({})

  const applyThumbnail = useCallback((task: HtmlThumbnailTask): void => {
    const path = task.thumbnailPath
    if (!path) return
    setThumbnailOverrides((current) =>
      current[task.resourceId] === path ? current : { ...current, [task.resourceId]: path }
    )
  }, [])
  useThumbnailUpdates('style', applyThumbnail)

  const selected = useMemo(() => options.find((option) => option.id === value), [options, value])
  const optionOrder = useMemo(
    () => new Map(options.map((option, index) => [option.id, index])),
    [options]
  )

  // 搜索框按名称/描述/用途过滤（用途也命中，所以不再需要单独的 tag 栏）。
  const filtered = useMemo(
    () =>
      [...filterByStyleKeyword(options, query)].sort((a, b) =>
        compareFavoriteOptions(a, b, optionOrder)
      ),
    [optionOrder, options, query]
  )

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) setQuery('')
  }, [])

  const handlePick = useCallback(
    (id: string) => {
      onChange(id)
      setOpen(false)
    },
    [onChange]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-lg border border-[#d8ccb5]/80 bg-[#fff9ef]/86 py-2.5 pl-3 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(77,63,46,0.08)] focus:outline-none focus:ring-2 focus:ring-[#8fbc8f] disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'h-9 px-2.5 text-xs' : 'pr-3',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected ? (
              <>
                <span className="truncate font-medium">{selected.label}</span>
                {selected.favoriteAt != null && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-[#d6a942] text-[#d6a942]" />
                )}
                {selected.styleCase && !compact && (
                  <span className="hidden shrink-0 truncate rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-px text-[10px] font-medium leading-tight text-[#7c6a4c] sm:inline-block">
                    {parseStyleCases(selected.styleCase)[0]}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={dropdownAlign}
        side="bottom"
        avoidCollisions={false}
        className={cn(
          'min-w-[var(--radix-popover-trigger-width)] w-[360px] overflow-hidden rounded-lg border border-[#d8ccb5]/85 bg-[#fff9ef] p-0 text-foreground shadow-[0_12px_28px_rgba(88,72,54,0.18)]',
          dropdownClassName
        )}
      >
        <div className="border-b border-[#e5ddc8]/80 p-2">
          <div className="flex items-center gap-1.5 rounded-md border border-[#d8ccb5]/80 bg-white/80 px-2 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#7c6a4c]/60" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('styles.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 text-[#7c6a4c]/60 transition-colors hover:text-[#7c6a4c]"
                aria-label={t('styles.clearSearch')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="max-h-[min(300px,40vh)] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('styles.noMatchingStyles')}
            </p>
          ) : (
            filtered.map((option) => {
              const thumb = thumbnailOverrides[option.id] || option.thumbnailPath
              const isSelected = option.id === value
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handlePick(option.id)}
                  className={cn(
                    'relative flex w-full items-stretch gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-[#efe5d3]/70 focus-visible:bg-[#efe5d3]/70',
                    isSelected && 'bg-[#dbe7ca] text-[#2f3b28]',
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
                        {option.label}
                      </span>
                      {option.styleCase && (
                        <span className="shrink-0 truncate rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-px text-[10px] font-medium leading-tight text-[#7c6a4c]">
                          {option.styleCase}
                        </span>
                      )}
                      {option.favoriteAt != null && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-[#d6a942] text-[#d6a942]" />
                      )}
                    </span>
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
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
