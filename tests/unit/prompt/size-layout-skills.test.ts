import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

const readProjectFile = (filePath: string) =>
  readFileSync(path.join(projectRoot, filePath), 'utf-8')

const sizeLayoutSkills = [
  {
    name: 'vertical-9-16-layout-skill',
    dir: 'resources/skills/vertical-9-16-layout-skill',
    patterns: ['hook-value-takeaway', 'vertical-step-story', 'data-takeaway']
  },
  {
    name: 'standard-4-3-layout-skill',
    dir: 'resources/skills/standard-4-3-layout-skill',
    patterns: ['title-plus-two-zone', 'chart-insight-pair', 'matrix-2x2']
  },
  {
    name: 'square-1-1-layout-skill',
    dir: 'resources/skills/square-1-1-layout-skill',
    patterns: ['center-hero-orbit', 'quadrant-card', 'square-data-card']
  },
  {
    name: 'vertical-3-4-layout-skill',
    dir: 'resources/skills/vertical-3-4-layout-skill',
    patterns: ['poster-hero-proof', 'vertical-process', 'two-column-pocket']
  },
  {
    name: 'red-layout-skill',
    dir: 'resources/skills/red-layout-skill',
    patterns: ['cover-hook', 'saveable-checklist', 'template-note']
  }
] as const

describe('size layout skills', () => {
  it('use progressive disclosure with catalog and checklist references', () => {
    for (const skill of sizeLayoutSkills) {
      const source = readProjectFile(`${skill.dir}/SKILL.md`)
      const catalog = readProjectFile(`${skill.dir}/references/catalog.md`)
      const checklist = readProjectFile(`${skill.dir}/references/checklist.md`)

      expect(source).toContain('references/catalog.md')
      expect(source).toContain('references/checklist.md')
      expect(source).toContain('Pattern Quick Lookup')
      expect(source).not.toContain('## Structure Patterns')

      expect(catalog).toContain('## Zone Skeletons')
      expect(catalog).toContain('## Patterns')
      expect(catalog).toContain('Structure recipe')
      expect(catalog).toContain('Budget rule')
      expect(catalog).toContain('Failure signs')
      for (const pattern of skill.patterns) {
        expect(catalog).toContain(pattern)
      }

      expect(checklist).toContain('P0 - Not Deliverable')
      expect(checklist).toContain('P1 - Should Fix')
      expect(checklist).toContain('P2 - Consider Optimizing')
    }
  })

  it('keep each size skill focused on its own layout language', () => {
    const skillNames = sizeLayoutSkills.map((skill) => skill.name)

    for (const skill of sizeLayoutSkills) {
      const combined = [
        readProjectFile(`${skill.dir}/SKILL.md`),
        readProjectFile(`${skill.dir}/references/catalog.md`),
        readProjectFile(`${skill.dir}/references/checklist.md`)
      ].join('\n')

      for (const otherSkillName of skillNames.filter((name) => name !== skill.name)) {
        expect(combined).not.toContain(otherSkillName)
      }
      expect(combined).not.toContain('When not to use')
      expect(combined).not.toContain('Do not use')
    }
  })

  it('low-density vertical/poster skills cap content capacity and prescribe overload priority', () => {
    // These canvases are social/card formats, not compressed slides. They MUST
    // declare a hard capacity ceiling and an overload priority so the page agent
    // compresses content instead of shrinking fonts or overflowing.
    const lowDensitySkills = [
      'vertical-9-16-layout-skill',
      'vertical-3-4-layout-skill',
      'red-layout-skill'
    ]

    for (const name of lowDensitySkills) {
      const source = readProjectFile(`resources/skills/${name}/SKILL.md`)

      // Hard capacity ceiling is declared.
      expect(source).toContain('Capacity ceiling (hard)')
      // Vertical fill rule forces flex-1 / justify-between so the page never
      // leaves an accidental bottom gap (LLMs cannot pixel-estimate accurately;
      // CSS auto-distribution is the reliable fix).
      expect(source).toContain('Vertical fill (hard)')
      expect(source).toContain('flex-1')
      expect(source).toContain('no accidental top-stack or bottom gap')
      // Overload priority explicitly forbids going below font floors or
      // exceeding canvas height as a way to fit more content.
      expect(source).toContain('resolve overload in this priority')
      expect(source).toContain('Never resolve overload by going below the font floors')
      // Recognises the format as a low-density carrier, not a compressed slide.
      expect(source).toContain('not a compressed slide')
    }
  })
})
