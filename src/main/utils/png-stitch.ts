import { PNG } from 'pngjs'

/**
 * 把多张宽度相同的 PNG 纵向无缝拼接成一张长图，返回新 PNG 的 Buffer。
 *
 * PNG 内部像素经过「逐行过滤 + zlib 压缩」，不能直接首尾相接；这里逐张解码出
 * 原始 RGBA 像素，按页顺序纵向块拷贝到一块总画布，再重新编码为单张 PNG。
 * 同一个 session 的所有页面共用 slideSize，宽度恒定，因此只累加高度。
 */
export function stitchPngBuffersVertical(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('没有可拼接的页面')
  }

  const images = buffers.map((buf) => PNG.sync.read(buf))
  const width = images[0].width
  for (const img of images) {
    if (img.width !== width) {
      throw new Error('页面宽度不一致，无法拼接长图')
    }
  }

  const totalHeight = images.reduce((sum, img) => sum + img.height, 0)
  const merged = new PNG({ width, height: totalHeight })

  let yOffset = 0
  for (const img of images) {
    PNG.bitblt(img, merged, 0, 0, img.width, img.height, 0, yOffset)
    yOffset += img.height
  }

  return PNG.sync.write(merged)
}
