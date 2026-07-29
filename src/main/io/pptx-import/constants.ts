import type { SlideSizePreset } from '@shared/slide-size'

export const PAGE_WIDTH = 1600
export const PAGE_HEIGHT = 900

export const PPTX_IMPORT_SLIDE_SIZE: SlideSizePreset = {
  id: 'wide-16-9',
  label: '宽屏 16:9',
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT
}

export const DEFAULT_IMPORTED_TEXT_FONT = 'sans-serif'
