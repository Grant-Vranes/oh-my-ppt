// pngjs 7.x 未自带类型声明，这里按长图拼接实际用到的 API 给出最小 ambient 声明。
declare module 'pngjs' {
  export class PNG {
    width: number
    height: number
    data: Buffer

    constructor(options?: {
      width?: number
      height?: number
      fill?: boolean | number
      colorType?: number
      bitDepth?: number
      inputColorType?: number
      inputHasAlpha?: boolean
    })

    static bitblt(
      src: PNG,
      dest: PNG,
      srcX?: number,
      srcY?: number,
      width?: number,
      height?: number,
      destX?: number,
      destY?: number
    ): void

    static sync: {
      read(buffer: Buffer | Uint8Array, options?: Record<string, unknown>): PNG
      write(png: PNG, options?: Record<string, unknown>): Buffer
    }
  }
}
