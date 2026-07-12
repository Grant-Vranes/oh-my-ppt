import { describe, expect, it } from 'vitest'
import { createPptxImportPostPersistProgress } from '../../src/main/ipc/io/pptx-import-progress'

describe('pptx import progress', () => {
  it('reserves 100% completion until post-import style work finishes', () => {
    const totalPages = 8
    const progress = [
      createPptxImportPostPersistProgress('session-records', totalPages),
      createPptxImportPostPersistProgress('style-extraction', totalPages),
      createPptxImportPostPersistProgress('design-contract', totalPages),
      createPptxImportPostPersistProgress('design-contract-persist', totalPages),
      createPptxImportPostPersistProgress('completed', totalPages)
    ]

    expect(progress.map((item) => item.progress)).toEqual([92, 94, 96, 98, 100])
    expect(progress.slice(0, -1).every((item) => item.stage !== 'completed')).toBe(true)
    expect(progress.at(-1)).toMatchObject({
      stage: 'completed',
      progress: 100,
      label: 'PPTX 导入完成',
      totalPages
    })
  })

  it('keeps failed style extraction below completed progress', () => {
    expect(createPptxImportPostPersistProgress('style-skipped', 3)).toMatchObject({
      stage: 'database',
      progress: 98,
      label: '已跳过风格提取，正在完成导入',
      totalPages: 3
    })
  })
})

