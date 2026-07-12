import type { PptxImportProgressPayload } from '../../utils/pptx-importer'

type PptxImportPostPersistStep =
  | 'session-records'
  | 'style-extraction'
  | 'design-contract'
  | 'design-contract-persist'
  | 'style-skipped'
  | 'completed'

const PPTX_IMPORT_POST_PERSIST_PROGRESS: Record<
  PptxImportPostPersistStep,
  Pick<PptxImportProgressPayload, 'stage' | 'progress' | 'label'>
> = {
  'session-records': {
    stage: 'database',
    progress: 92,
    label: '正在写入会话记录'
  },
  'style-extraction': {
    stage: 'database',
    progress: 94,
    label: '正在抽取演示风格'
  },
  'design-contract': {
    stage: 'database',
    progress: 96,
    label: '正在生成导入设计信息'
  },
  'design-contract-persist': {
    stage: 'database',
    progress: 98,
    label: '正在写入设计信息'
  },
  'style-skipped': {
    stage: 'database',
    progress: 98,
    label: '已跳过风格提取，正在完成导入'
  },
  completed: {
    stage: 'completed',
    progress: 100,
    label: 'PPTX 导入完成'
  }
}

export function createPptxImportPostPersistProgress(
  step: PptxImportPostPersistStep,
  totalPages: number
): PptxImportProgressPayload {
  return {
    ...PPTX_IMPORT_POST_PERSIST_PROGRESS[step],
    totalPages
  }
}

