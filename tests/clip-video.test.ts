import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { pixel } from './helpers/png.ts'
import { serveStatic } from './helpers/server.ts'

// A clip made elsewhere (a demo video, a screen recording): used as it is, not captured frame by frame.
describe('clip from a ready-made video', () => {
  let server: Awaited<ReturnType<typeof serveStatic>>
  beforeAll(async () => {
    server = await serveStatic(join(__dirname, 'fixtures/project/site'))
  })
  afterAll(() => server.close())

  it('capture reads its length, encode copies it with a poster and captions, pages show it like any clip', async () => {
    const root = await cleanFixture()
    const m = join(root, 'manual')
    mkdirSync(join(m, 'video'))
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=2', '-pix_fmt', 'yuv420p', join(m, 'video/demo.mp4')])
    writeFileSync(join(m, 'video/demo.th.vtt'), 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nคำสั่งแรก & "ผล"\n\n2\n00:00:01.000 --> 00:00:02.000\nผลลัพธ์\n')
    const cfg = join(m, 'manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', server.url).replace('media: screenshots', 'media: steps+video').replace('languages: [th, en]', 'languages: [th]'))
    const shots = join(m, 'shots.yaml')
    writeFileSync(shots, `${readFileSync(shots, 'utf8')}\nclips:\n  demo:\n    video: { file: video/demo.mp4, captions: video/demo.th.vtt }\n    caption: "วิดีโอแนะนำ"\n`)
    const page = join(m, 'pages/th/user-guide/01-sign-in.md')
    writeFileSync(page, readFileSync(page, 'utf8').replace('เข้าสู่ระบบเพื่อเริ่มใช้งาน', 'เข้าสู่ระบบเพื่อเริ่มใช้งาน\n\n{{clip:demo}}'))

    const cap = await runCliAsync(['capture'], root)
    expect(cap.stderr).toBe('')
    expect(cap.stdout).toMatch(/^captured \d+ \(.*1 clip\), 0 failed \(/m)
    const t = JSON.parse(readFileSync(join(m, 'media/th/clips/demo/timeline.json'), 'utf8')) as { width: number; height: number; frames: { ms: number }[] }
    expect([t.width, t.height]).toEqual([320, 180])
    expect(t.frames.reduce((a, f) => a + f.ms, 0)).toBe(2000)

    const enc = await runCliAsync(['encode', '--verbose'], root)
    expect(enc.stderr).toBe('')
    expect(enc.stdout).toMatch(/th demo \(2\.0 s\)/)
    // the video has no sound: it gets the music bed, the picture is copied
    const streams = (file: string) =>
      (JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', file], { encoding: 'utf8' })) as { streams: { codec_name: string }[] }).streams
        .map((s) => s.codec_name)
        .sort()
    expect(streams(join(m, 'media/th/demo.mp4'))).toEqual(['aac', 'h264'])
    expect(readFileSync(join(m, 'media/th/demo.poster.png')).readUInt32BE(16)).toBe(320)
    // the poster is a title card in the brand colour; a still WebP of it for pages that show the loop
    expect(pixel(join(m, 'media/th/demo.poster.png'), 2, 90)).toEqual([0x18, 0x3b, 0x5e])
    const webp = readFileSync(join(m, 'media/th/demo.webp'))
    expect(webp.toString('ascii', 8, 12)).toBe('WEBP')
    expect(readFileSync(join(m, 'media/th/demo.vtt'), 'utf8')).toContain('คำสั่งแรก')
    expect((await runCliAsync(['encode', '--changed'], root)).stdout).toMatch(/encoded 0/)
    const check = await runCliAsync(['check', '--allow-unsigned'], root)
    expect(check.stdout).not.toMatch(/clip "demo"/)
    // the card is part of what was encoded: a new brand colour asks for a new encode
    writeFileSync(cfg, `${readFileSync(cfg, 'utf8')}web: { brand: { colors: { brand: "#225522" } } }\n`)
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/clip "demo" \(th\) is not encoded from its latest capture/)
    expect((await runCliAsync(['encode', '--changed'], root)).stdout).toMatch(/^encoded 1 clip, 0 skipped \(/m)
    expect(pixel(join(m, 'media/th/demo.poster.png'), 2, 90)).toEqual([0x22, 0x55, 0x22])

    expect((await runCliAsync(['build', 'web'], root)).code).toBe(0)
    const html = readFileSync(join(m, 'dist/web/user-guide/th/teacher.sign-in.html'), 'utf8')
    expect(html).toContain('<source src="../../media/th/demo.mp4" type="video/mp4">')
    // the transcript comes from the captions file, escaped once
    expect(html).toContain('<li>คำสั่งแรก &amp; &quot;ผล&quot;</li><li>ผลลัพธ์</li>')
    expect(html).toContain('<span class="len">0:02</span>')

    // a new video makes the clip stale
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=3', '-pix_fmt', 'yuv420p', join(m, 'video/demo.mp4')])
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/clip "demo" \(th\) spec changed since capture/)
  }, 240_000)

  it('a clip needs segments unless it is a video', async () => {
    const root = await cleanFixture()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, `${readFileSync(shots, 'utf8')}\nclips:\n  x:\n    url: /login.html\n    caption: "x"\n`)
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/segments/)
  })
})
