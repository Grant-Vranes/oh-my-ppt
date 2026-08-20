import type { ReactNode } from 'react'
import { workbenchPanelClass } from './styles'

export function WorkbenchPanelShell({
  title,
  children
}: {
  title: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className={workbenchPanelClass}>
      <div className="relative mx-2 mt-2 overflow-hidden rounded-[0.85rem] border border-[#e4e4e7]/58 bg-[#ffffff]/68 px-2.5 py-2 shadow-[0_2px_8px_rgba(77,61,43,0.05)]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a875f]/90">
          {title}
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto px-2 py-2">{children}</div>
    </div>
  )
}
