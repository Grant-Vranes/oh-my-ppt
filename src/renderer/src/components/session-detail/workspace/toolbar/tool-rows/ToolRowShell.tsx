import type { ReactNode } from 'react'

export function ToolRowShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-[40px] min-w-0 justify-center overflow-hidden rounded-[9px] bg-[#ea580c]/28 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_6px_14px_rgba(62,74,50,0.065)]">
      <div className="flex max-w-full items-center justify-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  )
}
