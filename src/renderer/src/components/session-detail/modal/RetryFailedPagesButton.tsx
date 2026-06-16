import { Loader2, RotateCcw } from 'lucide-react'

export function RetryFailedPagesButton({
  loading,
  label,
  loadingLabel,
  onClick
}: {
  loading: boolean
  label: string
  loadingLabel: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#5d6b4d] px-4 text-sm font-medium text-white transition-colors hover:bg-[#49563d] disabled:cursor-wait disabled:opacity-75"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="mr-2 h-4 w-4" />
      )}
      {loading ? loadingLabel : label}
    </button>
  )
}
