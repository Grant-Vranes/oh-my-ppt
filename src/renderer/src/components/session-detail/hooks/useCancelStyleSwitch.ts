import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import {
  hydrateStyleSwitchJob,
  isStyleSwitchJobActive,
  useGenerateStore,
  useToastStore
} from '@renderer/store'

export function useCancelStyleSwitch(sessionId: string): () => Promise<void> {
  const t = useT()
  const toastError = useToastStore((state) => state.error)

  return async (): Promise<void> => {
    const job = useGenerateStore.getState().styleSwitchJobs[sessionId]
    if (!isStyleSwitchJobActive(job) || job?.status === 'cancelling') return

    useGenerateStore.getState().updateStyleSwitchJob(sessionId, { status: 'cancelling' })
    try {
      const result = await ipc.cancelStyleSwitch(sessionId)
      if (!result.success) {
        try {
          hydrateStyleSwitchJob(sessionId, await ipc.getStyleSwitchState(sessionId))
        } catch {
          useGenerateStore.getState().clearStyleSwitchJob(sessionId)
        }
      }
    } catch (error) {
      try {
        hydrateStyleSwitchJob(sessionId, await ipc.getStyleSwitchState(sessionId))
      } catch {
        useGenerateStore.getState().clearStyleSwitchJob(sessionId)
      }
      toastError(
        error instanceof Error ? error.message : t('sessionDetail.styleSwitchCancelFailed')
      )
    }
  }
}
