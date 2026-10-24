// QR codes for paper (PDF: SVG, DOCX: PNG). The `qrcode` package only computes the modules; drawing is here.
import { deflateSync } from 'node:zlib'
import QRCode from 'qrcode'

function modules(text: string): { size: number; dark: (x: number, y: number) => boolean } {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: q.modules.size, dark: (x, y) => !!q.modules.get(y, x) }
}

const QUIET = 4

export function qrSvg(text: string): string {
  const { size, dark } = modules(text)
  const n = size + QUIET * 2
  let d = ''
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark(x, y)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Greyscale PNG, `scale` pixels per module. */
export function qrPng(text: string, scale = 8): Buffer {
  const { size, dark } = modules(text)
  const px = (size + QUIET * 2) * scale
  const raw = Buffer.alloc((px + 1) * px, 0xff)
  for (let y = 0; y < px; y++) {
    raw[y * (px + 1)] = 0
    const my = Math.floor(y / scale) - QUIET
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - QUIET
      if (mx >= 0 && my >= 0 && mx < size && my < size && dark(mx, my)) raw[y * (px + 1) + 1 + x] = 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(px, 0)
  ihdr.writeUInt32BE(px, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // greyscale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
