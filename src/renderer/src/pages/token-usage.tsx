import { TokenUsageDashboard } from '../components/token-usage/TokenUsageDashboard'
import { useLang } from '../i18n'

export function TokenUsagePage(): React.JSX.Element {
  const { t } = useLang()

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {t('settings.usagePageEyebrow')}
        </p>
        <h1 className="organic-serif mt-2 text-[32px] font-semibold leading-none text-[#3e4a32]">
          {t('settings.usagePageTitle')}
        </h1>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t('settings.usagePageDescription')}
        </p>
      </div>

      <TokenUsageDashboard />
    </div>
  )
}
