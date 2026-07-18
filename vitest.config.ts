import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@arcsin1/html2pptx/animation': fileURLToPath(
        new URL('../html2pptx/src/animation-writer.ts', import.meta.url)
      ),
      '@arcsin1/html2pptx/ooxml': fileURLToPath(
        new URL('../html2pptx/src/ooxml-writer.ts', import.meta.url)
      ),
      '@arcsin1/html2pptx/node': fileURLToPath(new URL('../html2pptx/src/node.ts', import.meta.url)),
      '@arcsin1/html2pptx': fileURLToPath(new URL('../html2pptx/src/index.ts', import.meta.url)),
      '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    environmentMatchGlobs: [
      ['tests/unit/runtime/**', 'happy-dom']
    ]
  }
})
