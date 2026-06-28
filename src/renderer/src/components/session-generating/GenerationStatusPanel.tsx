import type React from 'react'
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { ModelSplitButton } from '@renderer/components/model/ModelActionButton'
import { cn } from '@renderer/lib/utils'
import type { ModelActionState } from '@renderer/hooks/useModelAction'
import type { GenerationRunStatus, GenerationStageKey } from './types'

export function GenerationStatusPanel({
  status,
  progress,
  stages,
  stageLabels,
  currentStage,
  completedPageCount,
  totalPages,
  error,
  interruptedLabel,
  enterEditorLabel,
  continueRemainingLabel,
  regenerateLabel,
  cancelLabel,
  isCancelling,
  hasGeneratedPages,
  canEnterEditor,
  showEditorShortcut,
  modelAction,
  onEnterEditor,
  onContinueRemaining,
  onRegenerate,
  onCancel
}: {
  status: GenerationRunStatus
  progress: number
  stages: readonly GenerationStageKey[]
  stageLabels: Record<GenerationStageKey, string>
  currentStage: string
  completedPageCount: number
  totalPages: number
  error: string | null
  interruptedLabel: string
  enterEditorLabel: string
  continueRemainingLabel: string
  regenerateLabel: string
  cancelLabel: string
  isCancelling?: boolean
  hasGeneratedPages: boolean
  canEnterEditor: boolean
  showEditorShortcut: boolean
  modelAction: ModelActionState
  onEnterEditor: () => void
  onContinueRemaining: (modelConfigId: string) => void
  onRegenerate: (modelConfigId: string) => void
  onCancel: () => void
}): React.JSX.Element {
  if (status === 'failed' || status === 'cancelled') {
    return (
      <div className="mb-4 shrink-0 rounded-lg border border-[#d7b5ae]/80 bg-[#fbf1ee]/86 px-4 py-2.5 text-[#93564f] shadow-[0_8px_20px_rgba(120,73,65,0.08)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span className="shrink-0 rounded-md border border-[#d7b5ae]/70 bg-[#fff8f4]/75 px-2 py-1 text-xs font-semibold text-[#8e5a53]">
              {interruptedLabel}
            </span>
            <span className="min-w-0 truncate text-xs text-[#9b6b63]">{error}</span>
            {canEnterEditor && (
              <button
                type="button"
                onClick={onEnterEditor}
                className="shrink-0 text-xs font-medium text-[#6f8159] underline-offset-2 hover:underline"
              >
                {enterEditorLabel}
              </button>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            <ModelSplitButton
              modelAction={modelAction}
              label={hasGeneratedPages ? continueRemainingLabel : regenerateLabel}
              tone="subtle"
              size="sm"
              onRun={(modelConfigId) => {
                if (hasGeneratedPages) {
                  onContinueRemaining(modelConfigId)
                } else {
                  onRegenerate(modelConfigId)
                }
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  const activeStageIndex = stages.indexOf(currentStage as GenerationStageKey)

  return (
    <div className="mb-4 shrink-0 rounded-lg border border-[#d8ccb5] bg-[#fff9ef] px-4 py-2 text-[#435138] shadow-[0_12px_28px_rgba(78,91,63,0.13)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#617350]">
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-[#7d8b63]">
              {stages.map((stage, index) => {
                const isActive = index === activeStageIndex
                const isDone = index < activeStageIndex || status === 'completed'
                return (
                  <span
                    key={stage}
                    className={cn(
                      'inline-flex items-center gap-1 leading-4',
                      isDone && 'text-[#5f8a43]',
                      isActive && 'font-semibold text-[#365528]',
                      !isDone && !isActive && 'text-[#a09882]'
                    )}
                  >
                    {isDone && <CheckCircle2 className="h-3 w-3" />}
                    {isActive && (status === 'queued' || status === 'running') && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#4f7b3f]" />
                    )}
                    {stage === 'rendering' && completedPageCount > 0
                      ? `${stageLabels[stage]} ${completedPageCount}/${totalPages}`
                      : stageLabels[stage]}
                  </span>
                )
              })}
            </span>
            <span className="ml-auto inline-flex shrink-0 items-center gap-2 font-medium">
              <span className="font-semibold">{progress}%</span>
              {showEditorShortcut && (
                <Button
                  size="sm"
                  className="h-6 rounded-md px-2 text-[10px] shadow-none"
                  onClick={onEnterEditor}
                >
                  {enterEditorLabel}
                </Button>
              )}
              {(status === 'queued' || status === 'running') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 rounded-md px-2 text-[10px] shadow-none"
                  disabled={isCancelling}
                  aria-busy={isCancelling || undefined}
                  onClick={onCancel}
                >
                  {isCancelling && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  {cancelLabel}
                </Button>
              )}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full border border-[#d8ccb5]/80 bg-[#fffaf1] shadow-[inset_0_1px_2px_rgba(74,58,40,0.12)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#9ecf8a_0%,#6f9f59_52%,#4f7b3f_100%)] bg-[length:200%_100%] transition-[width] duration-500"
              style={{
                width: `${Math.max(2, progress)}%`,
                animation: 'gen-shimmer-move 2.8s linear infinite'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
