export interface CsvMarkdownConversionOptions {
  title: string
}

const normalizeNewlines = (value: string): string =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const cleanCell = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const escapeMarkdownCell = (value: string): string =>
  cleanCell(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|') || ' '

const escapeHeadingText = (value: string): string =>
  cleanCell(value).replace(/#+/g, '').trim() || 'Untitled'

const hasCjkText = (value: string): boolean => /[\u3400-\u9fff]/.test(value)

const usesChineseLabels = (title: string, headers: string[]): boolean =>
  hasCjkText(`${title}\n${headers.join('\n')}`)

const fieldListLabel = (useChinese: boolean): string =>
  useChinese ? '字段' : 'Fields'

const rowCountLabel = (useChinese: boolean): string =>
  useChinese ? '记录数' : 'Rows'

const ungroupedValue = (useChinese: boolean): string =>
  useChinese ? '未分组' : 'Ungrouped'

const dataSectionTitle = (headers: string[], useChinese: boolean): string => {
  const shortHeaders = headers.filter((header) => header.length > 0 && header.length <= 18)
  if (shortHeaders.length >= 2 && shortHeaders.length <= 4 && shortHeaders.length === headers.length) {
    return shortHeaders.join(useChinese ? '、' : ' / ')
  }
  return useChinese ? '数据明细' : 'Data Details'
}

const groupedSectionTitle = (groupHeader: string, useChinese: boolean): string =>
  useChinese ? `按${escapeHeadingText(groupHeader)}拆分` : `By ${escapeHeadingText(groupHeader)}`

const parseCsvRows = (source: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const text = normalizeNewlines(source)

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' && !inQuotes) {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)

  return rows
    .map((cells) => cells.map(cleanCell))
    .filter((cells) => cells.some((value) => value.length > 0))
}

const normalizeRows = (rows: string[][]): { headers: string[]; dataRows: string[][] } => {
  const [rawHeaders = [], ...rawDataRows] = rows
  const columnCount = Math.max(rawHeaders.length, ...rawDataRows.map((row) => row.length), 1)
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const header = cleanCell(rawHeaders[index] || '')
    return header || `Column ${index + 1}`
  })
  const dataRows = rawDataRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => cleanCell(row[index] || ''))
  )
  return { headers, dataRows }
}

const NUMERIC_VALUE_PATTERN = /^[-+]?[$￥€]?\s*\d+(?:,\d{3})*(?:\.\d+)?%?$/
const DATE_LIKE_VALUE_PATTERN = /^\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/

const mostlyMatches = (values: string[], pattern: RegExp): boolean => {
  if (values.length === 0) return false
  return values.filter((value) => pattern.test(value)).length / values.length >= 0.75
}

const selectGroupColumnIndex = (headers: string[], dataRows: string[][]): number | null => {
  if (dataRows.length < 4) return null
  let bestCandidate: { index: number; score: number } | null = null

  for (const [index] of headers.entries()) {
    const values = dataRows.map((row) => row[index]).filter(Boolean)
    const uniqueValues = new Set(values)
    if (uniqueValues.size < 2) continue
    if (uniqueValues.size > 50) continue
    if (uniqueValues.size >= values.length * 0.75) continue
    if (mostlyMatches(values, NUMERIC_VALUE_PATTERN)) continue
    if (mostlyMatches(values, DATE_LIKE_VALUE_PATTERN)) continue

    const repeatRatio = 1 - uniqueValues.size / values.length
    const coverageRatio = values.length / dataRows.length
    const earlyColumnBonus = Math.max(0, (headers.length - index) / headers.length) * 0.05
    const score = repeatRatio + coverageRatio * 0.25 + earlyColumnBonus
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { index, score }
    }
  }

  return bestCandidate?.index ?? null
}

const formatMarkdownTable = (headers: string[], rows: string[][]): string => {
  const headerLine = `| ${headers.map(escapeMarkdownCell).join(' | ')} |`
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`
  const rowLines = rows.map((row) => `| ${row.map(escapeMarkdownCell).join(' | ')} |`)
  return [headerLine, dividerLine, ...rowLines].join('\n')
}

export const convertCsvTextToMarkdown = (
  source: string,
  options: CsvMarkdownConversionOptions
): string => {
  const rows = parseCsvRows(source)
  const { headers, dataRows } = normalizeRows(rows)
  const useChinese = usesChineseLabels(options.title, headers)
  if (dataRows.length === 0) {
    return [
      `# ${escapeHeadingText(options.title)}`,
      '',
      `## ${dataSectionTitle(headers, useChinese)}`,
      '',
      formatMarkdownTable(headers, [])
    ].join('\n')
  }

  const groupColumnIndex = selectGroupColumnIndex(headers, dataRows)
  const lines = [
    `# ${escapeHeadingText(options.title)}`,
    '',
    `- ${fieldListLabel(useChinese)}：${headers.join(useChinese ? '、' : ', ')}`,
    `- ${rowCountLabel(useChinese)}：${dataRows.length}`
  ]

  if (groupColumnIndex === null) {
    lines.push('', `## ${dataSectionTitle(headers, useChinese)}`, '', formatMarkdownTable(headers, dataRows))
    return lines.join('\n')
  }

  const groupHeader = headers[groupColumnIndex]
  const groupedRows = new Map<string, string[][]>()
  dataRows.forEach((row) => {
    const groupValue = row[groupColumnIndex] || ungroupedValue(useChinese)
    const currentRows = groupedRows.get(groupValue) || []
    currentRows.push(row)
    groupedRows.set(groupValue, currentRows)
  })

  lines.push('', `## ${groupedSectionTitle(groupHeader, useChinese)}`)
  groupedRows.forEach((groupRows, groupValue) => {
    lines.push('', `### ${escapeHeadingText(groupValue)}`, '')
    lines.push(formatMarkdownTable(headers, groupRows))
  })

  return lines.join('\n')
}
