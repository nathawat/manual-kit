// walkthrough build: screenshots already captured + measured target boxes -> a HyperFrames composition per walkthrough
// and language, rendered by the pinned HyperFrames CLI into the clip files (<id>.mp4, .vtt, .poster.png, .webp), so
// `{{clip:<id>}}` shows it like any clip. The live app is never opened; editing a video only needs a rebuild.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import { lazyDep } from '../deps.ts'
import { localize, type ManualConfig } from '../config.ts'
import { MUSIC_LUFS, hasFfmpeg, toVtt, type Segment } from '../encode.ts'
import { musicWav, seedOf } from '../media/music.ts'
import { imageSize } from '../media/size.ts'
import { ASSETS } from '../paths.ts'
import type { Project } from '../project.ts'
import { plainText } from '../render.ts'
import { UsageError } from '../sign.ts'
import { MANIFEST_FILE, clipFiles, clipTimeline, hasClips, loadShots, manifestKey, readManifest, shotPath, type Shots, type WalkthroughSpec } from '../shots.ts'
import { boxKey, imageHash, readBoxes, toBox, type Boxes } from './boxes.ts'
import { cardBrand, type Card } from '../media/card.ts'
import { compositionHtml, type Look } from './compose.ts'
import { INTRO, POSTER_AT, planWalkthrough, type Plan } from './plan.ts'

const playwright = lazyDep<typeof import('playwright')>('playwright')

/** The HyperFrames CLI release every render uses (plugins/manual-kit/bin/manual-kit doctor names the same one). */
export const HYPERFRAMES = 'hyperframes@0.8.140'
/** Bump when the composition changes for the same input, so `check` asks for a new build. */
const BUILDER_VERSION = '2'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const POSTER_WEBP_WIDTH = 640
const FONTS = ['Sarabun-SemiBold.ttf', 'Sarabun-Bold.ttf']
const WORDS = {
  th: { done: 'เรียบร้อย', more: (t: string) => `อ่านวิธีทำเต็มที่หัวข้อ ${t}` },
  en: { done: 'Done', more: (t: string) => `Full steps: ${t}` },
}
const wordsFor = (lang: string) => (lang === 'th' ? WORDS.th : WORDS.en)

/** Everything one walkthrough video in one language is made from, or why it cannot be made yet. */
export type Source =
  | { ok: false; problems: string[] }
  | { ok: true; plan: Plan; html: string; vtt: string; assets: { name: string; from: string }[]; hash: string; title: string }

/** A picture named in the config (book icon, logos) when its file exists. */
function picture(manualDir: string, rel: unknown): string | undefined {
  return typeof rel === 'string' && existsSync(join(manualDir, rel)) ? join(manualDir, rel) : undefined
}

export function walkthroughSource(project: Project, shots: Shots, boxes: Boxes, lang: string, id: string): Source {
  const { config, manualDir, primary } = project
  const spec: WalkthroughSpec = shots.walkthroughs[id]!
  const problems: string[] = []
  const page = project.pages.find((p) => p.id === spec.page && p.lang === lang)
  if (!page) problems.push(`page "${spec.page}" does not exist in ${lang}`)
  const sizes = new Set<string>()
  for (const sc of spec.scenes) {
    const file = join(manualDir, shotPath(lang, sc.shot))
    if (!existsSync(file)) {
      problems.push(`shot "${sc.shot}" is not captured in ${lang} (run "manual-kit capture")`)
      continue
    }
    const s = imageSize(file)
    sizes.add(s ? `${s.width}x${s.height}` : '?')
    const measured = boxes[boxKey(lang, sc.shot)]
    for (const st of sc.steps) {
      const b = measured?.targets[st.target]
      if (b === undefined) problems.push(`target ${st.target} on shot "${sc.shot}" (${lang}) is not measured (run "manual-kit walkthrough measure")`)
      else if (b === null) problems.push(`target ${st.target} was not on the screen of shot "${sc.shot}" (${lang}) when measured`)
    }
  }
  if (sizes.size > 1) problems.push(`its screenshots differ in size (${[...sizes].join(', ')}); give the shots one viewport`)
  if (problems.length || !page) return { ok: false, problems }

  const text = (v: Parameters<typeof localize>[0]) => plainText(project, lang, localize(v, lang, primary))
  const pageTitle = plainText(project, lang, page.meta.title)
  const title = spec.title ? text(spec.title) : pageTitle
  const bookTitle = text(config.books[page.book]?.title ?? page.book)
  const docTitle = text(config.document.title)
  const [w, h] = [...sizes][0]!.split('x').map(Number) as [number, number]
  const plan = planWalkthrough(
    spec.scenes.map((sc) => ({
      image: `${sc.shot}.png`,
      steps: sc.steps.map((st) => ({ caption: text(st.caption), box: toBox(boxes[boxKey(lang, sc.shot)]!.targets[st.target]!), zoom: st.zoom, action: st.action })),
    })),
    { width: w, height: h },
  )

  const assets: { name: string; from: string }[] = [
    ...[...new Set(spec.scenes.map((sc) => sc.shot))].map((s) => ({ name: `${s}.png`, from: join(manualDir, shotPath(lang, s)) })),
    ...FONTS.map((f) => ({ name: f, from: fileURLToPath(new URL(`fonts/${f}`, ASSETS)) })),
  ]
  const icon = picture(manualDir, (config.books[page.book] as { icon?: unknown } | undefined)?.icon)
  if (icon) assets.push({ name: `icon${extname(icon)}`, from: icon })
  const brand = cardBrand(project, lang)
  const logos = brand.logoFiles.map((from, i) => ({ name: `logo${i + 1}${extname(from)}`, from }))
  assets.push(...logos)
  const card = { color: brand.color, accent: brand.accent, logos: logos.map((l) => `assets/${l.name}`) }
  const w2 = wordsFor(lang)
  const intro: Card = { ...card, title, subtitle: bookTitle, foot: [docTitle, brand.developer], icon: icon ? `assets/icon${extname(icon)}` : undefined, done: false }
  const outro: Card = { ...card, title: w2.done, subtitle: w2.more(pageTitle), foot: [bookTitle, brand.developer], done: true }
  const look: Look = { accent: card.accent, intro, outro, lang }
  const html = compositionHtml(plan, look)

  const segments: Segment[] = [
    { caption: title, start: 0, end: INTRO * 1000 },
    ...plan.steps.map((s) => ({ caption: `${s.n}. ${s.caption}`, start: s.start * 1000, end: s.end * 1000 })),
    { caption: w2.done, start: plan.outroStart * 1000, end: plan.total * 1000 },
  ]
  const hash = createHash('sha256').update(BUILDER_VERSION).update(HYPERFRAMES).update(html)
  for (const a of assets) hash.update(a.name).update(readFileSync(a.from))
  return { ok: true, plan, html, vtt: toVtt(segments), assets, hash: hash.digest('hex').slice(0, 16), title }
}

export interface BuildResult {
  built: { lang: string; id: string; seconds: number; dir: string }[]
  skipped: { lang: string; id: string; reason: string }[]
}

export async function runWalkthroughBuild(project: Project, opts: { only?: string; lang?: string; render?: boolean; changed?: boolean } = {}): Promise<BuildResult> {
  const { config, manualDir } = project
  const render = opts.render !== false
  if (!hasClips(config.media)) throw new UsageError(`walkthroughs are shown as clips, which need media level "steps+video" (now "${config.media}")`)
  if (render && !hasFfmpeg()) throw new UsageError('ffmpeg not found (install it, or set FFMPEG=/path/to/ffmpeg)')
  const shots = loadShots(manualDir)
  if (opts.only && !shots.walkthroughs[opts.only]) throw new UsageError(`walkthrough "${opts.only}" is not in shots.yaml (${Object.keys(shots.walkthroughs).join(', ') || 'none defined'})`)
  const boxes = readBoxes(manualDir)
  const manifest = readManifest(manualDir)
  const result: BuildResult = { built: [], skipped: [] }
  const posters: { png: string; webp: string }[] = []
  try {
    for (const lang of config.languages) {
      if (opts.lang && opts.lang !== lang) continue
      for (const id of Object.keys(shots.walkthroughs)) {
        if (opts.only && id !== opts.only) continue
        const src = walkthroughSource(project, shots, boxes, lang, id)
        if (!src.ok) {
          result.skipped.push({ lang, id, reason: src.problems.join('; ') })
          continue
        }
        const f = clipFiles(lang, id)
        const fresh = manifest[manifestKey(lang, 'walkthrough', id)] === src.hash && [f.mp4, f.poster, f.webp, f.vtt].every((x) => existsSync(join(manualDir, x)))
        if (opts.changed && fresh) continue
        const dir = join(manualDir, config.outputs.dir, '.build', 'walkthroughs', `${lang}-${id}`)
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(join(dir, 'assets'), { recursive: true })
        for (const a of src.assets) copyFileSync(a.from, join(dir, 'assets', a.name))
        writeFileSync(join(dir, 'index.html'), src.html)
        writeFileSync(join(dir, 'assets', 'music.wav'), musicWav(src.plan.total, seedOf(id)))
        if (render) {
          // the bed sits quietly under the reading, like the clips' (EBU R128 loudness)
          const raw = join(dir, 'music.raw.wav')
          copyFileSync(join(dir, 'assets', 'music.wav'), raw)
          execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `loudnorm=I=${MUSIC_LUFS}:TP=-2:LRA=7,aresample=48000`, '-ar', '48000', join(dir, 'assets', 'music.wav')], { stdio: ['ignore', 'ignore', 'pipe'] })
          rmSync(raw)
          renderComposition(dir, join(manualDir, f.mp4))
          execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', POSTER_AT.toFixed(3), '-i', join(manualDir, f.mp4), '-frames:v', '1', join(manualDir, f.poster)], { stdio: ['ignore', 'ignore', 'pipe'] })
          posters.push({ png: join(manualDir, f.poster), webp: join(manualDir, f.webp) })
          writeFileSync(join(manualDir, f.vtt), src.vtt)
          // the clip's length for the player and the transcript, in the shape of a ready-made video's timeline
          mkdirSync(join(manualDir, clipTimeline(lang, id), '..'), { recursive: true })
          const timeline = { width: src.plan.width, height: src.plan.height, frames: [{ file: f.mp4, ms: Math.round(src.plan.total * 1000), segment: 0, end: true }], video: true }
          writeFileSync(join(manualDir, clipTimeline(lang, id)), `${JSON.stringify(timeline, null, 2)}\n`)
          manifest[manifestKey(lang, 'walkthrough', id)] = src.hash
        }
        result.built.push({ lang, id, seconds: src.plan.total, dir })
      }
    }
    if (posters.length) await stillWebps(posters)
  } finally {
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : 1)))
    mkdirSync(join(manualDir, 'media'), { recursive: true })
    writeFileSync(join(manualDir, MANIFEST_FILE), `${JSON.stringify(sorted, null, 2)}\n`)
  }
  return result
}

/** One render with the pinned HyperFrames CLI (npx downloads it once); output straight to `out`. */
function renderComposition(dir: string, out: string): void {
  const env = {
    ...process.env,
    HYPERFRAMES_SKIP_SKILLS: '1',
    HYPERFRAMES_NO_TELEMETRY: '1',
    // a pinned release: no update check, no telemetry
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    DO_NOT_TRACK: '1',
    ...(process.env.FFMPEG ? { HYPERFRAMES_FFMPEG_PATH: process.env.FFMPEG } : {}),
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const r = spawnSync(npx, ['--yes', HYPERFRAMES, 'render', `--workers=${Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)))}`, '--quiet', '-o', out, dir], { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (r.status !== 0 || !existsSync(out)) {
    const tail = `${r.stderr ?? ''}${r.stdout ?? ''}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim().split('\n').slice(-8).join('\n')
    throw new UsageError(`HyperFrames render failed in ${dir} (exit ${r.status ?? r.signal}):\n${tail}`)
  }
}

/** The poster as a small WebP (the web's cover image), encoded by Chromium. */
async function stillWebps(list: { png: string; webp: string }[]): Promise<void> {
  const browser = await playwright.chromium.launch()
  try {
    const page = await browser.newPage()
    for (const { png, webp } of list) {
      const data = await page.evaluate(
        async ({ src, w }) => {
          const img = new Image()
          img.src = src
          await img.decode()
          const c = document.createElement('canvas')
          c.width = w
          c.height = Math.round((img.naturalHeight * w) / img.naturalWidth)
          const g = c.getContext('2d', { alpha: false })!
          g.imageSmoothingQuality = 'high'
          g.drawImage(img, 0, 0, c.width, c.height)
          return c.toDataURL('image/webp', 0.8).split(',')[1]!
        },
        { src: `data:image/png;base64,${readFileSync(png).toString('base64')}`, w: POSTER_WEBP_WIDTH },
      )
      writeFileSync(webp, Buffer.from(data, 'base64'))
    }
  } finally {
    await browser.close()
  }
}
