import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveSourceDocuments } from '../../../src/main/generation/source-documents'

describe('resolveSourceDocuments', () => {
  it('keeps the session reference document across edit-like modes', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-source-docs-'))
    await mkdir(path.join(projectDir, 'docs'), { recursive: true })
    await writeFile(path.join(projectDir, 'docs', 'reference.md'), '# Reference\n', 'utf8')

    const result = await resolveSourceDocuments(
      { localFiles: { assertPathInAllowedRoots: vi.fn() } } as any,
      {
        sessionId: 's1',
        projectDir,
        rawDocPaths: [],
        mode: 'edit',
        sessionRecord: { referenceDocumentPath: '/docs/reference.md' }
      }
    )

    expect(result).toEqual(['/docs/reference.md'])
  })

  it('merges newly attached documents with the existing session reference document', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-source-docs-'))
    const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-upload-docs-'))
    await mkdir(path.join(projectDir, 'docs'), { recursive: true })
    await writeFile(path.join(projectDir, 'docs', 'reference.md'), '# Reference\n', 'utf8')
    const uploadedPath = path.join(uploadDir, 'extra.md')
    await writeFile(uploadedPath, '# Extra\n', 'utf8')
    const assertPathInAllowedRoots = vi.fn(async () => uploadedPath)

    const result = await resolveSourceDocuments(
      { localFiles: { assertPathInAllowedRoots } } as any,
      {
        sessionId: 's1',
        projectDir,
        rawDocPaths: [uploadedPath],
        mode: 'edit',
        sessionRecord: { referenceDocumentPath: '/docs/reference.md' }
      }
    )

    expect(result).toEqual(['/docs/reference.md', '/docs/extra.md'])
    expect(await readFile(path.join(projectDir, 'docs', 'extra.md'), 'utf8')).toBe('# Extra\n')
  })

  it('accepts legacy absolute reference paths only when they point inside project docs', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-source-docs-'))
    await mkdir(path.join(projectDir, 'docs'), { recursive: true })
    const absoluteReferencePath = path.join(projectDir, 'docs', 'legacy.md')
    await writeFile(absoluteReferencePath, '# Legacy\n', 'utf8')

    const result = await resolveSourceDocuments(
      { localFiles: { assertPathInAllowedRoots: vi.fn() } } as any,
      {
        sessionId: 's1',
        projectDir,
        rawDocPaths: [],
        mode: 'retrySinglePage',
        sessionRecord: { reference_document_path: absoluteReferencePath }
      }
    )

    expect(result).toEqual(['/docs/legacy.md'])
  })
})
