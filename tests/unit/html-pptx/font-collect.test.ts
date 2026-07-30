import { afterEach, describe, expect, it } from 'vitest'
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import type { HtmlToPptxSlide } from '@arcsin1/html2pptx'
import { collectEmbeddedFonts } from '../../../src/main/io/html-pptx/font-collect'

const tempDirectories: string[] = []

const readEotFamily = (data: Uint8Array): string => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const byteLength = view.getUint16(82, true)
  return new TextDecoder('utf-16le').decode(data.slice(84, 84 + byteLength))
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('PPTX font embedding', () => {
  it('embeds only the user font faces actually used by exported text', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'oh-my-ppt-font-'))
    tempDirectories.push(projectDir)
    const userFontsDir = path.join(projectDir, 'assets', 'fonts', 'user-fonts')
    const titleDir = path.join(userFontsDir, 'title-font')
    const bodyDir = path.join(userFontsDir, 'body-font')
    await Promise.all([mkdir(titleDir, { recursive: true }), mkdir(bodyDir, { recursive: true })])

    const regularSource = path.resolve('resources/google-fonts/Poppins/400-normal-0.woff2')
    const boldSource = path.resolve('resources/google-fonts/Poppins/700-normal-0.woff2')
    await Promise.all([
      copyFile(boldSource, path.join(titleDir, 'title.woff2')),
      copyFile(regularSource, path.join(bodyDir, 'body.woff2'))
    ])

    const htmlPath = path.join(projectDir, 'page-1.html')
    await writeFile(
      htmlPath,
      `<style>
        @font-face { font-family: "User Title"; src: url("./assets/fonts/user-fonts/title-font/title.woff2") format("woff2"); font-weight: 700; font-style: normal; }
        @font-face { font-family: "User Body"; src: url("./assets/fonts/user-fonts/body-font/body.woff2") format("woff2"); font-weight: 400; font-style: normal; }
      </style>`,
      'utf-8'
    )

    const slides: HtmlToPptxSlide[] = [
      {
        texts: [
          { text: 'Title', x: 0, y: 0, w: 2, h: 0.4, fontSize: 20, fontFace: 'User Title', bold: true },
          { text: 'Body', x: 0, y: 1, w: 2, h: 0.3, fontSize: 12, fontFace: 'User Body' }
        ]
      }
    ]

    const embeddedFonts = await collectEmbeddedFonts(projectDir, slides, {
      mode: 'always',
      pageHtmlPaths: [htmlPath]
    })

    expect(embeddedFonts).toHaveLength(2)
    expect(embeddedFonts.map((font) => [font.fontFace, font.style]).sort()).toEqual([
      ['User Body', 'regular'],
      ['User Title', 'bold']
    ])
    expect(embeddedFonts.map((font) => readEotFamily(font.ttfBuffer)).sort()).toEqual([
      'User Body',
      'User Title'
    ])
  })
})
