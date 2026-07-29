import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import log from 'electron-log/main.js'
import { decompress } from 'woff2-encoder'
import fonteditorCore, { createFont } from 'fonteditor-core'
import type { HtmlToPptxEmbeddedFont, HtmlToPptxSlide } from '@arcsin1/html2pptx'

// ─── Collect used font faces from slides ─────────────────────────────

const collectUsedFontFaces = (slides: HtmlToPptxSlide[]): Set<string> => {
  const fonts = new Set<string>()
  for (const slide of slides) {
    for (const text of slide.texts) {
      if (text.fontFace) fonts.add(text.fontFace)
      for (const run of text.runs || []) {
        if (run.fontFace) fonts.add(run.fontFace)
      }
    }
    for (const table of slide.tables || []) {
      for (const row of table.rows) {
        for (const cell of row) {
          if (cell.fontFace) fonts.add(cell.fontFace)
        }
      }
    }
  }
  return fonts
}

// ─── TTF merge ───────────────────────────────────────────────────────

const uint8ToArrayBuffer = (buffer: Uint8Array): ArrayBuffer => {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

const detectSfntType = (buffer: Uint8Array): 'ttf' | 'otf' => {
  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x54 &&
    buffer[2] === 0x54 &&
    buffer[3] === 0x4f
  ) {
    return 'otf'
  }
  return 'ttf'
}

const readWoff2SubsetAsTtfObject = async (woff2Path: string): Promise<any> => {
  const woff2Data = new Uint8Array(readFileSync(woff2Path))
  const sfntData = await decompress(woff2Data)
  const sfntType = detectSfntType(sfntData)
  const font = createFont(uint8ToArrayBuffer(sfntData), {
    type: sfntType,
    subset: [],
    hinting: false,
    compound2simple: true
  })
  return font.get()
}

const glyphUnicodeCodes = (glyph: any): number[] =>
  Array.isArray(glyph?.unicode)
    ? Array.from(
        new Set<number>(
          glyph.unicode.filter((code: unknown): code is number =>
            typeof code === 'number' && Number.isFinite(code)
          )
        )
      )
    : []

const glyphSortKey = (glyph: any): number => {
  const codes = glyphUnicodeCodes(glyph)
  return codes.length > 0 ? Math.min(...codes) : Number.MAX_SAFE_INTEGER
}

const normalizeMergedFontMetadata = (
  ttf: any,
  familyName: string,
  styleName: string,
  weight: number,
  italic: boolean
): void => {
  const postScriptStyle = styleName.replace(/\s+/g, '')
  ttf.name = {
    ...(ttf.name || {}),
    fontFamily: familyName,
    fontSubFamily: styleName,
    preferredFamily: familyName,
    preferredSubFamily: styleName,
    compatibleFull: `${familyName} ${styleName}`,
    uniqueSubFamily: `${familyName}-${postScriptStyle}`,
    fullName: `${familyName} ${styleName}`,
    postScriptName: `${familyName.replace(/\s+/g, '')}-${postScriptStyle}`
  }
  if (ttf['OS/2']) {
    ttf['OS/2'].fsType = 0
    ttf['OS/2'].usWeightClass = weight
    const unicodes = ttf.glyf
      .flatMap((glyph: any) => (Array.isArray(glyph.unicode) ? glyph.unicode : []))
      .filter((code: number) => Number.isFinite(code))
    if (unicodes.length > 0) {
      ttf['OS/2'].usFirstCharIndex = Math.min(...unicodes)
      ttf['OS/2'].usLastCharIndex = Math.max(...unicodes)
    }
  }
  if (ttf.head) {
    ttf.head.macStyle = (weight >= 700 ? 1 : 0) | (italic ? 2 : 0)
  }
}

const isCjkFontFace = (fontFace: string): boolean =>
  /(?:Noto Sans SC|Ma Shan Zheng|Source Han|PingFang|Microsoft YaHei|SimHei|SimSun)/i.test(fontFace)

const patchEotHeader = (
  eotBuffer: Uint8Array,
  familyName: string,
  italic: boolean
): Uint8Array => {
  const patched = new Uint8Array(eotBuffer)
  if (patched.byteLength > 36) {
    patched[26] = isCjkFontFace(familyName) ? 0x86 : 0x01
    patched[27] = italic ? 1 : 0
  }
  return patched
}

const mergeTtfObjects = (
  ttfObjects: any[],
  familyName: string,
  styleName: string,
  weight: number,
  italic: boolean
): Uint8Array => {
  const base = ttfObjects[0]
  const notdef = base.glyf?.[0] || { name: '.notdef', unicode: [] }
  const glyphs: any[] = [notdef]
  const seenCodes = new Set<number>()
  const seenNames = new Set<string>()

  for (const ttf of ttfObjects) {
    for (const glyph of ttf.glyf || []) {
      if (glyph.name === '.notdef' || glyph.name === '.null' || glyph.name === 'nonmarkingreturn') {
        continue
      }
      const codes = glyphUnicodeCodes(glyph)
      const name = String(glyph.name || '')
      if (codes.length > 0) {
        if (codes.some((code) => seenCodes.has(code))) continue
        glyph.unicode = codes.sort((a, b) => a - b)
        codes.forEach((code) => seenCodes.add(code))
      } else if (name) {
        if (seenNames.has(name)) continue
        seenNames.add(name)
      } else {
        continue
      }
      glyphs.push(glyph)
    }
  }

  base.glyf = [
    glyphs[0],
    ...glyphs.slice(1).sort((a, b) => glyphSortKey(a) - glyphSortKey(b))
  ]
  normalizeMergedFontMetadata(base, familyName, styleName, weight, italic)

  const writer = new fonteditorCore.TTFWriter()
  try {
    const ttfBuffer = new Uint8Array(writer.write(base))
    const eotBuffer = new Uint8Array(fonteditorCore.ttf2eot(uint8ToArrayBuffer(ttfBuffer)))
    return patchEotHeader(eotBuffer, familyName, italic)
  } finally {
    writer.dispose()
  }
}

// ─── Scan font directories ───────────────────────────────────────────

const FONT_DIR = 'assets/fonts/google-fonts'

interface FontVariant {
  fontFamily: string
  weight: number
  style: 'normal' | 'italic'
  woff2Paths: string[]
}

const scanFontDirectory = (projectDir: string): Map<string, FontVariant[]> => {
  const fontRoot = path.join(projectDir, FONT_DIR)
  if (!existsSync(fontRoot)) return new Map()

  const result = new Map<string, FontVariant[]>()
  // Directory name → font family name: Ma_Shan_Zheng → "Ma Shan Zheng"
  const dirToFamilyName = (dir: string): string => dir.replace(/_/g, ' ')

  for (const familyDir of readdirSync(fontRoot, { withFileTypes: true })) {
    if (!familyDir.isDirectory()) continue
    const familyName = dirToFamilyName(familyDir.name)
    const familyPath = path.join(fontRoot, familyDir.name)

    // Group woff2 files by {weight}-{style} variant
    const variantMap = new Map<string, string[]>()
    for (const file of readdirSync(familyPath)) {
      if (!file.endsWith('.woff2')) continue
      // File pattern: {weight}-{style}-{index}.woff2  e.g. 400-normal-0.woff2, 700-normal-5.woff2
      const match = file.match(/^(\d+)-(normal|italic)-\d+\.woff2$/)
      if (!match) continue
      const variantKey = `${match[1]}-${match[2]}`
      if (!variantMap.has(variantKey)) variantMap.set(variantKey, [])
      variantMap.get(variantKey)!.push(path.join(familyPath, file))
    }

    const variants: FontVariant[] = []
    for (const [key, woff2Paths] of variantMap) {
      const [weightStr, fontStyle] = key.split('-')
      variants.push({
        fontFamily: familyName,
        weight: Number.parseInt(weightStr),
        style: fontStyle as 'normal' | 'italic',
        woff2Paths: woff2Paths.sort((a, b) => a.localeCompare(b))
      })
    }

    result.set(familyName, variants)
  }

  return result
}

// ─── Main entry ──────────────────────────────────────────────────────

export const collectEmbeddedFonts = async (
  projectDir: string,
  slides: HtmlToPptxSlide[],
  options: {
    mode?: 'auto' | 'always' | 'never'
    maxTotalBytes?: number
  } = {}
): Promise<HtmlToPptxEmbeddedFont[]> => {
  const mode = options.mode || 'auto'
  if (mode === 'never') {
    log.info('[font-embed] disabled by export option')
    return []
  }
  if (slides.length === 0) return []

  // 1. Collect used font faces from extracted text
  const usedFonts = collectUsedFontFaces(slides)
  log.info('[font-embed] usedFontFaces from slides', { usedFonts: [...usedFonts] })
  if (usedFonts.size === 0) return []

  // 2. Scan project dir for available fonts
  const availableFonts = scanFontDirectory(projectDir)
  const availableNames = [...availableFonts.keys()]
  log.info('[font-embed] availableFonts on disk', { projectDir, availableNames })
  if (availableFonts.size === 0) return []

  // 3. For each used font that exists on disk, merge subsets and embed
  const embeddedFonts: HtmlToPptxEmbeddedFont[] = []

  for (const fontFace of usedFonts) {
    const variants = availableFonts.get(fontFace)
    if (!variants) {
      log.info('[font-embed] skip (not on disk)', { fontFace })
      continue
    }

    for (const variant of variants) {
      const isBold = variant.weight >= 700
      const isItalic = variant.style === 'italic'
      let styleKey: 'regular' | 'bold' | 'italic' | 'boldItalic'
      if (isBold && isItalic) styleKey = 'boldItalic'
      else if (isBold) styleKey = 'bold'
      else if (isItalic) styleKey = 'italic'
      else styleKey = 'regular'

      // Decompress WOFF2 subsets, merge them into a TrueType/glyf font, then
      // wrap that TTF as EOT because PowerPoint .fntdata parts use EOT payloads.
      const ttfObjects: any[] = []
      for (const woff2Path of variant.woff2Paths) {
        try {
          ttfObjects.push(await readWoff2SubsetAsTtfObject(woff2Path))
        } catch (err) {
          log.warn('[font-embed] failed to read woff2 subset', {
            path: woff2Path,
            error: String(err)
          })
        }
      }

      if (ttfObjects.length === 0) continue

      try {
        const styleName = isBold
          ? isItalic ? 'Bold Italic' : 'Bold'
          : isItalic ? 'Italic' : 'Regular'
        const mergedTtf = mergeTtfObjects(
          ttfObjects,
          fontFace,
          styleName,
          variant.weight,
          isItalic
        )
        embeddedFonts.push({ fontFace, style: styleKey, ttfBuffer: mergedTtf })

        log.info('[font-embed] embedded font', {
          fontFace,
          style: styleKey,
          subsets: ttfObjects.length,
          sizeKb: Math.round(mergedTtf.byteLength / 1024)
        })
      } catch (err) {
        log.warn('[font-embed] failed to merge font', {
          fontFace,
          style: styleKey,
          subsets: variant.woff2Paths.length,
          error: String(err)
        })
      }
    }
  }

  if (mode === 'auto') {
    const maxTotalBytes = options.maxTotalBytes ?? 20 * 1024 * 1024
    const totalBytes = embeddedFonts.reduce((sum, item) => sum + item.ttfBuffer.byteLength, 0)
    if (totalBytes > maxTotalBytes) {
      log.warn('[font-embed] skipped embedded fonts in auto mode because payload is too large', {
        totalBytes,
        maxTotalBytes,
        count: embeddedFonts.length
      })
      return []
    }
  }

  return embeddedFonts
}
