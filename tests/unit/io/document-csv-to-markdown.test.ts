import { describe, expect, it } from 'vitest'

import { convertCsvTextToMarkdown } from '../../../src/main/ipc/io/document-csv-to-markdown'
import {
  deriveOutlinePageCandidates,
  scanDocumentOutline
} from '../../../src/main/ipc/io/document-outline-scan'

describe('document CSV to Markdown conversion', () => {
  it('converts grouped CSV files into heading-backed markdown tables', () => {
    const markdown = convertCsvTextToMarkdown(
      [
        '部门,季度,收入,负责人',
        '销售,Q1,120,张三',
        '销售,Q2,150,张三',
        '市场,Q1,80,李四',
        '市场,Q2,90,李四'
      ].join('\n'),
      { title: '季度收入' }
    )
    const scan = scanDocumentOutline(markdown)
    const candidates = deriveOutlinePageCandidates(scan)

    expect(markdown).toContain('# 季度收入')
    expect(markdown).toContain('- 字段：部门、季度、收入、负责人')
    expect(markdown).toContain('## 按部门拆分')
    expect(markdown).toContain('### 销售')
    expect(markdown).not.toContain('CSV Table')
    expect(markdown).not.toContain('Grouped by')
    expect(markdown).toContain('| 部门 | 季度 | 收入 | 负责人 |')
    expect(scan.headingCount).toBe(4)
    expect(candidates.map((candidate) => candidate.sourceHeading)).toEqual([
      '## 按部门拆分',
      '### 销售',
      '### 市场'
    ])
    expect(candidates[0].reason).toContain('销售、市场')
  })

  it('keeps ungrouped CSV files as a markdown table section', () => {
    const markdown = convertCsvTextToMarkdown(
      ['日期,指标,数值', '2026-01-01,DAU,100', '2026-01-02,DAU,105'].join('\n'),
      { title: 'daily metrics.csv' }
    )
    const scan = scanDocumentOutline(markdown)
    const candidates = deriveOutlinePageCandidates(scan)

    expect(markdown).toContain('# daily metrics.csv')
    expect(markdown).toContain('## 日期、指标、数值')
    expect(markdown).not.toContain('CSV Table')
    expect(markdown).toContain('| 日期 | 指标 | 数值 |')
    expect(candidates.map((candidate) => candidate.sourceHeading)).toEqual(['## 日期、指标、数值'])
  })

  it('infers grouping from repeated values instead of hardcoded header names', () => {
    const markdown = convertCsvTextToMarkdown(
      [
        '业务线,客户,金额',
        '新能源,A 公司,120',
        '新能源,B 公司,130',
        '售后,C 公司,80',
        '售后,D 公司,90'
      ].join('\n'),
      { title: '客户收入' }
    )
    const scan = scanDocumentOutline(markdown)
    const candidates = deriveOutlinePageCandidates(scan)

    expect(markdown).toContain('## 按业务线拆分')
    expect(markdown).toContain('### 新能源')
    expect(markdown).toContain('### 售后')
    expect(candidates.map((candidate) => candidate.sourceHeading)).toEqual([
      '## 按业务线拆分',
      '### 新能源',
      '### 售后'
    ])
    expect(candidates[0].reason).toContain('新能源、售后')
  })

  it('preserves quoted commas and markdown table pipes safely', () => {
    const markdown = convertCsvTextToMarkdown(
      ['部门,说明', '销售,"包含,逗号"', '市场,"A|B 测试"'].join('\n'),
      { title: 'quoted values' }
    )

    expect(markdown).toContain('| 销售 | 包含,逗号 |')
    expect(markdown).toContain('| 市场 | A\\|B 测试 |')
  })
})
