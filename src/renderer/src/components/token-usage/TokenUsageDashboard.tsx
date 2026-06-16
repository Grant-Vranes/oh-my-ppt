import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  RefreshCw
} from 'lucide-react'
import type { ModelUsagePeriod, ModelUsageStats } from '@shared/model-usage'
import { ipc } from '../../lib/ipc'
import { useLang } from '../../i18n'
import { Button } from '../ui/Button'
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs'

const CHART_COLORS = ['#5D6B4D', '#8FBC8F', '#C8B89E', '#D4E4C1', '#3E4A32', '#a8b89a']

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export function TokenUsageDashboard(): React.JSX.Element {
  const { t } = useLang()
  const [period, setPeriod] = useState<ModelUsagePeriod>('30d')
  const [stats, setStats] = useState<ModelUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const trendCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const modelCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const hourlyCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [todayStats, setTodayStats] = useState<ModelUsageStats | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void ipc
      .getModelUsage(period)
      .then((result) => {
        if (active) setStats(result)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : t('settings.usageLoadFailed'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [period, refreshKey, t])

  useEffect(() => {
    let active = true
    void ipc
      .getModelUsage('today')
      .then((result) => {
        if (active) setTodayStats(result)
      })
      .catch(() => {
        /* hourly panel is supplementary, ignore errors */
      })
    return () => {
      active = false
    }
  }, [refreshKey])

  const modelRows = useMemo(() => stats?.byModel.slice(0, 8) || [], [stats])
  const modelMax = useMemo(
    () => modelRows.reduce((max, item) => Math.max(max, item.totalTokens), 0) || 1,
    [modelRows]
  )

  const totalTokens = stats?.totals.totalTokens || 0
  const inputTokens = stats?.totals.inputTokens || 0
  const outputTokens = stats?.totals.outputTokens || 0
  const callCount = stats?.totals.callCount || 0

  const statCards = [
    {
      label: t('settings.usageTotalTokens'),
      value: totalTokens,
      icon: Coins,
      bg: 'bg-[#d4e4c1]',
      border: 'border-[#c8d6ba]',
      iconBg: 'bg-[#5d6b4d]',
      blob: 'bg-[#8fbc8f]/30'
    },
    {
      label: t('settings.usageInputTokens'),
      value: inputTokens,
      icon: ArrowDownToLine,
      bg: 'bg-[#e8e0d0]',
      border: 'border-[#d9cfbd]',
      iconBg: 'bg-[#6f8a5b]',
      blob: 'bg-[#d4e4c1]/55'
    },
    {
      label: t('settings.usageOutputTokens'),
      value: outputTokens,
      icon: ArrowUpFromLine,
      bg: 'bg-[#f5f1e8]',
      border: 'border-[#e0d8c8]',
      iconBg: 'bg-[#b18f5e]',
      blob: 'bg-[#c8b89e]/30'
    },
    {
      label: t('settings.usageCalls'),
      value: callCount,
      icon: Activity,
      bg: 'bg-[#d4e4c1]',
      border: 'border-[#a9bd97]',
      iconBg: 'bg-[#3e4a32]',
      blob: 'bg-[#5d6b4d]/22'
    }
  ]

  useEffect(() => {
    const canvas = trendCanvasRef.current
    if (!canvas || !stats) return
    const totals = stats.byDay.map((item) => item.totalTokens)
    const chart = new Chart(canvas, {
      data: {
        labels: stats.byDay.map((item) => item.date.slice(5)),
        datasets: [
          {
            type: 'bar',
            label: t('settings.usageInputTokens'),
            data: stats.byDay.map((item) => item.inputTokens),
            backgroundColor: '#9bb48b',
            borderRadius: { topLeft: 5, topRight: 5, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false,
            stack: 'tokens',
            maxBarThickness: 26,
            yAxisID: 'y',
            order: 2
          },
          {
            type: 'bar',
            label: t('settings.usageOutputTokens'),
            data: stats.byDay.map((item) => item.outputTokens),
            backgroundColor: '#d9a26f',
            borderRadius: { topLeft: 5, topRight: 5, bottomLeft: 0, bottomRight: 0 },
            borderSkipped: false,
            stack: 'tokens',
            maxBarThickness: 26,
            yAxisID: 'y',
            order: 3
          },
          {
            type: 'line',
            label: t('settings.usageTotalTokens'),
            data: totals,
            borderColor: '#3E4A32',
            backgroundColor: '#3E4A32',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#3E4A32',
            pointHoverBorderColor: '#F5F1E8',
            pointHoverBorderWidth: 2,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              padding: 10,
              color: '#5D6B4D',
              font: { size: 10 }
            }
          },
          tooltip: {
            backgroundColor: '#3E4A32',
            padding: 10,
            cornerRadius: 10,
            titleColor: '#F5F1E8',
            bodyColor: '#D4E4C1',
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            displayColors: true,
            boxPadding: 4,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${Number(context.raw).toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#8A9A7B', font: { size: 11 } },
            border: { display: false }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              callback: (value) => formatTokens(Number(value)),
              color: '#8A9A7B',
              font: { size: 11 }
            },
            grid: { color: 'rgba(93, 107, 77, 0.08)' },
            border: { display: false }
          },
          y1: {
            stacked: false,
            beginAtZero: true,
            display: false,
            max: Math.max(...totals, 1) * 1.15
          }
        }
      }
    })
    return () => chart.destroy()
  }, [stats, t])

  useEffect(() => {
    const canvas = modelCanvasRef.current
    if (!canvas || modelRows.length === 0) return
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: modelRows.map((item) => item.model),
        datasets: [
          {
            data: modelRows.map((item) => item.totalTokens),
            backgroundColor: modelRows.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
            borderColor: '#F5F1E8',
            borderWidth: 3,
            hoverOffset: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#3E4A32',
            padding: 10,
            cornerRadius: 10,
            titleColor: '#F5F1E8',
            bodyColor: '#D4E4C1',
            callbacks: {
              label: (context) => `${context.label}: ${formatTokens(Number(context.raw))}`
            }
          }
        }
      }
    })
    return () => chart.destroy()
  }, [modelRows])

  useEffect(() => {
    const canvas = hourlyCanvasRef.current
    const hours = todayStats?.byHour
    if (!canvas || !Array.isArray(hours) || hours.length === 0) return
    const ctx = canvas.getContext('2d')
    const makeFill = (color: string) => {
      if (!ctx) return `${color}22`
      const gradient = ctx.createLinearGradient(0, 0, 0, 200)
      gradient.addColorStop(0, `${color}40`)
      gradient.addColorStop(1, `${color}00`)
      return gradient
    }
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: hours.map((item) => `${String(item.hour).padStart(2, '0')}:00`),
        datasets: [
          {
            label: t('settings.usageInputTokens'),
            data: hours.map((item) => item.inputTokens),
            borderColor: '#5D6B4D',
            backgroundColor: makeFill('#5D6B4D'),
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#5D6B4D',
            pointHoverBorderColor: '#F5F1E8',
            pointHoverBorderWidth: 2
          },
          {
            label: t('settings.usageOutputTokens'),
            data: hours.map((item) => item.outputTokens),
            borderColor: '#8FBC8F',
            backgroundColor: makeFill('#8FBC8F'),
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#8FBC8F',
            pointHoverBorderColor: '#F5F1E8',
            pointHoverBorderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              padding: 10,
              color: '#5D6B4D',
              font: { size: 10 }
            }
          },
          tooltip: {
            backgroundColor: '#3E4A32',
            padding: 10,
            cornerRadius: 10,
            titleColor: '#F5F1E8',
            bodyColor: '#D4E4C1',
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            displayColors: true,
            boxPadding: 4,
            callbacks: {
              label: (context) => `${context.dataset.label}: ${Number(context.raw).toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#8A9A7B',
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8
            },
            border: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatTokens(Number(value)),
              color: '#8A9A7B',
              font: { size: 10 }
            },
            grid: { color: 'rgba(93, 107, 77, 0.08)' },
            border: { display: false }
          }
        }
      }
    })
    return () => chart.destroy()
  }, [todayStats, t])

  const periods: Array<{ value: ModelUsagePeriod; label: string }> = [
    { value: '7d', label: t('settings.usagePeriod7d') },
    { value: '30d', label: t('settings.usagePeriod30d') },
    { value: 'all', label: t('settings.usagePeriodAll') }
  ]

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-[#5D6B4D]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t('settings.usageLoading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={period}
          onValueChange={(value) => setPeriod(value as ModelUsagePeriod)}
        >
          <TabsList className="min-h-9 rounded-full bg-[#F5F1E8] px-1">
            {periods.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-7 rounded-full px-3.5 text-xs data-[state=active]:bg-[#5D6B4D] data-[state=active]:text-[#F5F1E8] data-[state=active]:shadow-none"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => setRefreshKey((value) => value + 1)}
          className="h-8 text-[#5D6B4D] hover:text-[#3E4A32]"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('settings.usageRefresh')}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#C8B89E] bg-[#E8E0D0] p-4 text-sm text-[#3E4A32]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`group relative overflow-hidden rounded-[1.5rem] border ${card.border} ${card.bg} p-5 shadow-[0_14px_34px_rgba(86,73,54,0.10)] transition-transform duration-200 hover:-translate-y-0.5`}
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] ${card.blob} transition-transform duration-300 group-hover:scale-110`}
              />
              <div className="relative flex items-start justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-[10%_90%_16%_84%/78%_22%_78%_22%] ${card.iconBg} text-white shadow-[0_8px_18px_rgba(86,73,54,0.16)]`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="relative mt-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#5d6b4d]">
                  {card.label}
                </p>
                <p className="organic-serif mt-1.5 text-[24px] font-semibold leading-none text-[#3e4a32]">
                  {card.value.toLocaleString()}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <div className="rounded-2xl bg-white p-5">
          <h3 className="organic-serif mb-3 text-base font-semibold text-[#3E4A32]">
            {t('settings.usageTrend')}
          </h3>
          <div className="h-[240px]">
            {stats?.byDay.length ? (
              <canvas ref={trendCanvasRef} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#8A9A7B]">
                {t('settings.usageEmpty')}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5">
          <h3 className="organic-serif mb-3 text-base font-semibold text-[#3E4A32]">
            {t('settings.usageByModel')}
          </h3>
          {modelRows.length ? (
            <>
              <div className="mx-auto h-[140px] max-w-[180px]">
                <canvas ref={modelCanvasRef} />
              </div>
              <div className="mt-3 space-y-2">
                {modelRows.map((item, index) => {
                  const color = CHART_COLORS[index % CHART_COLORS.length]
                  const barPct = (item.totalTokens / modelMax) * 100
                  return (
                    <div key={`${item.provider}:${item.model}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-[#3E4A32]"
                          title={`${item.provider} / ${item.model}`}
                        >
                          {item.model}
                        </span>
                        <span className="tabular-nums text-[#5D6B4D]">
                          {formatTokens(item.totalTokens)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#F5F1E8]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-[#8A9A7B]">
              {t('settings.usageEmpty')}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5">
        <h3 className="organic-serif mb-3 text-base font-semibold text-[#3E4A32]">
          {t('settings.usageTodayHourly')}
        </h3>
        <div className="h-[200px]">
          {todayStats?.byHour?.some((item) => item.callCount > 0) ? (
            <canvas ref={hourlyCanvasRef} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#8A9A7B]">
              {t('settings.usageEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
