export type ExportKind =
  | 'pdf'
  | 'png'
  | 'video'
  | 'pptx'
  | 'slidePack'
  | 'sessionZip'
  | 'longImage'

export type ExportProgressStage = 'preparing' | 'rendering' | 'packaging' | 'writing'

export interface ExportProgressPayload {
  sessionId: string
  kind: ExportKind
  stage: ExportProgressStage
  progress: number
  current?: number
  total?: number
}
