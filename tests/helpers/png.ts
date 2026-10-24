import { readFileSync, statSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/** RGB of one pixel of an 8-bit RGB/RGBA PNG (what Chromium writes). */
export function pixel(file: string, x: number, y: number): [number, number, number] {
  const b = readFileSync(file)
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  const bpp = b[25] === 6 ? 4 : 3
  const idat: Buffer[] = []
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o)
    if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let r = 0; r < height; r++) {
    const f = raw[r * (stride + 1)]!
    for (let i = 0; i < stride; i++) {
      const v = raw[r * (stride + 1) + 1 + i]!
      const a = i >= bpp ? out[r * stride + i - bpp]! : 0
      const up = r ? out[(r - 1) * stride + i]! : 0
      const c = r && i >= bpp ? out[(r - 1) * stride + i - bpp]! : 0
      const p = a + up - c
      const pr = Math.abs(p - a) <= Math.abs(p - up) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - up) <= Math.abs(p - c) ? up : c
      out[r * stride + i] = (v + [0, a, up, (a + up) >> 1, pr][f]!) & 0xff
    }
  }
  const o = y * stride + x * bpp
  return [out[o]!, out[o + 1]!, out[o + 2]!]
}

/** Count the pixels of one exact RGB colour (e.g. the highlight frame #d1242f) in a PNG. */
export function countColor(file: string, rgb: [number, number, number]): number {
  const b = readFileSync(file)
  const width = b.readUInt32BE(16)
  const height = b.readUInt32BE(20)
  let n = 0
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (rowCache(file, y, x).every((v, i) => v === rgb[i])) n++
  return n
}
const decoded = new Map<string, { width: number; px: Buffer; bpp: number }>()
function rowCache(file: string, y: number, x: number): [number, number, number] {
  // keyed by modification time too: a test that captures the same image again reads the new one
  const key = `${file}@${statSync(file).mtimeMs}`
  let d = decoded.get(key)
  if (!d) {
    const b = readFileSync(file)
    const width = b.readUInt32BE(16)
    const height = b.readUInt32BE(20)
    const bpp = b[25] === 6 ? 4 : 3
    const idat: Buffer[] = []
    for (let o = 8; o < b.length; ) {
      const len = b.readUInt32BE(o)
      if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len))
      o += 12 + len
    }
    const raw = inflateSync(Buffer.concat(idat))
    const stride = width * bpp
    const out = Buffer.alloc(stride * height)
    for (let r = 0; r < height; r++) {
      const f = raw[r * (stride + 1)]!
      for (let i = 0; i < stride; i++) {
        const v = raw[r * (stride + 1) + 1 + i]!
        const a = i >= bpp ? out[r * stride + i - bpp]! : 0
        const up = r ? out[(r - 1) * stride + i]! : 0
        const c = r && i >= bpp ? out[(r - 1) * stride + i - bpp]! : 0
        const p = a + up - c
        const pr = Math.abs(p - a) <= Math.abs(p - up) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - up) <= Math.abs(p - c) ? up : c
        out[r * stride + i] = (v + [0, a, up, (a + up) >> 1, pr][f]!) & 0xff
      }
    }
    d = { width, px: out, bpp }
    decoded.set(key, d)
  }
  const o = (y * d.width + x) * d.bpp
  return [d.px[o]!, d.px[o + 1]!, d.px[o + 2]!]
}

/** The darkest channel value in a rectangle of a PNG (0 = some pixel is black, 255 = all white). */
export function darkest(file: string, x0: number, y0: number, x1: number, y1: number): number {
  let min = 255
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) min = Math.min(min, ...rowCache(file, y, x))
  return min
}
