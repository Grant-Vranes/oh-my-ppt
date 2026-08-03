import fs from 'fs'
import path from 'path'
import type { GenerationContext } from './context'
import type { GenerateMode } from './types'

export async function resolveSourceDocuments(
  ctx: Pick<GenerationContext, 'localFiles'>,
  args: {
    sessionId: string
    projectDir: string
    rawDocPaths: string[]
    // Kept as an explicit entry-mode contract for callers. The current resolver
    // uses the same session reference/raw-doc behavior for every mode.
    mode: GenerateMode
    sessionRecord: Record<string, unknown>
  }
): Promise<string[]> {
  const { sessionId, projectDir, rawDocPaths, sessionRecord } = args
  const { assertPathInAllowedRoots } = ctx.localFiles
  const rawReferenceDocumentPath =
    sessionRecord.referenceDocumentPath ?? sessionRecord.reference_document_path
  const referenceDocumentPath =
    typeof rawReferenceDocumentPath === 'string' ? rawReferenceDocumentPath.trim() : ''

  const sessionDocsDir = path.join(projectDir, 'docs')
  const sourceDocumentPaths: string[] = []
  const appendSourceDocumentPath = (docPath: string | null): void => {
    if (!docPath || sourceDocumentPaths.includes(docPath)) return
    sourceDocumentPaths.push(docPath)
  }
  const resolveExistingSessionDoc = (docPath: string): string | null => {
    if (!docPath.trim()) return null
    if (docPath.startsWith('/docs/')) {
      const filePath = path.resolve(projectDir, docPath.replace(/^\/+/, ''))
      const relativeToProject = path.relative(projectDir, filePath)
      if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) return null
      try {
        return fs.statSync(filePath).isFile() ? docPath : null
      } catch {
        return null
      }
    }
    if (path.isAbsolute(docPath)) {
      const absolutePath = path.resolve(docPath)
      const relativeToProject = path.relative(projectDir, absolutePath)
      if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) return null
      const normalizedRelative = relativeToProject.split(path.sep).join('/')
      if (!normalizedRelative.startsWith('docs/')) return null
      try {
        return fs.statSync(absolutePath).isFile() ? `/${normalizedRelative}` : null
      } catch {
        return null
      }
    }
    const normalizedDocPath = `/docs/${docPath}`
    const filePath = path.resolve(projectDir, normalizedDocPath.replace(/^\/+/, ''))
    const relativeToProject = path.relative(projectDir, filePath)
    if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) return null
    try {
      return fs.statSync(filePath).isFile() ? normalizedDocPath : null
    } catch {
      return null
    }
  }

  if (referenceDocumentPath) {
    appendSourceDocumentPath(resolveExistingSessionDoc(referenceDocumentPath))
  }

  if (rawDocPaths.length > 0) {
    await fs.promises.mkdir(sessionDocsDir, { recursive: true })
    for (const candidate of rawDocPaths) {
      const sourcePath = await assertPathInAllowedRoots({
        filePath: candidate,
        mode: 'read',
        sessionId
      })
      const safeName = path.basename(sourcePath).replace(/[\\/:"*?<>|]+/g, '-')
      const targetPath = path.join(sessionDocsDir, safeName)
      if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
        await fs.promises.copyFile(sourcePath, targetPath)
      }
      appendSourceDocumentPath(`/docs/${safeName}`)
    }
    return sourceDocumentPaths
  }

  if (sourceDocumentPaths.length > 0) await fs.promises.mkdir(sessionDocsDir, { recursive: true })
  return sourceDocumentPaths
}
