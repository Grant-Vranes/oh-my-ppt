import { MessageCircle, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useSessionDetailUiStore } from '@renderer/store'
import { useT } from '@renderer/i18n'
import { ChatPanel } from './ChatPanel'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { sessionDetailRightPanelContentClass } from '../workspace/right-panel/styles'

export function MessagePanel({ sessionId }: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const aiPanelMode = useSessionDetailUiStore((state) => state.aiPanelMode)
  const setAiPanelMode = useSessionDetailUiStore((state) => state.setAiPanelMode)

  return (
    <div className={sessionDetailRightPanelContentClass}>
      <div className="mx-2 mt-2 grid grid-cols-2 gap-1 rounded-[0.8rem] border border-[#e4e4e7]/58 bg-[#ffffff]/68 p-0.75 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={() => setAiPanelMode('chat')}
          className={cn(
            'inline-flex h-7 items-center justify-center gap-1.5 rounded-[0.8rem] text-[11px] font-medium transition-colors',
            aiPanelMode === 'chat'
              ? 'bg-[#fff7ed] text-[#18181b] shadow-sm'
              : 'text-[#52525b] hover:bg-[#f4ebdc]'
          )}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t('sessionDetail.chatMode')}
        </button>
        <button
          type="button"
          onClick={() => setAiPanelMode('image')}
          className={cn(
            'inline-flex h-7 items-center justify-center gap-1.5 rounded-[0.8rem] text-[11px] font-medium transition-colors',
            aiPanelMode === 'image'
              ? 'bg-[#fff7ed] text-[#18181b] shadow-sm'
              : 'text-[#52525b] hover:bg-[#f4ebdc]'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t('sessionDetail.imageMode')}
        </button>
      </div>

      {aiPanelMode === 'image' ? (
        <ImageGenerationPanel sessionId={sessionId} />
      ) : (
        <ChatPanel sessionId={sessionId} />
      )}
    </div>
  )
}
