import fs from 'fs'
import path from 'path'
import log from 'electron-log/main.js'
import {
  deriveOutlinePageCandidates,
  estimateOutlinePageCount,
  scanDocumentOutline,
  type DocumentOutlineScan
} from '../io/document-outline-scan'
import { convertCsvTextToMarkdown } from '../io/document-csv-to-markdown'
import type { ThinkingChatMessage } from '@shared/thinking'

const MAX_BRIEF_ATTACHMENTS = 3
const MAX_VISIBLE_CANDIDATES = 18
const MAX_VISIBLE_HEADINGS = 24
const MAX_SOURCE_BYTES = 1_500_000

type SourceManifestItem = {
  id: string
  name: string
  kind: string
  fileName: string
}

const readManifest = async (thinkingDir: string): Promise<SourceManifestItem[]> => {
  try {
    const manifestPath = path.join(thinkingDir, 'sources.json')
    const parsed = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SourceManifestItem => {
          if (!item || typeof item !== 'object') return false
          const record = item as Record<string, unknown>
          return (
            typeof record.id === 'string' &&
            typeof record.name === 'string' &&
            typeof record.kind === 'string' &&
            typeof record.fileName === 'string'
          )
        })
      : []
  } catch {
    return []
  }
}

const flattenHeadingLines = (
  nodes: DocumentOutlineScan['sectionTree'],
  depth = 0
): string[] =>
  nodes.flatMap((node) => [
    `${'  '.repeat(depth)}- ${'#'.repeat(node.level)} ${node.title} (lines ${node.lineStart}-${node.lineEnd})`,
    ...flattenHeadingLines(node.children, depth + 1)
  ])

const resolveScanFormat = (kind: string): DocumentOutlineScan['format'] => {
  if (kind === 'text') return 'text'
  return 'markdown'
}

const formatSourceBriefSection = (args: {
  source: SourceManifestItem
  virtualPath: string
  scan: DocumentOutlineScan
}): string => {
  const candidates = deriveOutlinePageCandidates(args.scan)
  const estimate = estimateOutlinePageCount(args.scan, candidates)
  const headingLines = flattenHeadingLines(args.scan.sectionTree).slice(0, MAX_VISIBLE_HEADINGS)
  const candidateLines = candidates.slice(0, MAX_VISIBLE_CANDIDATES).map((candidate, index) =>
    [
      `${index + 1}. [${candidate.role}] ${candidate.sourceHeading}`,
      `(lines ${candidate.lineStart}-${candidate.lineEnd}; ${candidate.reason})`
    ].join(' ')
  )

  return [
    `### ${args.source.name}`,
    `- Source file: ${args.virtualPath}`,
    `- Detected format: ${args.scan.format}`,
    args.scan.topLevelTitle ? `- Top-level title: ${args.scan.topLevelTitle}` : '',
    `- Headings detected: ${args.scan.headingCount}`,
    estimate
      ? `- Deterministic slide-count estimate: prefer ${estimate.preferredPageCount}; range ${estimate.minPageCount}-${estimate.maxPageCount}.`
      : '',
    args.scan.recommendedSplitHints.length > 0 ? '- Split/merge hints:' : '',
    ...args.scan.recommendedSplitHints.slice(0, 5).map((hint) => `  - ${hint}`),
    candidateLines.length > 0
      ? `- Page candidates (${candidateLines.length} visible of ${candidates.length}):`
      : '',
    ...candidateLines.map((line) => `  ${line}`),
    candidates.length > candidateLines.length
      ? `  ... ${candidates.length - candidateLines.length} more candidates. Use grep/read_file on the source file for the rest.`
      : '',
    headingLines.length > 0 ? `- Heading map (${headingLines.length} visible):` : '',
    ...headingLines.map((line) => `  ${line}`),
    args.scan.headingCount > headingLines.length
      ? `  ... ${args.scan.headingCount - headingLines.length} more headings. Use grep/read_file on the source file for details.`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export const buildThinkingSourceBrief = async (args: {
  thinkingDir: string
  attachments?: ThinkingChatMessage['attachments']
}): Promise<string> => {
  const attachments = (args.attachments || []).filter((item) => item.kind !== 'image')
  if (attachments.length === 0) return ''

  const startedAt = Date.now()
  log.info('[thinking:source-brief] start', {
    thinkingDir: args.thinkingDir,
    attachmentCount: attachments.length,
    attachmentIds: attachments.map((attachment) => attachment.id),
    attachmentNames: attachments.map((attachment) => attachment.name)
  })

  const manifest = await readManifest(args.thinkingDir)
  const sourcesDir = path.join(args.thinkingDir, 'sources')
  const sections: string[] = []

  for (const attachment of attachments.slice(0, MAX_BRIEF_ATTACHMENTS)) {
    const source = manifest.find((item) => item.id === attachment.id)
    if (!source) {
      log.warn('[thinking:source-brief] attachment missing from manifest', {
        sourceId: attachment.id,
        sourceName: attachment.name
      })
      continue
    }
    const sourcePath = path.join(sourcesDir, source.fileName)
    const virtualPath = `/sources/${source.fileName}`

    try {
      const stat = await fs.promises.stat(sourcePath)
      if (!stat.isFile()) {
        log.warn('[thinking:source-brief] source path is not a file', {
          sourceId: source.id,
          sourceName: source.name,
          virtualPath
        })
        continue
      }
      if (stat.size > MAX_SOURCE_BYTES) {
        log.info('[thinking:source-brief] source skipped because it is large', {
          sourceId: source.id,
          sourceName: source.name,
          virtualPath,
          bytes: stat.size
        })
        sections.push(
          [
            `### ${source.name}`,
            `- Source file: ${virtualPath}`,
            `- File is large (${stat.size} bytes), so no inline source brief was generated.`,
            '- Use grep/read_file on the source file to inspect headings and relevant sections.'
          ].join('\n')
        )
        continue
      }
      const rawContent = await fs.promises.readFile(sourcePath, 'utf-8')
      const content =
        source.kind === 'csv'
          ? convertCsvTextToMarkdown(rawContent, { title: source.name })
          : rawContent
      if (!content.trim()) continue
      const scan = scanDocumentOutline(content, resolveScanFormat(source.kind))
      const candidates = deriveOutlinePageCandidates(scan)
      const estimate = estimateOutlinePageCount(scan, candidates)
      log.info('[thinking:source-brief] source scanned', {
        sourceId: source.id,
        sourceName: source.name,
        kind: source.kind,
        virtualPath,
        bytes: stat.size,
        headingCount: scan.headingCount,
        pageCandidateCount: candidates.length,
        preferredPageCount: estimate?.preferredPageCount ?? null
      })
      sections.push(formatSourceBriefSection({ source, virtualPath, scan }))
    } catch (error) {
      log.warn('[thinking:source-brief] scan failed', {
        sourceId: source.id,
        sourceName: source.name,
        message: error instanceof Error ? error.message : String(error)
      })
      sections.push(
        [
          `### ${source.name}`,
          `- Source file: ${virtualPath}`,
          '- Source brief scan failed. Use grep/read_file on the source file when details are needed.'
        ].join('\n')
      )
    }
  }

  if (sections.length === 0) {
    log.info('[thinking:source-brief] end', {
      sectionCount: 0,
      briefLength: 0,
      durationMs: Date.now() - startedAt
    })
    return ''
  }

  const brief = [
    '## Source Brief',
    'The following lightweight source brief was built deterministically from the files attached to this message. Use it as a map only; read the source file with grep/read_file when exact details are needed.',
    '',
    ...sections
  ].join('\n')
  log.info('[thinking:source-brief] end', {
    sectionCount: sections.length,
    briefLength: brief.length,
    durationMs: Date.now() - startedAt
  })
  return brief
}
