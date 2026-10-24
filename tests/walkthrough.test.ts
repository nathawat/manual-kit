import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadShots } from '../src/shots.ts'
import { HYPERFRAMES } from '../src/walkthrough/build.ts'
import { compositionHtml, keyframes } from '../src/walkthrough/compose.ts'
import { DEFAULT_ZOOM, INTRO, OUTRO, XFADE, planWalkthrough, stepSeconds, valueAt, zoomAt, type SceneInput } from '../src/walkthrough/plan.ts'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { serveStatic } from './helpers/server.ts'

const SHOT = { width: 1440, height: 900 }
const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height })
const scenes: SceneInput[] = [
  { image: 'a.png', steps: [{ caption: 'one', box: box(100, 100), action: 'point' }, { caption: 'two', box: box(600, 400), zoom: true, action: 'click' }] },
  { image: 'b.png', steps: [{ caption: 'three', box: box(1200, 800), zoom: 2, action: 'click' }] },
]

describe('walkthrough plan', () => {
  it('canvas keeps the screenshot aspect at 1920 wide', () => {
    expect(planWalkthrough(scenes, SHOT)).toMatchObject({ width: 1920, height: 1200, scale: 1920 / 1440 })
    expect(planWalkthrough(scenes, { width: 1280, height: 720 })).toMatchObject({ width: 1920, height: 1080 })
  })

  it('times the intro, each step, the cross-fade and the outro', () => {
    const p = planWalkthrough(scenes, SHOT)
    const d = stepSeconds('one')
    expect(p.steps.map((s) => [s.n, s.scene, s.start])).toEqual([
      [1, 0, INTRO],
      [2, 0, INTRO + d],
      [3, 1, INTRO + 2 * d],
    ])
    // the second scene fades in over the end of the first
    expect(p.scenes[1]!.start).toBeCloseTo(INTRO + 2 * d - XFADE)
    expect(p.outroStart).toBeCloseTo(INTRO + 3 * d)
    expect(p.total).toBeCloseTo(INTRO + 3 * d + OUTRO)
    // a long caption gets more reading time
    expect(stepSeconds('x'.repeat(60))).toBeGreaterThan(stepSeconds('short'))
  })

  it('zooming keeps the target where it is on screen', () => {
    for (const [p, z] of [[{ x: 650, y: 420 }, 1.6], [{ x: 1250, y: 820 }, 2], [{ x: 0, y: 0 }, 3]] as const) {
      const c = zoomAt(p, z)
      expect(p.x * c.scale + c.x).toBeCloseTo(p.x)
      expect(p.y * c.scale + c.y).toBeCloseTo(p.y)
    }
  })

  it('the camera zooms on zoom steps and is back at full view when the next scene fades in', () => {
    const p = planWalkthrough(scenes, SHOT)
    const cam = p.tracks.find((t) => t.id === 'zoom')!
    const [, two, three] = p.steps
    expect(valueAt(cam, two!.start + 1)).toBe(`translate(-390px, -252px) scale(${DEFAULT_ZOOM})`)
    expect(valueAt(cam, p.scenes[1]!.start)).toBe('translate(0px, 0px) scale(1)')
    expect(valueAt(cam, three!.start + 1)).toBe('translate(-1250px, -820px) scale(2)')
    // only clicks pulse
    expect(p.tracks.some((t) => t.id === 'pulse1')).toBe(false)
    expect(p.tracks.some((t) => t.id === 'pulse2')).toBe(true)
  })

  it('every track becomes keyframes over the whole video, in order, on an element of the composition', () => {
    const p = planWalkthrough(scenes, SHOT)
    const card = { color: '#123456', accent: '#abcdef', title: 'T', subtitle: 'S', foot: ['F', 'Example Company'], logos: [], icon: 'assets/icon.png' }
    const html = compositionHtml(p, { accent: '#abcdef', lang: 'en', intro: { ...card, done: false }, outro: { ...card, done: true } })
    for (const t of p.tracks) {
      expect(html).toContain(`id="${t.id}"`)
      const k = keyframes(t, p.total).map((f) => f.offset as number)
      expect(k[0]).toBe(0)
      expect(k.at(-1)).toBe(1)
      expect([...k].sort((a, b) => a - b)).toEqual(k)
    }
    expect(html).toContain('data-composition-id="main"')
    expect(html).toContain(`data-duration="${p.total}"`)
    expect(html).toContain('<img id="scene1" src="assets/b.png"')
    expect(html).toContain('<p class="foot"><span>F</span><span>Example Company</span></p>')
    expect(html).not.toMatch(/developed by|พัฒนา/i)
  })
})

describe('walkthrough specs', () => {
  const shotsWith = (yaml: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-wt-'))
    writeFileSync(
      join(dir, 'shots.yaml'),
      `shots:\n  list: { url: /list, caption: x }\n  part: { url: /list, caption: x, element: "#main" }\nclips:\n  taken: { url: /x, caption: x, segments: [{ caption: x }] }\n${yaml}`,
    )
    return () => loadShots(dir)
  }
  it('accepts a valid walkthrough with defaults', () => {
    const shots = shotsWith('walkthroughs:\n  w:\n    page: a.page\n    scenes:\n      - shot: list\n        steps: [{ target: "#a", caption: { th: ก } }]\n')()
    expect(shots.walkthroughs.w!.scenes[0]!.steps[0]).toEqual({ target: '#a', caption: { th: 'ก' }, action: 'click' })
  })
  it('rejects unknown shots, partial screenshots, clashing ids and bad fields', () => {
    const w = (body: string, id = 'w') => shotsWith(`walkthroughs:\n  ${id}:\n    page: a.page\n    scenes:\n${body}`)
    expect(w('      - shot: nope\n        steps: [{ target: "#a", caption: x }]\n')).toThrow(/shot "nope" is not in shots/)
    expect(w('      - shot: part\n        steps: [{ target: "#a", caption: x }]\n')).toThrow(/whole app screen/)
    expect(w('      - shot: list\n        steps: [{ target: "#a", caption: x }]\n', 'taken')).toThrow(/a clip has the same id/)
    expect(w('      - shot: list\n        steps: [{ target: "#a", caption: x, zoom: 9 }]\n')).toThrow(/zoom/)
    expect(w('      - shot: list\n        steps: [{ target: "#a", caption: x, action: hover }]\n')).toThrow(/action/)
    expect(w('      - shot: list\n        steps: []\n')).toThrow(/steps/)
  })
})

/** Is the pinned HyperFrames already downloaded (npx cache) with ffmpeg and Node 22+? Then the render test runs. */
const canRender = (() => {
  if (process.env.MK_SKIP_RENDER) return false
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) return false
  return spawnSync('npx', ['--no-install', HYPERFRAMES, '--version'], { stdio: 'ignore', cwd: tmpdir() }).status === 0
})()

describe('walkthrough measure + build', () => {
  let server: Awaited<ReturnType<typeof serveStatic>>
  beforeAll(async () => {
    server = await serveStatic(join(__dirname, 'fixtures/project/site'))
  })
  afterAll(() => server.close())

  async function project() {
    const root = await cleanFixture()
    const m = join(root, 'manual')
    const cfg = join(m, 'manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', server.url).replace('media: screenshots', 'media: steps+video').replace('languages: [th, en]', 'languages: [th]'))
    const shots = join(m, 'shots.yaml')
    writeFileSync(
      shots,
      `${readFileSync(shots, 'utf8')}\nwalkthroughs:\n  sign-in-video:\n    page: teacher.sign-in\n    scenes:\n      - shot: login\n        steps:\n          - { target: "#email", caption: { th: "กรอกอีเมล" }, action: point }\n          - { target: "#submit", caption: { th: "กด {{ui:login.submit}}" }, zoom: true }\n`,
    )
    const page = join(m, 'pages/th/user-guide/01-sign-in.md')
    writeFileSync(page, readFileSync(page, 'utf8').replace('เข้าสู่ระบบเพื่อเริ่มใช้งาน', 'เข้าสู่ระบบเพื่อเริ่มใช้งาน\n\n{{clip:sign-in-video}}'))
    expect((await runCliAsync(['capture'], root)).code).toBe(0)
    return { root, m }
  }

  it('measure records target boxes sorted and stable; build --no-render writes the composition; check wants a build', async () => {
    const { root, m } = await project()
    const before = await runCliAsync(['check', '--allow-unsigned'], root)
    expect(before.stdout).toMatch(/target #email on shot "login" \(th\) is not measured/)

    const r = await runCliAsync(['walkthrough', 'measure', '--verbose'], root)
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatch(/th login \(2 targets\)/)
    const file = join(m, 'media/walkthroughs.json')
    const first = readFileSync(file, 'utf8')
    const boxes = JSON.parse(first) as Record<string, { image: string; targets: Record<string, number[]> }>
    expect(Object.keys(boxes['th/login']!.targets)).toEqual(['#email', '#submit'])
    expect(boxes['th/login']!.targets['#submit']).toHaveLength(4)
    expect((await runCliAsync(['walkthrough', 'measure'], root)).code).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(first)

    const list = await runCliAsync(['walkthrough', 'measure', '--list', 'login'], root)
    expect(list.stdout).toMatch(/#submit {2}"เข้าสู่ระบบ"/)

    const b = await runCliAsync(['walkthrough', 'build', '--no-render'], root)
    expect(b.stdout).toMatch(/composed 1/)
    const html = readFileSync(join(m, 'dist/.build/walkthroughs/th-sign-in-video/index.html'), 'utf8')
    // the caption's UI token is the app's text
    expect(html).toContain('กด เข้าสู่ระบบ')
    expect(existsSync(join(m, 'dist/.build/walkthroughs/th-sign-in-video/assets/login.png'))).toBe(true)
    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).toMatch(/walkthrough "sign-in-video" \(th\) is not built/)
  })

  it('measure records the box of the content inside a display: contents target', async () => {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    writeFileSync(
      join(site, 'wrapped.html'),
      `<!doctype html><html><body style="margin:0">
      <span data-testid="pair" style="display:contents"><span style="position:absolute;left:400px;top:400px;width:200px;height:40px"></span><span style="position:absolute;left:400px;top:460px;width:200px;height:40px"></span></span>
      </body></html>`,
    )
    const srv = await serveStatic(site)
    try {
      const root = await cleanFixture()
      const m = join(root, 'manual')
      const cfg = join(m, 'manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', srv.url).replace('media: screenshots', 'media: steps+video').replace('languages: [th, en]', 'languages: [th]'))
      const shots = join(m, 'shots.yaml')
      writeFileSync(
        shots,
        `${readFileSync(shots, 'utf8').replace('shots:\n', 'shots:\n  wrapped:\n    url: /wrapped.html\n    caption: wrapped\n')}\nwalkthroughs:\n  pair-video:\n    page: teacher.sign-in\n    scenes:\n      - shot: wrapped\n        steps:\n          - { target: "[data-testid=pair]", caption: { th: "คู่" }, action: point }\n`,
      )
      const r = await runCliAsync(['walkthrough', 'measure'], root)
      expect(r.stderr).toBe('')
      expect(r.code).toBe(0)
      const boxes = JSON.parse(readFileSync(join(m, 'media/walkthroughs.json'), 'utf8')) as Record<string, { targets: Record<string, number[]> }>
      expect(boxes['th/wrapped']!.targets['[data-testid=pair]']).toEqual([400, 400, 200, 100])
    } finally {
      await srv.close()
    }
  })

  it.skipIf(!canRender)('renders with HyperFrames into the clip files; pages show it; a new screenshot makes it stale', { timeout: 300_000 }, async () => {
    const { root, m } = await project()
    expect((await runCliAsync(['walkthrough', 'measure'], root)).code).toBe(0)
    const b = await runCliAsync(['walkthrough', 'build', '--verbose'], root)
    expect(b.stderr).toBe('')
    expect(b.stdout).toMatch(/th sign-in-video \(\d+\.\d s\)/)
    const poster = readFileSync(join(m, 'media/th/sign-in-video.poster.png'))
    expect([poster.readUInt32BE(16), poster.readUInt32BE(20)]).toEqual([1920, 1200])
    expect(readFileSync(join(m, 'media/th/sign-in-video.webp')).toString('ascii', 8, 12)).toBe('WEBP')
    const vtt = readFileSync(join(m, 'media/th/sign-in-video.vtt'), 'utf8')
    expect(vtt).toContain('1. กรอกอีเมล')
    expect(vtt).toContain('2. กด เข้าสู่ระบบ')
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', join(m, 'media/th/sign-in-video.mp4')], { encoding: 'utf8' })
    expect(probe.stdout.split('\n').filter(Boolean).sort()).toEqual(['audio', 'video'])

    expect((await runCliAsync(['check', '--allow-unsigned'], root)).stdout).not.toMatch(/walkthrough/)
    expect((await runCliAsync(['walkthrough', 'build', '--changed'], root)).stdout).toMatch(/rendered 0/)
    expect((await runCliAsync(['build', 'web'], root)).code).toBe(0)
    const page = readFileSync(join(m, 'dist/web/user-guide/th/teacher.sign-in.html'), 'utf8')
    expect(page).toContain('<figure data-clip="sign-in-video"')
    expect(page).toContain('<source src="../../media/th/sign-in-video.mp4" type="video/mp4">')

    // the screenshot is taken again and differs: the video is stale and its boxes need measuring again
    const shot = join(m, 'media/th/login.png')
    writeFileSync(shot, Buffer.concat([readFileSync(shot), Buffer.from('changed')]))
    const after = (await runCliAsync(['check', '--allow-unsigned'], root)).stdout
    expect(after).toMatch(/walkthrough "sign-in-video" \(th\) is not built from its current screenshots/)
    expect(after).toMatch(/screenshot of shot "login" \(th\) changed since its targets were measured/)
  })
})

it('the plugin doctor names the HyperFrames release the build renders with', () => {
  expect(readFileSync(join(__dirname, '../plugins/manual-kit/bin/manual-kit'), 'utf8')).toContain(`hf=${HYPERFRAMES}\n`)
})
