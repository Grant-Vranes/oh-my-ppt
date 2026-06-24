import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

describe('style fidelity prompt placement', () => {
  it('keeps style fidelity as a shared system-level rule', () => {
    const shared = readSource('src/main/prompt/shared.ts')

    expect(shared).toContain('export const STYLE_FIDELITY_RULES')
    expect(shared).toContain('风格一致性闸门')
    expect(shared).toContain('视觉语言的唯一来源')
    expect(shared).toContain('layout skill/catalog 只决定结构')
    expect(shared).toContain('单页生成也必须像整套 deck 一样遵守当前 style')
  })

  it('moves the deck-generation style preset to the end of the system prompt', () => {
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const deckFn = deckSystem.slice(deckSystem.indexOf('export function buildDeckAgentSystemPrompt'))

    const currentTaskIndex = deckFn.indexOf('## Current Task')
    const finalStyleIndex = deckFn.indexOf('## 最终风格校准（写入前）')
    const finalReminderIndex = deckFn.indexOf('⛔ FINAL REMINDER')

    expect(deckSystem.slice(0, deckSystem.indexOf("} from './shared'"))).toContain(
      'STYLE_FIDELITY_RULES'
    )
    expect(finalStyleIndex).toBeGreaterThan(currentTaskIndex)
    expect(finalStyleIndex).toBeLessThan(finalReminderIndex)
    expect(deckFn.slice(currentTaskIndex)).toContain('风格预设：${presetLabel} (${presetId})')
    expect(deckFn.slice(currentTaskIndex)).toContain('STYLE_FIDELITY_RULES')
  })

  it('does not duplicate style fidelity into the single-page user prompt', () => {
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    expect(generationUser).not.toContain('STYLE_FIDELITY_RULES')
    expect(generationUser).not.toContain('风格预设：')
    expect(generationUser).not.toContain('## 最终风格校准（写入前）')
  })

  it('applies the final style gate only to rewrite-capable edit system prompts', () => {
    const editSystem = readSource('src/main/prompt/edit-system.ts')
    const containerEdit = editSystem.slice(
      editSystem.indexOf('function buildContainerEditPrompt('),
      editSystem.indexOf('function buildSelectorEditPrompt(')
    )
    const selectorEdit = editSystem.slice(
      editSystem.indexOf('function buildSelectorEditPrompt('),
      editSystem.indexOf('function buildSinglePageEditPrompt(')
    )
    const singlePageEdit = editSystem.slice(
      editSystem.indexOf('function buildSinglePageEditPrompt('),
      editSystem.indexOf('function buildDeckEditPrompt(')
    )
    const deckEdit = editSystem.slice(editSystem.indexOf('function buildDeckEditPrompt('))

    expect(singlePageEdit).toContain('## 最终风格校准（写入前）')
    expect(singlePageEdit.indexOf('## 最终风格校准（写入前）')).toBeGreaterThan(
      singlePageEdit.indexOf('## Current Task')
    )
    expect(singlePageEdit).toContain('STYLE_FIDELITY_RULES')

    expect(deckEdit).toContain('## 最终风格校准（写入前）')
    expect(deckEdit.indexOf('## 最终风格校准（写入前）')).toBeGreaterThan(
      deckEdit.indexOf('## Current Task')
    )
    expect(deckEdit).toContain('STYLE_FIDELITY_RULES')

    expect(selectorEdit).not.toContain('STYLE_FIDELITY_RULES')
    expect(containerEdit).not.toContain('STYLE_FIDELITY_RULES')
  })
})
