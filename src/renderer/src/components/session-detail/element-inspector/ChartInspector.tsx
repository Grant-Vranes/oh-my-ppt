import { useState } from 'react'
import { ChartColumn, Upload } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '@renderer/store/toastStore'
import { ColorPicker } from '../../ui/ColorPicker'
import { Input } from '../../ui/Input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip'
import { InspectorSection } from './InspectorSection'
import type { ElementEditDraft, ElementEditorProps } from './types'

const CHART_FIELDS = [
  'chartTitle',
  'chartDataJson',
  'chartPrimaryColor',
  'chartAccentColor',
  'chartTextColor',
  'chartSmooth',
  'chartHorizontal',
  'chartStacked',
  'chartAreaFill',
  'chartShowPoints',
  'chartShowLegend',
  'chartDoughnutCutout',
  'chartRadarFill',
  'chartConfigJson'
] as const

export function ChartInspector({ draft, onDraftChange }: ElementEditorProps): React.JSX.Element {
  const t = useT()
  const toastError = useToastStore((state) => state.error)
  const [isImportingData, setIsImportingData] = useState(false)
  const commit = (nextDraft = draft): void => {
    onDraftChange(nextDraft, { commit: true, fields: [...CHART_FIELDS] })
  }
  const handleImportData = async (): Promise<void> => {
    if (isImportingData) return
    setIsImportingData(true)
    try {
      const result = await ipc.chooseAndParseChartData()
      if (!result.canceled && result.dataJson) {
        commit({
          ...draft,
          chartDataJson: result.dataJson
        })
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('sessionDetail.chartImportDataFailed'))
    } finally {
      setIsImportingData(false)
    }
  }
  const renderToggleField = (
    label: string,
    field:
      | 'chartSmooth'
      | 'chartHorizontal'
      | 'chartStacked'
      | 'chartAreaFill'
      | 'chartShowPoints'
      | 'chartShowLegend'
      | 'chartRadarFill'
  ): React.JSX.Element => (
    <label className="flex items-center justify-between gap-3 rounded-[9px] border border-[#d9cfbd]/72 bg-[#fffaf1]/82 px-2.5 py-2">
      <span className="text-[11px] font-medium text-[#7a875f]">{label}</span>
      <input
        type="checkbox"
        checked={Boolean(draft[field])}
        onChange={(event) =>
          commit({
            ...draft,
            [field]: event.target.checked
          })
        }
        className="h-4 w-4 accent-[#7fa56f]"
      />
    </label>
  )
  const renderColorField = (
    label: string,
    field: 'chartPrimaryColor' | 'chartAccentColor' | 'chartTextColor'
  ): React.JSX.Element => {
    const fallback =
      field === 'chartPrimaryColor'
        ? '#5d6b4d'
        : field === 'chartAccentColor'
          ? '#8fbc8f'
          : '#2f3b28'
    const updateDraft = (value: string, shouldCommit = false): void => {
      const nextDraft: ElementEditDraft = { ...draft, [field]: value }
      if (shouldCommit) commit(nextDraft)
      else onDraftChange(nextDraft)
    }

    return (
      <label className="block space-y-1.5">
        <span className="text-[11px] font-medium text-[#7a875f]">{label}</span>
        <div className="flex items-center gap-2">
          <ColorPicker
            value={draft[field] || fallback}
            onChange={(value) => updateDraft(value)}
            onCommit={(value) => updateDraft(value, true)}
          />
          <Input
            value={draft[field]}
            onChange={(event) => updateDraft(event.target.value)}
            onBlur={(event) => updateDraft(event.target.value, true)}
            className="h-8 rounded-full border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </label>
    )
  }

  return (
    <InspectorSection
      title={t('sessionDetail.chartContent')}
      icon={<ChartColumn className="h-3.5 w-3.5 text-[#7a875f]" />}
    >
      <div className="space-y-2.5">
        <div className="block space-y-1.5">
          <span className="text-[11px] font-medium text-[#7a875f]">
            {t('sessionDetail.chartTitle')}
          </span>
          <Input
            value={draft.chartTitle}
            onChange={(event) => onDraftChange({ ...draft, chartTitle: event.target.value })}
            onBlur={(event) => commit({ ...draft, chartTitle: event.target.value })}
            className="h-8 rounded-full border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="block space-y-1.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-[#7a875f]">
              {t('sessionDetail.chartData')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    onClick={handleImportData}
                    disabled={isImportingData}
                    aria-label={t('sessionDetail.chartImportDataTooltip')}
                    title={t('sessionDetail.chartImportDataTooltip')}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#d9cfbd]/78 bg-[#fffdf8]/88 px-2.5 text-[11px] font-medium text-[#5d6b4d] transition-colors hover:border-[#9daf8a] hover:text-[#415235] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t('sessionDetail.chartImportData')}
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                {t('sessionDetail.chartImportDataTooltip')}
              </TooltipContent>
            </Tooltip>
          </span>
          <textarea
            value={draft.chartDataJson}
            onChange={(event) => onDraftChange({ ...draft, chartDataJson: event.target.value })}
            onBlur={(event) => commit({ ...draft, chartDataJson: event.target.value })}
            className="min-h-[138px] w-full resize-y rounded-[9px] border border-[#d9cfbd]/72 bg-[#fffaf1]/92 px-2.5 py-2 font-mono text-[11px] leading-5 text-[#34402c] outline-none transition-colors placeholder:text-[#b1a58f] focus:border-[#9daf8a]"
            placeholder={t('sessionDetail.chartDataPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {renderColorField(t('sessionDetail.chartPrimaryColor'), 'chartPrimaryColor')}
          {renderColorField(t('sessionDetail.chartAccentColor'), 'chartAccentColor')}
          {renderColorField(t('sessionDetail.chartTextColor'), 'chartTextColor')}
        </div>

        {draft.chartType === 'bar' && (
          <div className="space-y-2">
            {renderToggleField(t('sessionDetail.chartHorizontal'), 'chartHorizontal')}
            {renderToggleField(t('sessionDetail.chartStacked'), 'chartStacked')}
          </div>
        )}

        {draft.chartType === 'line' && (
          <div className="space-y-2">
            {renderToggleField(t('sessionDetail.chartSmoothLine'), 'chartSmooth')}
            {renderToggleField(t('sessionDetail.chartAreaFill'), 'chartAreaFill')}
            {renderToggleField(t('sessionDetail.chartShowPoints'), 'chartShowPoints')}
          </div>
        )}

        {(draft.chartType === 'pie' || draft.chartType === 'doughnut') && (
          <div className="space-y-2">
            {renderToggleField(t('sessionDetail.chartShowLegend'), 'chartShowLegend')}
            {draft.chartType === 'doughnut' && (
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-[#7a875f]">
                  {t('sessionDetail.chartDoughnutCutout')}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={85}
                  step={1}
                  value={draft.chartDoughnutCutout}
                  onChange={(event) =>
                    onDraftChange({ ...draft, chartDoughnutCutout: event.target.value })
                  }
                  onBlur={(event) =>
                    commit({ ...draft, chartDoughnutCutout: event.target.value })
                  }
                  className="h-8 rounded-full border border-[#ded2bd]/72 bg-[#fffdf8]/88 px-2.5 text-xs text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </label>
            )}
          </div>
        )}

        {draft.chartType === 'radar' && (
          <div className="space-y-2">
            {renderToggleField(t('sessionDetail.chartRadarFill'), 'chartRadarFill')}
            {renderToggleField(t('sessionDetail.chartShowPoints'), 'chartShowPoints')}
            {renderToggleField(t('sessionDetail.chartShowLegend'), 'chartShowLegend')}
          </div>
        )}
      </div>
    </InspectorSection>
  )
}
