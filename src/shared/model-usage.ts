export type ModelUsagePeriod = 'today' | '7d' | '30d' | 'all'

export interface ModelUsageTotals {
  callCount: number
  exactCallCount: number
  estimatedCallCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ModelUsageByModel extends ModelUsageTotals {
  provider: string
  model: string
}

export interface ModelUsageByDay extends ModelUsageTotals {
  date: string
}

export interface ModelUsageByHour extends ModelUsageTotals {
  hour: number
}

export interface ModelUsageStats {
  period: ModelUsagePeriod
  startedAt: number | null
  totals: ModelUsageTotals
  byModel: ModelUsageByModel[]
  byDay: ModelUsageByDay[]
  byHour: ModelUsageByHour[]
}
