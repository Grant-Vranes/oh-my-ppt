import * as React from 'react'
import { useMemo } from 'react'
import { buildStyleCaseOptions, type StyleCaseItem } from '@renderer/lib/style-case'
import { cn } from '@renderer/lib/utils'

export type StyleCaseFilterProps = {
  /** 任意带 styleCase 字段的条目数组（风格列表 / 下拉选项均适用） */
  items: StyleCaseItem[]
  /** 可选候选集：用于禁用当前搜索/收藏条件下不会产生结果的 chip，不影响展示计数 */
  availableItems?: StyleCaseItem[]
  /** 当前选中的用途标签，空串表示"全部" */
  selected: string
  onSelect: (label: string) => void
  /** "全部" chip 的文案 */
  allLabel: string
  /** 可选标题（如"按适用场景筛选"），不传则不渲染 */
  title?: string
  /** 外层容器样式，由调用方决定是卡片还是窄条 */
  className?: string
}

const chipClassName = (active: boolean): string =>
  cn(
    'rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
    active
      ? 'border-[#97aa7c] bg-[#dbe7ca] text-[#2f3b28]'
      : 'border-[#d6c08d]/80 bg-white/70 text-[#7c6a4c] hover:bg-[#fff3d8]'
  )

/**
 * 用途（styleCase）筛选 chip 栏。风格库页与风格下拉共用，保证两处分类一致。
 * 规则与 styles.tsx 原实现一致：只展示命中数 > 1 的用途，并保证当前选中项始终可见。
 */
export function StyleCaseFilter({
  items,
  availableItems,
  selected,
  onSelect,
  allLabel,
  title,
  className
}: StyleCaseFilterProps): React.JSX.Element | null {
  const options = useMemo(() => buildStyleCaseOptions(items), [items])
  const availableLabels = useMemo(() => {
    if (!availableItems) return null
    return new Set(buildStyleCaseOptions(availableItems).map((option) => option.label))
  }, [availableItems])
  const visible = useMemo(() => {
    const popular = options.filter((option) => option.count > 1)
    const matched = options.find((option) => option.label === selected)
    return matched && !popular.some((option) => option.label === matched.label)
      ? [...popular, matched]
      : popular
  }, [options, selected])

  if (options.length === 0) return null

  return (
    <div className={className}>
      {title ? <p className="mb-2 text-xs font-medium text-[#3e4a32]">{title}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chipClassName(selected === '')} onClick={() => onSelect('')}>
          {`${allLabel} · ${items.length}`}
        </button>
        {visible.map((option) => (
          <button
            key={option.label}
            type="button"
            className={chipClassName(selected === option.label)}
            disabled={selected !== option.label && availableLabels ? !availableLabels.has(option.label) : false}
            onClick={() => onSelect(option.label)}
          >
            {`${option.label} · ${option.count}`}
          </button>
        ))}
      </div>
    </div>
  )
}
