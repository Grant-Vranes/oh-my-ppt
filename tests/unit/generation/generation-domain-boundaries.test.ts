import fs from 'fs'
import { describe, expect, it } from 'vitest'

describe('generation domain boundaries', () => {
  it('owns reference-document retrieval next to its only consumer', () => {
    expect(fs.existsSync('src/main/generation/reference-document-retrieval.ts')).toBe(true)
    expect(fs.existsSync('src/main/utils/reference-document-retrieval.ts')).toBe(false)
  })

  it('imports reference retrieval through the generation domain', () => {
    const agentRunner = fs.readFileSync('src/main/generation/agent-runner.ts', 'utf8')

    expect(agentRunner).toContain("from './reference-document-retrieval'")
    expect(agentRunner).not.toContain('utils/reference-document-retrieval')
  })
})
