import log from 'electron-log/main.js'
import {
  PRODUCT_SKILLS_ROUTE,
  REQUIRED_PRODUCT_SKILL_NAMES,
  type RequiredProductSkillName
} from '../product-skills/contract'

const getRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const readField = (record: Record<string, unknown>, key: string): unknown => {
  const direct = record[key]
  if (direct !== undefined) return direct
  const kwargs = getRecord(record.kwargs)
  return kwargs?.[key]
}

export const previewStr = (value: unknown, max = 240): string => {
  const source =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return String(value)
          }
        })()
  const compact = source.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max)}...` : compact
}

const parseToolArgs = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    const source = value.trim()
    if (!source) return null
    try {
      return getRecord(JSON.parse(source))
    } catch {
      return null
    }
  }
  return getRecord(value)
}

const readToolPathArg = (args: Record<string, unknown> | null): string => {
  if (!args) return ''
  const value =
    args.path ??
    args.file_path ??
    args.filePath ??
    args.absolute_path ??
    args.absolutePath
  return typeof value === 'string' ? value.trim() : ''
}

const resolveProductSkillName = (filePath: string): RequiredProductSkillName | null => {
  const normalized = filePath.replace(/\\/g, '/')
  if (!normalized.startsWith(PRODUCT_SKILLS_ROUTE)) return null
  for (const skillName of REQUIRED_PRODUCT_SKILL_NAMES) {
    if (normalized.includes(`/${skillName}/`)) return skillName
  }
  return null
}

export function logAgentToolEvents(
  data: unknown,
  seen: Set<string>,
  options: { tag: string; source: 'updates' | 'messages' }
): void {
  const { tag, source } = options

  const visitMessage = (msg: unknown): void => {
    const record = getRecord(msg)
    if (!record) return

    const toolCallsSources = [
      readField(record, 'tool_calls'),
      readField(record, 'tool_call_chunks'),
      getRecord(readField(record, 'additional_kwargs'))?.tool_calls
    ]
    for (const calls of toolCallsSources) {
      if (!Array.isArray(calls)) continue
      for (const call of calls) {
        const callRecord = getRecord(call)
        if (!callRecord) continue
        const fnRecord = getRecord(callRecord.function)
        const rawArgs = callRecord.args ?? callRecord.arguments ?? fnRecord?.arguments ?? ''
        const name = String(callRecord.name ?? fnRecord?.name ?? '').trim()
        const id = String(callRecord.id ?? callRecord.tool_call_id ?? '').trim()
        if (!name && !id) continue
        const argsText = previewStr(rawArgs)
        const key = `call:${id}:${name}:${argsText}`
        if (seen.has(key)) continue
        seen.add(key)
        log.info(`[${tag}] tool_call`, {
          source,
          toolName: name || null,
          toolCallId: id || null,
          argsLength: typeof rawArgs === 'string' ? rawArgs.length : 0,
          argsPreview: argsText
        })

        if (name === 'read_file') {
          const filePath = readToolPathArg(parseToolArgs(rawArgs))
          const skillName = filePath ? resolveProductSkillName(filePath) : null
          if (skillName) {
            log.info(`[${tag}] product_skill_read_file`, {
              source,
              toolName: name,
              toolCallId: id || null,
              skillName,
              path: filePath
            })
          }
        }
      }
    }

    const messageType = String(readField(record, 'type') ?? readField(record, 'role') ?? '')
    const toolCallId = String(readField(record, 'tool_call_id') ?? '').trim()
    const toolName = String(readField(record, 'name') ?? '').trim()
    if (toolCallId || messageType === 'tool') {
      const content = readField(record, 'content')
      const contentLen = typeof content === 'string' ? content.length : 0
      const key = `result:${toolCallId}:${toolName}:${contentLen}`
      if (!seen.has(key)) {
        seen.add(key)
        log.info(`[${tag}] tool_result`, {
          source,
          toolName: toolName || null,
          toolCallId: toolCallId || null,
          contentLength: contentLen
        })
      }
    }
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = getRecord(value)
    if (!record) return
    if (
      readField(record, 'tool_calls') !== undefined ||
      readField(record, 'tool_call_chunks') !== undefined ||
      readField(record, 'tool_call_id') !== undefined ||
      readField(record, 'role') === 'tool' ||
      readField(record, 'type') === 'tool'
    ) {
      visitMessage(record)
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') visit(nested)
    }
  }

  visit(data)
}
