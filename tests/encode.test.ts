import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CARD_MS, MUSIC_LUFS, captionSide, plan, readingMs, toVtt } from '../src/encode.ts'
import { musicWav } from '../src/media/music.ts'
import { animatedWebp } from '../src/media/webp.ts'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { pixel } from './helpers/png.ts'
import { serveStatic } from './helpers/server.ts'

const riffChunks = (b: Buffer) => {
  const out: string[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const size = b.readUInt32LE(i + 4)
    out.push(b.toString('ascii', i, i + 4))
    i += 8 + size + (size % 2)
  }
  return out
}

describe('music bed', () => {
  it('is deterministic per seed and as long as asked', () => {
    const a = musicWav(3, 42)
    expect(a.equals(musicWav(3, 42))).toBe(true)
    expect(a.equals(musicWav(3, 43))).toBe(false)
    expect(a.length).toBe(44 + 3 * 48_000 * 4)
    // not silent, not clipping
    let peak = 0
    for (let i = 44; i < a.length; i += 2) peak = Math.max(peak, Math.abs(a.readInt16LE(i)))
    expect(peak).toBeGreaterThan(8000)
    expect(peak).toBeLessThan(32767)
  })
})

describe('clip timing and captions', () => {
  const t = {
    width: 100,
    height: 50,
    frames: [
      { file: 'a', ms: 1200, segment: 0 },
      { file: 'b', ms: 900, segment: 0 },
      { file: 'c', ms: 500, segment: 0, end: true as const },
      { file: 'd', ms: 3000, segment: 1, end: true as const },
    ],
  }
  it('holds the end of each segment long enough to read its caption', () => {
    const { durations, segments } = plan(t, ['กดปุ่มสร้างห้องเรียน', 'ok'])
    expect(durations[2]).toBe(readingMs('กดปุ่มสร้างห้องเรียน'))
    expect(durations[3]).toBe(3000)
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [0, 2100 + durations[2]!],
      [2100 + durations[2]!, 2100 + durations[2]! + 3000],
    ])
    expect(toVtt(segments)).toMatch(/^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:0\d\.\d{3}\nกดปุ่มสร้างห้องเรียน\n/)
  })

  it('puts the caption band where it does not cover the highlight: bottom by default, top when the highlight is low', () => {
    const h = 800
    expect(captionSide(undefined, h, 90)).toBe('bottom')
    expect(captionSide({ x: 100, y: 100, width: 200, height: 40 }, h, 90)).toBe('bottom')
    // a submit button in a bar pinned to the bottom
    expect(captionSide({ x: 1100, y: 740, width: 120, height: 40 }, h, 90)).toBe('top')
    // just above the band, but the frame drawn around it (5px out) would touch it
    expect(captionSide({ x: 0, y: 700, width: 100, height: 8 }, h, 90)).toBe('top')
    // a highlight taller than the frame minus both bands: the side that covers less of it
    expect(captionSide({ x: 0, y: 40, width: 100, height: 740 }, h, 90)).toBe('top')
    expect(captionSide({ x: 0, y: 20, width: 100, height: 740 }, h, 90)).toBe('bottom')
  })

  it('muxes still WebP frames into an animated WebP', () => {
    // a 1x1 lossy WebP
    const still = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64')
    const anim = animatedWebp(
      [
        { webp: still, ms: 500 },
        { webp: still, ms: 1500 },
      ],
      1,
      1,
    )
    expect(anim.toString('ascii', 0, 4)).toBe('RIFF')
    expect(anim.readUInt32LE(4)).toBe(anim.length - 8)
    expect(riffChunks(anim)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF'])
  })
})

let server: Awaited<ReturnType<typeof serveStatic>>
beforeAll(async () => {
  server = await serveStatic(join(__dirname, 'fixtures/project/site'))
})
afterAll(() => server.close())

const CLIP = `
clips:
  new-class-video:
    url: /classes.html
    caption: { th: "สร้างห้องเรียนใหม่", en: "Creating a class" }
    segments:
      - caption: { th: "กด {{ui:class.new}}", en: "Press {{ui:class.new}}" }
        highlight: "#new-class"
        holdMs: 1000
      - caption: { th: "พิมพ์{{ui:class.name}} แล้วกด {{ui:class.save}}", en: "Type the {{ui:class.name}} and press {{ui:class.save}}" }
        actions: [{ click: "#new-class" }, { fill: "#class-name", value: "ป.5/1" }]
        highlight: "#save"
        holdMs: 1000
`

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasFfmpeg)('capture + encode a clip', () => {
  it('records frames, encodes MP4 + poster + WebP loop + VTT with loudness-normalised music; check, web and paper use it', async () => {
    const root = await cleanFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(
      cfg,
      readFileSync(cfg, 'utf8')
        .replace('http://127.0.0.1:4599', server.url)
        .replace('media: screenshots', 'media: steps+video')
        // paper shows clips only when asked to (document.clips: poster)
        .replace('  date: "2026-10-05"', '  date: "2026-10-05"\n  clips: poster') + 'web: { baseUrl: "https://docs.example.com/manual/" }\n',
    )
    appendFileSync(join(root, 'manual/shots.yaml'), CLIP)
    for (const lang of ['th', 'en']) appendFileSync(join(root, `manual/pages/${lang}/user-guide/02-create-class.md`), '\n{{clip:new-class-video}}\n')

    // before capture/encode, check says what is missing
    expect((await runCliAsync(['check'], root)).stdout).toMatch(/clip "new-class-video" not captured yet/)
    const cap = await runCliAsync(['capture'], root)
    expect(cap.stderr).toBe('')
    expect(cap.stdout).toMatch(/^captured \d+ \(.*2 clips\), 0 failed \(/m)
    const timeline = JSON.parse(readFileSync(join(root, 'manual/media/th/clips/new-class-video/timeline.json'), 'utf8')) as { frames: unknown[] }
    expect(timeline.frames).toHaveLength(5) // start, end of segment 1, 2 actions, end of segment 2
    expect((await runCliAsync(['check'], root)).stdout).toMatch(/not encoded/)

    const enc = await runCliAsync(['encode'], root)
    expect(enc.stderr).toBe('')
    expect(enc.stdout).toMatch(/encoded 2/)
    const m = join(root, 'manual/media/th')
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', join(m, 'new-class-video.mp4')], { encoding: 'utf8' }),
    ) as { streams: { codec_name: string; width?: number }[]; format: { duration: string } }
    expect(probe.streams.map((s) => s.codec_name).sort()).toEqual(['aac', 'h264'])
    expect(probe.streams.find((s) => s.codec_name === 'h264')!.width).toBe(1280)
    // the frames (2 x 1 s held, at least the reading time) between a 2.5 s intro and outro title card
    expect(Number(probe.format.duration)).toBeGreaterThan(4 + (2 * CARD_MS) / 1000)
    const report = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${join(m, 'new-class-video.mp4')}" -af ebur128 -f null - 2>&1 | grep -A2 "Integrated loudness" | grep "I:"`], { encoding: 'utf8' })
    const lufs = Number(/I:\s+(-?[\d.]+)/.exec(report)![1])
    expect(Math.abs(lufs - MUSIC_LUFS)).toBeLessThan(2.5)
    expect(readFileSync(join(m, 'new-class-video.poster.png')).readUInt32BE(16)).toBe(1280)
    // the poster is the title card: the web theme's brand colour, not a frame of the app
    expect(pixel(join(m, 'new-class-video.poster.png'), 10, 400)).toEqual([0x18, 0x3b, 0x5e])
    const webp = readFileSync(join(m, 'new-class-video.webp'))
    expect(riffChunks(webp).filter((c) => c === 'ANMF')).toHaveLength(5)
    const vtt = readFileSync(join(m, 'new-class-video.vtt'), 'utf8')
    expect(vtt).toContain('พิมพ์ชื่อห้องเรียน แล้วกด บันทึก')
    // a cue per title card; the segment captions start after the intro
    expect(vtt).toMatch(/^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:02\.500\nสร้างห้องเรียนใหม่\n\n2\n00:00:02\.500 --> /)
    expect(vtt).toMatch(/\nเรียบร้อย\n$/)
    const check = await runCliAsync(['check'], root)
    expect(check.stdout).not.toMatch(/clip "new-class-video"/)
    // a second encode with --changed does nothing
    expect((await runCliAsync(['encode', '--changed'], root)).stdout).toMatch(/encoded 0/)

    // web: a video with poster, captions track and transcript
    expect((await runCliAsync(['build', 'web', '--lang', 'th'], root)).code).toBe(0)
    const page = readFileSync(join(root, 'manual/dist/web/user-guide/th/teacher.create-class.html'), 'utf8')
    expect(page).toMatch(/<video id="clip-new-class-video" controls[^>]* poster="..\/..\/media\/th\/new-class-video.poster.png"/)
    expect(page).toContain('<source src="../../media/th/new-class-video.mp4" type="video/mp4">')
    expect(page).toMatch(/<details class="transcript">/)
    expect(existsSync(join(root, 'manual/dist/web/media/th/new-class-video.mp4'))).toBe(true)

    // paper (document.clips: poster): poster + caption + QR to the web page
    expect((await runCliAsync(['build', 'pdf', '--lang', 'th'], root)).code).toBe(0)
    const print = readFileSync(join(root, 'manual/dist/.build/user-guide.th.html'), 'utf8')
    expect(print).toMatch(/<figure class="figure clip" id="fig-2-\d"><img src="media\/th\/new-class-video.poster.png"/)
    expect(print).toMatch(/<div class="clip-qr"><img src="data:image\/svg\+xml;base64,/)
    expect((await runCliAsync(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)).code).toBe(0)
    const docx = unzipSync(readFileSync(join(root, 'manual/dist/user-guide.th.docx')))
    const doc = new TextDecoder().decode(docx['word/document.xml'])
    expect(doc).toContain('สร้างห้องเรียนใหม่')
    expect(doc).toContain('https://docs.example.com/manual/user-guide/th/teacher.create-class.html#clip-new-class-video')
    expect(Object.keys(docx).filter((k) => k.startsWith('word/media/')).length).toBeGreaterThanOrEqual(3)
  }, 240_000)

  it('moves the caption band to the top when the highlight sits in a bar pinned to the bottom, also for timelines captured without boxes', async () => {
    const root = await cleanFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', server.url).replace('media: screenshots', 'media: steps+video').replace('languages: [th, en]', 'languages: [th]'))
    appendFileSync(
      join(root, 'manual/shots.yaml'),
      `
clips:
  send-video:
    url: /send.html
    caption: ส่ง
    segments:
      - caption: กดส่ง
        highlight: "#send"
        holdMs: 500
      - caption: กรอกหมายเหตุ
        highlight: "#note"
        holdMs: 500
    poster: frame
`,
    )
    expect((await runCliAsync(['capture'], root)).stderr).toBe('')
    const tlFile = join(root, 'manual/media/th/clips/send-video/timeline.json')
    const tl = JSON.parse(readFileSync(tlFile, 'utf8')) as { height: number; frames: { end?: true; box?: { y: number; height: number } }[] }
    const ends = tl.frames.filter((f) => f.end)
    expect(ends[0]!.box!.y).toBeGreaterThan(tl.height - 100)
    expect(ends[1]!.box!.y).toBeLessThan(200)
    const band = (file: string, y: number) => pixel(file, 640, y).every((c) => c < 80)
    const frames = (n: number) => join(root, `manual/dist/.build/clips/th-send-video/c-${String(n).padStart(3, '0')}.png`)
    const poster = join(root, 'manual/media/th/send-video.poster.png')
    const sides = () => tl.frames.map((_, i) => (band(frames(i + 1), 4) ? 'top' : band(frames(i + 1), tl.height - 4) ? 'bottom' : 'none'))

    expect((await runCliAsync(['encode'], root)).stderr).toBe('')
    // segment 1 (start frame and its end) at the top, segment 2 at the bottom
    expect(sides()).toEqual(['top', 'top', 'bottom'])
    expect(band(poster, 4)).toBe(true)
    expect(band(poster, tl.height - 4)).toBe(false)

    // a timeline from before boxes were recorded: the red frame is found in the picture
    for (const f of tl.frames) delete f.box
    writeFileSync(tlFile, JSON.stringify(tl, null, 2))
    expect((await runCliAsync(['encode'], root)).stderr).toBe('')
    expect(sides()).toEqual(['top', 'top', 'bottom'])
  }, 240_000)
})
