// Animated WebP from still WebP frames (as Chromium's canvas encodes them): RIFF container with VP8X, ANIM and
// one ANMF chunk per frame (WebP container spec). No encoder library needed.

interface Chunk {
  type: string
  data: Buffer
}

function chunks(file: Buffer): Chunk[] {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not a WebP file')
  const out: Chunk[] = []
  let i = 12
  while (i + 8 <= file.length) {
    const type = file.toString('ascii', i, i + 4)
    const size = file.readUInt32LE(i + 4)
    out.push({ type, data: file.subarray(i + 8, i + 8 + size) })
    i += 8 + size + (size % 2)
  }
  return out
}

function encodeChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.write(type, 0, 'ascii')
  head.writeUInt32LE(data.length, 4)
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
}
const u24 = (v: number) => Buffer.from([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff])

export function animatedWebp(frames: { webp: Buffer; ms: number }[], width: number, height: number): Buffer {
  let alpha = false
  const anmf = frames.map(({ webp, ms }) => {
    const image = chunks(webp).filter((c) => c.type === 'ALPH' || c.type === 'VP8 ' || c.type === 'VP8L')
    if (image.some((c) => c.type === 'ALPH' || c.type === 'VP8L')) alpha = true
    const header = Buffer.concat([u24(0), u24(0), u24(width - 1), u24(height - 1), u24(Math.min(0xffffff, Math.max(1, Math.round(ms)))), Buffer.from([0x02])])
    return encodeChunk('ANMF', Buffer.concat([header, ...image.map((c) => encodeChunk(c.type, c.data))]))
  })
  const vp8x = Buffer.concat([Buffer.from([0x02 | (alpha ? 0x10 : 0), 0, 0, 0]), u24(width - 1), u24(height - 1)])
  const anim = Buffer.from([0xff, 0xff, 0xff, 0xff, 0, 0]) // white background, loop forever
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), encodeChunk('VP8X', vp8x), encodeChunk('ANIM', anim), ...anmf])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(body.length, 4)
  return Buffer.concat([riff, body])
}
