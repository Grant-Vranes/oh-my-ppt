import type { ReactNode } from 'react'

export function InspectorSection({
  title,
  icon,
  children
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-[1.15rem] border border-[#ded2bd]/72 bg-[#ffffff]/82 px-3 py-2.5 shadow-[0_6px_14px_rgba(74,59,42,0.08)]">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium text-[#7a875f]">{title}</span>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}
