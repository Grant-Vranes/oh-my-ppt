import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const stylesRoot = path.join(projectRoot, 'resources/styles')

const listBuiltinStyleSkillFiles = () =>
  readdirSync(stylesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(stylesRoot, entry.name, 'SKILL.md'))
    .filter((filePath) => {
      try {
        readFileSync(filePath, 'utf8')
        return true
      } catch {
        return false
      }
    })

const extractLayoutSection = (markdown: string) => {
  const match = markdown.match(/## 布局\n([\s\S]*?)(\n## |$)/)
  return (match?.[1] || markdown).replace(/\s+/g, ' ').trim()
}

describe('builtin style density guidance', () => {
  it('does not use style wording that directly encourages overloaded pages', () => {
    const forbidden = [
      '儿童节不怕满',
      '全屏代码展示是常态',
      '宁可多塞一行数据',
      '信息密度可以很高',
      '每个数据模块独立成卡片',
      '信息宫格化，每个色块承载一类信息',
      '下方结合卡片宫格',
      '像积木一样堆叠'
    ]

    for (const filePath of listBuiltinStyleSkillFiles()) {
      const markdown = readFileSync(filePath, 'utf8')
      for (const phrase of forbidden) {
        expect(markdown, `${path.relative(projectRoot, filePath)} should not contain ${phrase}`).not.toContain(
          phrase
        )
      }
    }
  })

  it('pairs card/grid/terminal/table layout cues with explicit breathing-room guidance', () => {
    const riskyCue =
      /(宫格|多面板|终端|代码|KPI|表格|看板|卡片式布局|色块.*分组|模块化排布|不对称布局)/
    const densityBuffer =
      /(留白|呼吸|低到中密度|不要.*堆|不要.*塞|不要.*密集|不要默认|避免.*堆|避免.*塞|避免.*密集|由内容|按内容|可读|克制|少量|必要信息)/

    for (const filePath of listBuiltinStyleSkillFiles()) {
      const layout = extractLayoutSection(readFileSync(filePath, 'utf8'))
      if (!riskyCue.test(layout)) continue

      expect(layout, `${path.relative(projectRoot, filePath)} has risky layout cues`).toMatch(
        densityBuffer
      )
    }
  })

  it('keeps dreamy-romance sparse for data-heavy report pages', () => {
    const dreamy = readFileSync(path.join(stylesRoot, 'dreamy-romance/SKILL.md'), 'utf8')

    expect(dreamy).toContain('数据、报告或表格型内容也要保持柔和低到中密度')
    expect(dreamy).toContain('不要把每个指标都扩成同等大小的大卡片')
    expect(dreamy).toContain('避免同一事实同时出现在摘要卡、时间轴和说明卡里')
  })
})
