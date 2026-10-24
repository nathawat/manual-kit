// capture: Playwright screenshots of the running product, only on allowlisted hosts.
// Images: media/<lang>/<id>.png and media/<lang>/<id>-<n>.png; media/manifest.json records the spec hash of each.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { BrowserContext, Locator, Page, Request } from 'playwright'
import { lazyDep } from './deps.ts'
import { bare, CaptureFailure, explainSelector, failureReport, firstLine, resetFailures } from './capture-failure.ts'
import { localize, REDACT_PRESETS, type ManualConfig } from './config.ts'
import { parseTranscript, terminalHtml } from './terminal.ts'
import { matchesAny } from './coverage.ts'
import { probeVideo } from './media/probe.ts'
import { checkedFetch } from './redirects.ts'
import { actionTarget, targetBox, type Need } from './target.ts'
import type { Project } from './project.ts'
import { UsageError } from './sign.ts'
import {
  MANIFEST_FILE,
  OPTIONAL_MS,
  TERMINAL_VIEWPORT,
  authPath,
  clipDir,
  clipTimeline,
  hasClips,
  hasSteps,
  isSaved,
  loadShots,
  manifestKey,
  readManifest,
  shotPath,
  specHash,
  stepPath,
  type Action,
  type ActionLogin,
  type ClipSpec,
  type SavedLogin,
  type ShotSpec,
  type Signal,
  specActions,
  uploadFiles,
  type StepsSpec,
  type Storage,
  type TerminalSpec,
  type Manifest,
  type Shots,
} from './shots.ts'

const playwright = lazyDep<typeof import('playwright')>('playwright')

/** Is this URL's host on the allowlist? `*.example.com` matches subdomains. Only http(s). */
export function allowed(url: string, allowlist: string[]): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  return allowlist.some((h) => (h.startsWith('*.') ? u.hostname.endsWith(h.slice(1)) : u.hostname === h))
}

const fill = (s: string, lang: string) => expandEnv(s.replace(/\{lang\}/g, lang))

/** `{env:NAME}` -> the environment variable, so passwords never live in shots.yaml. */
export function expandEnv(s: string, env: NodeJS.ProcessEnv = process.env): string {
  return s.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    const v = env[name]
    if (v === undefined) throw new UsageError(`environment variable ${name} is not set (used as {env:${name}} in shots.yaml)`)
    return v
  })
}
export const absolute = (cfg: ManualConfig, url: string, lang: string) => new URL(fill(url, lang), cfg.capture.baseUrl.replace(/\/?$/, '/')).href

/** Resolves when the page shows `signal` (across navigations); timeout 0 waits for good. */
export async function waitForSignal(page: Page, signal: Signal, cfg: ManualConfig, lang: string, timeout: number) {
  if ('selector' in signal) await page.locator(signal.selector).first().waitFor({ timeout })
  else {
    const prefix = absolute(cfg, signal.url, lang)
    await page.waitForURL((u) => u.href.startsWith(prefix), { timeout, waitUntil: 'commit' })
  }
}

/** Absolute path of a login's saved session. */
export const authFile = (manualDir: string, name: string) => join(manualDir, authPath(name))
const loginCommand = (name: string) => `manual-kit login ${name}`
const noSession = (manualDir: string, name: string) =>
  new UsageError(`login "${name}": no saved session (${relative(process.cwd(), authFile(manualDir, name))} does not exist); sign in by hand with: ${loginCommand(name)}`)
/** How long capture waits for a saved login's check on the start page. */
const CHECK_MS = 10_000

/** Why a job runs: no manifest entry, a spec hash that differs, an image gone from disk, or none of these (no --changed). */
export type JobReason = 'new' | 'spec changed' | 'file missing' | 'forced'

export interface CaptureJob {
  lang: string
  kind: 'shot' | 'steps' | 'clip'
  id: string
  hash: string
  files: string[]
  reason: JobReason
}

/** A clip's timeline and, once captured, the frames it lists: a deleted frame makes the clip missing too. */
function clipCaptured(manualDir: string, lang: string, id: string): string[] {
  const timeline = clipTimeline(lang, id)
  const file = join(manualDir, timeline)
  if (!existsSync(file)) return [timeline]
  const t = JSON.parse(readFileSync(file, 'utf8')) as Timeline & { video?: true }
  // a ready-made video's frame is the source file itself, not something capture makes
  return t.video ? [timeline] : [timeline, ...t.frames.map((f) => `${clipDir(lang, id)}/${f.file}`)]
}

/** Every image, step set and clip capture could take, each with the reason it is due. */
export function captureJobs(project: Project, shots: Shots, manifest: Manifest): CaptureJob[] {
  const { config, manualDir } = project
  if (config.media === 'none') return []
  const job = (lang: string, kind: CaptureJob['kind'], id: string, spec: ShotSpec | StepsSpec | ClipSpec, files: string[]): CaptureJob => {
    const hash = specHash(spec, shots.logins)
    const stored = manifest[manifestKey(lang, kind, id)]
    const reason: JobReason =
      stored === undefined ? 'new' : stored !== hash ? 'spec changed' : files.some((f) => !existsSync(join(manualDir, f))) ? 'file missing' : 'forced'
    return { lang, kind, id, hash, files, reason }
  }
  const jobs: CaptureJob[] = []
  for (const lang of config.languages) {
    for (const [id, spec] of Object.entries(shots.shots)) jobs.push(job(lang, 'shot', id, spec, [shotPath(lang, id)]))
    if (hasSteps(config.media))
      for (const [id, spec] of Object.entries(shots.steps)) jobs.push(job(lang, 'steps', id, spec, spec.steps.map((_, i) => stepPath(lang, id, i + 1))))
    if (hasClips(config.media)) for (const [id, spec] of Object.entries(shots.clips)) jobs.push(job(lang, 'clip', id, spec, clipCaptured(manualDir, lang, id)))
  }
  return jobs
}

/** Edit distance, for naming the ids close to a pattern that matched none. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]!
}

/**
 * Keep the jobs whose id matches a pattern (`*` globs). Every pattern must match an id among `all` (the jobs before
 * --changed), so a typo stops the run with the closest ids instead of capturing nothing.
 */
function selectJobs(all: CaptureJob[], jobs: CaptureJob[], only: string[]): CaptureJob[] {
  const ids = [...new Set(all.map((j) => j.id))]
  for (const p of only) {
    if (ids.some((id) => matchesAny(id, [p]))) continue
    const literal = p.replaceAll('*', '')
    // a glob only fixes part of the id: compare with the id's closest prefix
    const near = (id: string) =>
      literal && id.includes(literal) ? 0 : p.includes('*') ? Math.min(...Array.from({ length: id.length + 1 }, (_, k) => distance(literal, id.slice(0, k)))) : distance(literal, id)
    const close = ids
      .filter((id) => near(id) <= Math.max(2, Math.ceil(literal.length / 3)))
      .sort((a, b) => near(a) - near(b) || (a < b ? -1 : 1))
      .slice(0, 5)
    const hint = close.length ? `close ids: ${close.join(', ')}` : `ids: ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ', ...' : ''}`
    throw new UsageError(`--only "${p}" matches no shot, step set or clip; ${hint}`)
  }
  return jobs.filter((j) => matchesAny(j.id, only))
}

/**
 * Run one action (`dir`: the manual folder, which upload paths are relative to); returns a note when its display:
 * contents target held several elements that could take it.
 */
async function act(page: Page, a: Action, cfg: ManualConfig, lang: string, dir: string): Promise<string | undefined> {
  let note: string | undefined
  const on = async (verb: string, selector: string, need: Need) => {
    const t = await actionTarget(page, verb, selector, need)
    note = t.note
    return t.locator
  }
  if ('click' in a) await (await on('click', a.click, 'click')).click()
  else if ('fill' in a) await (await on('fill', a.fill, 'fill')).fill(fill(a.value, lang))
  else if ('press' in a) await (a.on ? (await on('press on', a.on, 'focus')).press(a.press) : page.keyboard.press(a.press))
  else if ('select' in a) await (await on('select', a.select, 'select')).selectOption('value' in a ? { value: fill(a.value, lang) } : { label: fill(a.label, lang) })
  else if ('check' in a) await (await on('check', a.check, 'check')).check()
  else if ('uncheck' in a) await (await on('uncheck', a.uncheck, 'check')).uncheck()
  else if ('hover' in a) await page.hover(a.hover)
  else if ('upload' in a) await upload(page, await on('upload', a.upload, 'click'), uploadFiles(a).map((f) => join(dir, f)))
  else if ('drag' in a) await drag(page, await on('drag', a.drag, 'click'), a.to, a.offset)
  else if ('wait' in a) await page.waitForSelector(a.wait)
  else if ('waitMs' in a) await page.waitForTimeout(a.waitMs)
  else if ('goto' in a) await goto(page, absolute(cfg, a.goto, lang), cfg)
  else if ('show' in a) await page.evaluate(({ n, output }) => (window as unknown as { __mkShow(n: number, o?: boolean): void }).__mkShow(n, output), { n: a.show, output: a.output })
  return note
}

/** An <input type=file> takes the files directly; anything else is clicked and the file chooser it opens takes them. */
async function upload(page: Page, loc: Locator, files: string[]) {
  if (await loc.evaluate((e) => e instanceof HTMLInputElement && e.type === 'file')) return loc.setInputFiles(files)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), loc.click()])
  await chooser.setFiles(files)
}

/** Mouse down, move in steps, up: pointer-based editors and React DnD see a real drag, which locator.dragTo may not give them. */
async function drag(page: Page, source: Locator, to: string, offset: { x: number; y: number } | undefined) {
  await source.scrollIntoViewIfNeeded()
  const from = await targetBox(source, 5_000)
  if (!from) throw new Error('the element has no box on the page')
  const box = await targetBox(page.locator(to), 5_000).catch(async (e: unknown) => {
    throw await explainSelector(page, 'drag to', to, e)
  })
  if (!box) throw await explainSelector(page, 'drag to', to, new Error('the element has no box on the page'))
  const end = offset ? { x: box.x + offset.x, y: box.y + offset.y } : { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const view = page.viewportSize()!
  if (end.x < 0 || end.y < 0 || end.x >= view.width || end.y >= view.height)
    throw new CaptureFailure(`drag to ${JSON.stringify(to)}: the drop point is outside the window once the source is in view; use a larger viewport`)
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // a few pixels first: libraries start a drag only past a movement threshold
  await page.mouse.move(start.x + 6, start.y + 6, { steps: 2 })
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

/** The element an action works on, named as in shots.yaml. */
function target(a: Action): [verb: string, selector: string] | undefined {
  if ('click' in a) return ['click', a.click]
  if ('fill' in a) return ['fill', a.fill]
  if ('press' in a) return a.on ? ['press on', a.on] : undefined
  if ('select' in a) return ['select', a.select]
  if ('check' in a) return ['check', a.check]
  if ('uncheck' in a) return ['uncheck', a.uncheck]
  if ('hover' in a) return ['hover', a.hover]
  if ('upload' in a) return ['upload', a.upload]
  if ('drag' in a) return ['drag', a.drag]
  if ('wait' in a) return ['wait', a.wait]
  return undefined
}

/** Does the selector show a visible element within `ms`? A selector Playwright cannot parse still throws. */
const appears = (page: Page, selector: string, ms: number) =>
  page
    .locator(selector)
    .first()
    .waitFor({ state: 'visible', timeout: ms })
    .then(
      () => true,
      (e: Error) => {
        if (e.name === 'TimeoutError') return false
        throw e
      },
    )

/** What running actions left to report: optional ones skipped (`optional click "#x"`) and notes for --verbose. */
interface Ran {
  skipped: string[]
  notes: string[]
}

/**
 * Run actions in order; a failed one says what its selector matched instead. An optional action whose target does
 * not appear is skipped, not failed.
 */
async function run(page: Page, actions: Action[], cfg: ManualConfig, lang: string, dir: string): Promise<Ran> {
  const ran: Ran = { skipped: [], notes: [] }
  for (const a of actions) {
    const t = target(a)
    try {
      if ('optional' in a && a.optional && t && !(await appears(page, t[1], OPTIONAL_MS))) {
        ran.skipped.push(`optional ${t[0]} "${t[1]}"`)
        continue
      }
      const note = await act(page, a, cfg, lang, dir)
      if (note) ran.notes.push(note)
    } catch (e) {
      // a CaptureFailure already names its selector (drag's `to`)
      if (e instanceof UsageError || e instanceof CaptureFailure || !t) throw e
      throw await explainSelector(page, t[0], t[1], e)
    }
  }
  return ran
}

/**
 * Requests a browser context has open (by host), when that last changed, and the hosts the allowlist refused in it.
 * `escaped` is a host outside the allowlist that a request reached anyway, by a redirect the browser followed itself.
 */
export interface Traffic {
  open: Map<Request, string>
  changed: number
  blocked: Set<string>
  escaped?: string
}
/** Streams that stay open for the life of the page; waiting for them would never end. */
const STREAMS = new Set(['eventsource', 'websocket', 'media'])
/** The network counts as idle after this long without a request starting or ending (as Playwright's networkidle). */
const QUIET_MS = 500

function watchTraffic(context: BrowserContext): Traffic {
  const t: Traffic = { open: new Map(), changed: Date.now(), blocked: new Set() }
  context.on('request', (r) => {
    if (STREAMS.has(r.resourceType())) return
    t.open.set(r, URL.canParse(r.url()) ? new URL(r.url()).host : r.url())
    t.changed = Date.now()
  })
  const done = (r: Request) => {
    if (t.open.delete(r)) t.changed = Date.now()
  }
  context.on('requestfinished', done)
  context.on('requestfailed', done)
  return t
}

/** In the page: are the web fonts loaded, and which loading-indicator selectors match a visible element. */
function pageState(selectors: string[]) {
  const spinners: string[] = []
  for (const s of selectors) {
    let els: NodeListOf<Element>
    try {
      els = document.querySelectorAll(s)
    } catch {
      return { invalid: s, fonts: true, spinners }
    }
    if ([...els].some((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) spinners.push(s)
  }
  return { invalid: undefined, fonts: document.fonts.status === 'loaded', spinners }
}

/**
 * Wait until the page is ready to photograph (capture.settle): network quiet, fonts loaded, no loading indicator.
 * Returns what was still pending when the time ran out, or undefined when the page settled.
 */
async function settle(page: Page, traffic: Traffic, s: ManualConfig['capture']['settle']): Promise<string | undefined> {
  if (!s.timeoutMs) return undefined
  const deadline = Date.now() + s.timeoutMs
  for (;;) {
    const state = await page.evaluate(pageState, s.spinners).catch(() => undefined)
    if (state?.invalid) throw new UsageError(`capture.settle.spinners: "${state.invalid}" is not a CSS selector`)
    const busy = s.networkIdle && (traffic.open.size > 0 || Date.now() - traffic.changed < QUIET_MS)
    if (state?.fonts && !state.spinners.length && !busy) return undefined
    if (Date.now() >= deadline) {
      const pending: string[] = []
      if (!state) pending.push('the page was still navigating')
      const hosts = new Map<string, number>()
      if (s.networkIdle) for (const h of traffic.open.values()) hosts.set(h, (hosts.get(h) ?? 0) + 1)
      for (const [h, n] of hosts) pending.push(`${n} request${n > 1 ? 's' : ''} to ${h} still open`)
      if (busy && !hosts.size) pending.push('requests kept starting')
      for (const sp of state?.spinners ?? []) pending.push(`spinner ${sp} still visible`)
      if (state && !state.fonts) pending.push('web fonts still loading')
      return `page did not settle within ${s.timeoutMs / 1000}s, image taken anyway: ${pending.join('; ')}`
    }
    await page.waitForTimeout(100)
  }
}

/** A terminal spec's page: the transcript rendered as a window (a clip's window fills the viewport, so frames match). */
async function openTerminal(page: Page, t: TerminalSpec, project: Project, lang: string, fill: boolean) {
  const file = join(project.manualDir, t.file)
  if (!existsSync(file)) throw new UsageError(`terminal transcript "${t.file}" does not exist`)
  const loc = (v: TerminalSpec['title']) => (v === undefined ? undefined : localize(v, lang, project.primary))
  const html = terminalHtml(parseTranscript(readFileSync(file, 'utf8'), t.prompt), { title: loc(t.title), badge: loc(t.badge), prompt: t.prompt })
  await page.setContent(fill ? html.replace('<html>', '<html class="mk-fill">') : html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
}

/** The page is on, or tried to go to, a host outside capture.allowlist. */
export class OffAllowlist extends CaptureFailure {
  readonly host: string
  constructor(host: string) {
    super(`the page went to ${host}, outside capture.allowlist`)
    this.host = host
  }
}

/** The host each page's last refused navigation (the page itself, not a frame in it) tried to go to. */
const refusedPage = new WeakMap<Page, string>()

/**
 * Before an image and after a goto: the page is on an allowlisted host, whatever got it there. A refused navigation
 * leaves the browser's error page, so the host it was refused for is the one to name.
 */
export function onAllowlist(page: Page, cfg: ManualConfig) {
  const url = page.url()
  if (!allowed(url, cfg.capture.allowlist)) throw new OffAllowlist(refusedPage.get(page) ?? new URL(url).hostname)
}

export async function goto(page: Page, url: string, cfg: ManualConfig) {
  if (!allowed(url, cfg.capture.allowlist)) throw new UsageError(`${new URL(url).hostname} is not in capture.allowlist`)
  refusedPage.delete(page)
  await page.goto(url, { waitUntil: 'load' }).catch((e: unknown) => {
    const host = refusedPage.get(page)
    throw host ? new OffAllowlist(host) : e
  })
  onAllowlist(page, cfg)
}

/**
 * CSS that hides each selector, one rule per selector so a selector the browser rejects drops only its own rule.
 * Selectors that could end a rule are refused when config and shots.yaml load (CssSelector).
 */
const hideCss = (selectors: string[]) => selectors.map((s) => `${s} { visibility: hidden !important; pointer-events: none !important; }`).join('\n')

/** In the page (init script): dev overlays stay hidden from the start, so they never catch a click either. */
function hideOverlays(css: string) {
  const add = () => {
    const st = document.createElement('style')
    st.dataset.manualKit = 'hide'
    st.textContent = css
    document.documentElement.appendChild(st)
  }
  if (document.documentElement) add()
  else document.addEventListener('DOMContentLoaded', add, { once: true })
}

/** Frames of a clip and how long each stays on screen; `encode` turns it into video. */
export interface Timeline {
  width: number
  height: number
  /** `box`: the highlighted element on that frame, in frame pixels (end frames; encode keeps captions off it). */
  frames: { file: string; ms: number; segment: number; end?: true; box?: Box }[]
}
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const specOf = (shots: Shots, j: CaptureJob) => (j.kind === 'shot' ? shots.shots[j.id]! : j.kind === 'steps' ? shots.steps[j.id]! : shots.clips[j.id]!)

const OVERLAY = 'manual-kit-highlight'
/**
 * Red frame around the element; for a step, a numbered badge at its corner matches the step number in the text.
 * Returns the element's box in the viewport.
 */
async function highlight(page: Page, selector: string | undefined, label?: number): Promise<Box | undefined> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY)
  if (!selector) return undefined
  const box = await targetBox(page.locator(selector).first(), 5_000).catch(async (e: unknown) => {
    throw await explainSelector(page, 'highlight', selector, e)
  })
  if (!box) throw await explainSelector(page, 'highlight', selector, new Error('the element has no box on the page'))
  // inside an open modal dialog the page body is below the top layer: draw the frame as a popover above it
  const inModal = await page
    .locator(selector)
    .first()
    .evaluate((e) => !!e.closest('dialog:modal'))
    .catch(() => false)
  await page.evaluate(
    ({ id, b, label, inModal }) => {
      const d = document.createElement('div')
      d.id = id
      if (inModal) d.setAttribute('popover', 'manual')
      Object.assign(d.style, {
        position: inModal ? 'fixed' : 'absolute',
        margin: '0',
        padding: '0',
        inset: 'auto',
        background: 'transparent',
        overflow: 'visible',
        left: `${b.x + (inModal ? 0 : window.scrollX) - 5}px`,
        top: `${b.y + (inModal ? 0 : window.scrollY) - 5}px`,
        width: `${b.width + 10}px`,
        height: `${b.height + 10}px`,
        border: '3px solid #d1242f',
        borderRadius: '8px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: '2147483647',
      })
      if (label !== undefined) {
        const n = document.createElement('span')
        n.textContent = String(label)
        Object.assign(n.style, {
          position: 'absolute',
          left: '-15px',
          top: '-15px',
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: '#d1242f',
          color: '#fff',
          font: '700 15px/26px system-ui, sans-serif',
          textAlign: 'center',
          boxShadow: '0 0 0 2px #fff',
        })
        d.appendChild(n)
      }
      document.body.appendChild(d)
      if (inModal) d.showPopover()
    },
    { id: OVERLAY, b: box, label, inModal },
  )
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}

const REDACT = 'manual-kit-redact'
/**
 * Covers private data in the current page state: a box over every match of `patterns` in a text node or an input's
 * value, and over every element matching `selectors`. `blur` blurs what is under the box (backdrop-filter), `box` paints it
 * grey. The page's own DOM is not touched, so the app keeps working between the frames of steps and clips.
 */
async function redact(page: Page, r: ManualConfig['capture']['redact']) {
  const patterns = [...r.presets.map((p) => REDACT_PRESETS[p]), ...r.text]
  if (!patterns.length && !r.images.length) return
  const boxes: (Box & { modal: boolean })[] = []
  for (const sel of r.images)
    for (const el of await page.locator(sel).all()) {
      const b = await targetBox(el, 1_000).catch(() => null)
      if (b) boxes.push({ ...b, modal: await el.evaluate((e) => !!e.closest('dialog:modal')) })
    }
  await page.evaluate(
    ({ id, patterns, boxes, style }) => {
      const res = patterns.map((p) => new RegExp(p, 'g'))
      const all = [...boxes]
      const push = (b: DOMRect, e: Element) => {
        if (b.width > 0 && b.height > 0) all.push({ x: b.x, y: b.y, width: b.width, height: b.height, modal: !!e.closest('dialog:modal') })
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement
        if (!el || el.closest('script, style, noscript, #manual-kit-highlight')) continue
        const text = n.textContent ?? ''
        for (const re of res)
          for (const m of text.matchAll(re)) {
            if (!m[0]) continue
            const range = document.createRange()
            range.setStart(n, m.index)
            range.setEnd(n, m.index + m[0].length)
            for (const b of range.getClientRects()) push(b, el)
          }
      }
      for (const input of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
        if (res.some((re) => input.value.match(re))) push(input.getBoundingClientRect(), input)
      for (const b of all) {
        const d = document.createElement('div')
        d.className = id
        if (b.modal) d.setAttribute('popover', 'manual')
        Object.assign(d.style, {
          position: b.modal ? 'fixed' : 'absolute',
          margin: '0',
          padding: '0',
          border: '0',
          inset: 'auto',
          left: `${b.x + (b.modal ? 0 : window.scrollX) - 2}px`,
          top: `${b.y + (b.modal ? 0 : window.scrollY) - 2}px`,
          width: `${b.width + 4}px`,
          height: `${b.height + 4}px`,
          borderRadius: '3px',
          pointerEvents: 'none',
          zIndex: '2147483646',
          ...(style === 'blur' ? { background: 'transparent', backdropFilter: 'blur(10px)' } : { background: '#9aa3ad' }),
        })
        document.body.appendChild(d)
        if (b.modal) d.showPopover()
      }
    },
    { id: REDACT, patterns, boxes, style: r.style },
  )
}
const unredact = (page: Page) => page.evaluate((id) => document.querySelectorAll(`.${id}`).forEach((e) => e.remove()), REDACT)

/** A clip as frames: one at the start, one after every action, one with the highlight at the end of each segment. */
async function recordClip(
  page: Page,
  spec: ClipSpec,
  job: CaptureJob,
  cfg: ManualConfig,
  shoot: (rel: string) => Promise<void>,
  ready: (label: string) => Promise<void>,
  manualDir: string,
): Promise<Ran> {
  const dir = clipDir(job.lang, job.id)
  rmSync(join(manualDir, dir), { recursive: true, force: true })
  mkdirSync(join(manualDir, dir), { recursive: true })
  const ran = await run(page, spec.setup, cfg, job.lang, manualDir)
  const frames: Timeline['frames'] = []
  const frame = async (segment: number, ms: number, end = false, box?: Box) => {
    const file = `frame-${String(frames.length + 1).padStart(3, '0')}.png`
    await shoot(`${dir}/${file}`)
    frames.push({ file, ms, segment, ...(end ? { end: true as const } : {}), ...(box ? { box } : {}) })
  }
  for (const [i, seg] of spec.segments.entries()) {
    await highlight(page, undefined)
    if (i === 0) {
      await ready('segment 1')
      await frame(0, 1200)
    }
    for (const a of seg.actions) {
      const one = await run(page, [a], cfg, job.lang, manualDir)
      ran.notes.push(...one.notes)
      // a skipped action changed nothing on screen, so it gets no frame
      if (one.skipped.length) {
        ran.skipped.push(...one.skipped)
        continue
      }
      await ready(`segment ${i + 1}`)
      await frame(i, 900)
    }
    await frame(i, seg.holdMs, true, await highlight(page, seg.highlight))
  }
  await highlight(page, undefined)
  const size = page.viewportSize() ?? cfg.capture.viewport
  const timeline: Timeline = { width: size.width, height: size.height, frames }
  writeFileSync(join(manualDir, clipTimeline(job.lang, job.id)), `${JSON.stringify(timeline, null, 2)}\n`)
  return ran
}

/** The page region to photograph when a spec crops or limits the height; undefined means the plain viewport or element shot. */
type Frame = Pick<ShotSpec, 'element' | 'crop' | 'maxHeight'>
async function frameClip(page: Page, f: Frame) {
  let box = f.crop
  if (!box && f.element) {
    const el = page.locator(f.element).first()
    if (!(await el.boundingBox())) {
      // a display: contents element has no box to scroll to or photograph: frame what it renders
      const b = await targetBox(el, 5_000)
      if (!b) throw await explainSelector(page, 'element', f.element, new Error('the element has no box on the page'))
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
      box = { x: Math.round(b.x + scroll.x), y: Math.round(b.y + scroll.y), width: Math.round(b.width), height: Math.round(b.height) }
    } else if (f.maxHeight) {
      await el.scrollIntoViewIfNeeded()
      box = await el.evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) }
      })
    }
  }
  if (!box && !f.maxHeight) return undefined
  if (!box) {
    const v = page.viewportSize()!
    box = { x: 0, y: await page.evaluate(() => Math.round(scrollY)), width: v.width, height: v.height }
  }
  return { ...box, height: Math.min(box.height, f.maxHeight ?? box.height) }
}

/** The parts of a spec that decide how its page is opened. */
type SessionSpec = Pick<ShotSpec, 'login' | 'storage' | 'viewport' | 'terminal'>

/**
 * A browser that reaches only allowlisted hosts (asset hosts for subresources), with the config's localStorage, dev
 * overlays hidden, and each named login run once per language. `open` gives a page in a spec's state before its URL
 * is loaded, with its traffic; `blocked` collects the hosts that were refused, `missingCss` the stylesheets among them.
 */
export async function openSession(project: Project, shots: Shots, blocked: Set<string>) {
  const { config } = project
  const browser = await playwright.chromium.launch()
  type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>
  /** Signed-in state per `<lang>/<login>` (action logins) or per `<login>` (saved logins, the same in every language). */
  const sessions = new Map<string, StorageState>()
  /** What login actions left to report, as `<lang> login <name>: optional click "#x"`. */
  const ran: Ran = { skipped: [], notes: [] }
  const origin = new URL(config.capture.baseUrl).origin

  const openContext = async (lang: string, viewport: { width: number; height: number } | undefined, storageState: StorageState | undefined, missingCss: string[]) => {
    // a service worker could answer requests before the route below sees them
    const context = await browser.newContext({
      viewport: viewport ?? config.capture.viewport,
      deviceScaleFactor: 1,
      locale: lang,
      serviceWorkers: 'block',
      ...(storageState ? { storageState } : {}),
    })
    const traffic = watchTraffic(context)
    const ok = (req: Request, url: string) => allowed(url, config.capture.allowlist) || (!req.isNavigationRequest() && allowed(url, config.capture.assetHosts))
    const refuse = (req: Request, url: string, from?: string) => {
      const u = new URL(url)
      blocked.add(u.host)
      traffic.blocked.add(from ? `${u.hostname} (redirect from ${new URL(from).host}${new URL(from).pathname})` : u.hostname)
      if (req.resourceType() === 'stylesheet') missingCss.push(url)
      if (req.isNavigationRequest() && !req.frame().parentFrame()) refusedPage.set(req.frame().page(), u.hostname)
    }
    const answer = checkedFetch(context)
    await context.route('**/*', async (route) => {
      const req = route.request()
      if (!ok(req, req.url())) {
        refuse(req, req.url())
        return route.abort('blockedbyclient')
      }
      // an event stream never ends, so it cannot be fetched here first; its redirects are checked below
      if (req.resourceType() === 'eventsource') return route.continue()
      // the browser does not hand over the files in a form body it reads from disk, so a fetch here would send the form
      // without them; its redirects are checked below
      if (/^multipart\/form-data/i.test(req.headers()['content-type'] ?? '')) return route.continue()
      return answer(route, (url) => ok(req, url), (url, from) => refuse(req, url, from))
    })
    context.on('request', (req) => {
      if (!req.redirectedFrom() || ok(req, req.url())) return
      refuse(req, req.url(), req.redirectedFrom()!.url())
      traffic.escaped = new URL(req.url()).hostname
    })
    await applyStorage(context, { localStorage: config.capture.localStorage, sessionStorage: {}, cookies: [] }, lang)
    if (config.capture.hide.length) await context.addInitScript(hideOverlays, hideCss(config.capture.hide))
    return { context, traffic }
  }
  /** localStorage / sessionStorage before any page script runs; cookies for the base URL's origin. */
  const applyStorage = async (context: BrowserContext, st: Storage | undefined, lang: string) => {
    if (!st) return
    const local = Object.fromEntries(Object.entries(st.localStorage).map(([k, v]) => [k, fill(v, lang)]))
    const session = Object.fromEntries(Object.entries(st.sessionStorage).map(([k, v]) => [k, fill(v, lang)]))
    if (Object.keys(local).length || Object.keys(session).length)
      await context.addInitScript(
        ({ local, session }: { local: Record<string, string>; session: Record<string, string> }) => {
          for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v)
          for (const [k, v] of Object.entries(session)) sessionStorage.setItem(k, v)
        },
        { local, session },
      )
    if (st.cookies.length) await context.addCookies(st.cookies.map((c) => ({ name: c.name, value: fill(c.value, lang), url: `${origin}${c.path}` })))
  }
  /** Run a named login once per language; its cookies and localStorage are reused by every shot that names it. */
  const signIn = async (name: string, login: ActionLogin, lang: string, viewport: { width: number; height: number } | undefined): Promise<StorageState> => {
    const { context, traffic } = await openContext(lang, viewport, undefined, [])
    await applyStorage(context, login.storage, lang)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    try {
      await goto(page, absolute(config, login.url, lang), config)
      const r = await run(page, login.actions, config, lang, project.manualDir)
      ran.skipped.push(...r.skipped.map((s) => `${lang} login ${name}: ${s}`))
      ran.notes.push(...r.notes.map((s) => `${lang} login ${name}: ${s}`))
      return await context.storageState()
    } catch (e) {
      throw new UsageError(`login "${name}" (${lang}) failed: ${await failureReport(page, project.manualDir, `login-${name}-${lang}`, e, traffic.blocked, () => redact(page, config.capture.redact))}`)
    } finally {
      await context.close()
    }
  }
  /**
   * A saved session (manual-kit login), checked once on the start page: a session that is gone stops the run and names
   * the command that signs in again. The file is a secret: only the fact that it is missing or expired is reported.
   */
  const restore = async (name: string, login: SavedLogin, lang: string): Promise<StorageState> => {
    const file = authFile(project.manualDir, name)
    if (!existsSync(file)) throw noSession(project.manualDir, name)
    let saved: StorageState
    try {
      saved = JSON.parse(readFileSync(file, 'utf8')) as StorageState
      if (!Array.isArray(saved.cookies) || !Array.isArray(saved.origins)) throw new Error('not a storageState')
    } catch {
      throw new UsageError(`login "${name}": ${relative(process.cwd(), file)} is not a saved session; sign in again with: ${loginCommand(name)}`)
    }
    const check = login.check ?? login.until
    if (!check) return saved
    const { context } = await openContext(lang, undefined, saved, [])
    const page = await context.newPage()
    const expired = (why: string) => new UsageError(`login "${name}": the saved session has expired (${why}); sign in again with: ${loginCommand(name)}`)
    try {
      await goto(page, absolute(config, login.url, lang), config).catch((e: unknown) => {
        if (e instanceof OffAllowlist) throw expired(`the start page went to ${e.host}, outside capture.allowlist`)
        throw e instanceof UsageError ? e : new UsageError(`login "${name}": the start page did not open: ${firstLine(e)}`)
      })
      await waitForSignal(page, check, config, lang, CHECK_MS).catch(() => {
        throw expired('selector' in check ? `${check.selector} did not appear on ${bare(page.url())}` : `the start page is ${bare(page.url())}, not ${check.url}`)
      })
      return await context.storageState()
    } finally {
      await context.close()
    }
  }
  return {
    async open(spec: SessionSpec, lang: string, missingCss: string[] = []): Promise<{ context: BrowserContext; page: Page; traffic: Traffic }> {
      let state: StorageState | undefined
      if (spec.login) {
        const login = shots.logins[spec.login]!
        const key = isSaved(login) ? spec.login : `${lang}/${spec.login}`
        if (!sessions.has(key)) sessions.set(key, isSaved(login) ? await restore(spec.login, login, lang) : await signIn(spec.login, login, lang, spec.viewport))
        state = sessions.get(key)
      }
      const viewport = spec.viewport ?? (spec.terminal ? TERMINAL_VIEWPORT : undefined)
      const { context, traffic } = await openContext(lang, viewport, state, missingCss)
      await applyStorage(context, spec.storage, lang)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      return { context, page, traffic }
    },
    ran,
    close: () => browser.close(),
  }
}

/** A shot's screen as it was photographed: signed in, its URL opened, its actions run and settled (no highlight). */
export async function openShot(session: Awaited<ReturnType<typeof openSession>>, project: Project, spec: ShotSpec, lang: string) {
  const { context, page, traffic } = await session.open(spec, lang)
  await goto(page, absolute(project.config, spec.url!, lang), project.config)
  await run(page, spec.actions, project.config, lang, project.manualDir)
  await settle(page, traffic, project.config.capture.settle)
  return { context, page }
}

export interface CaptureResult {
  captured: CaptureJob[]
  failed: { job: CaptureJob; reason: string }[]
  blocked: string[]
  /** Captured, but something is off: a mask selector that matched nothing in any frame (what it should cover shows). */
  warnings: { job: CaptureJob; message: string }[]
  /** Optional actions whose target did not appear, as `<lang> <kind> <id>: optional click "#x"` (also logins). */
  skipped: string[]
  /** Which element inside a display: contents target an action went to, when several could (`--verbose`). */
  notes: string[]
}

export interface CaptureOptions {
  changed?: boolean
  /** Ids or `*` globs; empty or absent means every job. */
  only?: string[]
}

/** The jobs a run takes, after --changed and --only; reads files, opens nothing. */
function planCapture(project: Project, opts: CaptureOptions) {
  const { config } = project
  const base = config.capture.baseUrl
  if (!allowed(base, config.capture.allowlist)) throw new UsageError(`${new URL(base).hostname} is not in capture.allowlist (${config.capture.allowlist.join(', ')})`)
  const shots = loadShots(project.manualDir)
  const manifest = readManifest(project.manualDir)
  const all = captureJobs(project, shots, manifest)
  const changed = opts.changed ? all.filter((j) => j.reason !== 'forced') : all
  const jobs = opts.only?.length ? selectJobs(all, changed, opts.only) : changed
  for (const j of jobs) {
    const spec = specOf(shots, j)
    const login = spec.login ? shots.logins[spec.login]! : undefined
    for (const a of [...specActions(spec), ...(login && !isSaved(login) ? login.actions : [])])
      if ('upload' in a)
        for (const f of uploadFiles(a))
          if (!existsSync(join(project.manualDir, f)))
            throw new UsageError(`${j.kind} "${j.id}": upload ${JSON.stringify(a.upload)}: file "${f}" does not exist (upload files are relative to the manual folder)`)
  }
  return { shots, manifest, jobs }
}

/** A job as a dry run shows it: the login it signs in with and the hosts its URLs reach. */
export interface PlannedJob {
  job: CaptureJob
  login?: string
  hosts: string[]
  /** The hosts among `hosts` that capture.allowlist refuses. */
  outside: string[]
}
export interface PlannedLogin {
  name: string
  /** A saved login (manual-kit login) whose session file does not exist yet. */
  noSession: boolean
}
export interface DryRun {
  jobs: PlannedJob[]
  logins: PlannedLogin[]
  /** Every host the jobs open, sorted, and those capture.allowlist refuses. */
  hosts: string[]
  outside: string[]
}

/** What `capture` would do, from shots.yaml, the manifest and the files on disk: no browser, no seed, nothing written. */
export function dryRunCapture(project: Project, opts: CaptureOptions = {}): DryRun {
  const { config } = project
  const { shots, jobs } = planCapture(project, opts)
  const gotos = (actions: Action[]) => actions.flatMap((a) => ('goto' in a ? [a.goto] : []))
  const planned = jobs.map((job): PlannedJob => {
    const spec = specOf(shots, job)
    // a ready-made video is read from disk: no page, no login
    if (job.kind === 'clip' && shots.clips[job.id]!.video) return { job, hosts: [], outside: [] }
    const urls = [...(spec.terminal ? [] : [spec.url!]), ...gotos(specActions(spec))]
    const login = spec.login ? shots.logins[spec.login]! : undefined
    if (login) urls.push(login.url, ...(isSaved(login) ? [] : gotos(login.actions)))
    const full = urls.map((u) => absolute(config, u, job.lang))
    const hostsOf = (list: string[]) => [...new Set(list.map((u) => new URL(u).hostname))].sort()
    return { job, login: spec.login, hosts: hostsOf(full), outside: hostsOf(full.filter((u) => !allowed(u, config.capture.allowlist))) }
  })
  const names = [...new Set(planned.flatMap((p) => (p.login ? [p.login] : [])))]
  const logins = names.map((name) => ({ name, noSession: isSaved(shots.logins[name]!) && !existsSync(authFile(project.manualDir, name)) }))
  const union = (pick: (p: PlannedJob) => string[]) => [...new Set(planned.flatMap(pick))].sort()
  return { jobs: planned, logins, hosts: union((p) => p.hosts), outside: union((p) => p.outside) }
}

export async function runCapture(project: Project, opts: CaptureOptions = {}): Promise<CaptureResult> {
  const { config } = project
  const { shots, manifest, jobs } = planCapture(project, opts)
  for (const j of jobs) {
    const spec = specOf(shots, j)
    if (!spec.url) continue
    const url = absolute(config, spec.url, j.lang)
    if (!allowed(url, config.capture.allowlist)) throw new UsageError(`${j.kind} "${j.id}": ${new URL(url).hostname} is not in capture.allowlist`)
    if (spec.login) {
      const login = shots.logins[spec.login]!
      const loginUrl = absolute(config, login.url, j.lang)
      if (!allowed(loginUrl, config.capture.allowlist)) throw new UsageError(`login "${spec.login}": ${new URL(loginUrl).hostname} is not in capture.allowlist`)
      if (isSaved(login) && !existsSync(authFile(project.manualDir, spec.login))) throw noSession(project.manualDir, spec.login)
    }
  }
  if (!jobs.length) return { captured: [], failed: [], blocked: [], warnings: [], skipped: [], notes: [] }

  if (config.capture.seed) {
    const r = spawnSync(config.capture.seed, { cwd: project.projectRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    if (r.status !== 0) throw new UsageError(`seed hook failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().slice(0, 500)}`)
  }

  resetFailures(project.manualDir)
  const blocked = new Set<string>()
  const session = await openSession(project, shots, blocked)
  const captured: CaptureJob[] = []
  const failed: CaptureResult['failed'] = []
  const warnings: CaptureResult['warnings'] = []
  const ran: Ran = { skipped: [], notes: [] }
  try {
    for (const job of jobs) {
      const spec = specOf(shots, job)
      if (job.kind === 'clip' && shots.clips[job.id]!.video) {
        // a ready-made video: nothing to photograph; the timeline says how big and how long it is
        const video = shots.clips[job.id]!.video!
        const file = join(project.manualDir, video.file)
        try {
          if (!existsSync(file)) throw new UsageError(`video "${video.file}" does not exist`)
          const v = probeVideo(file)
          const timeline: Timeline = { width: v.width, height: v.height, frames: [{ file: video.file, ms: v.ms, segment: 0, end: true }] }
          rmSync(join(project.manualDir, clipDir(job.lang, job.id)), { recursive: true, force: true })
          mkdirSync(join(project.manualDir, clipDir(job.lang, job.id)), { recursive: true })
          writeFileSync(join(project.manualDir, clipTimeline(job.lang, job.id)), `${JSON.stringify({ ...timeline, video: true }, null, 2)}\n`)
          manifest[manifestKey(job.lang, job.kind, job.id)] = job.hash
          captured.push(job)
        } catch (e) {
          failed.push({ job, reason: (e as Error).message })
        }
        continue
      }
      const missingCss: string[] = []
      const { context, page, traffic } = await session.open(spec, job.lang, missingCss)
      const own = spec as ShotSpec | StepsSpec
      // a terminal shot or step is the window itself (its height follows the session); a clip keeps the viewport
      const frame: Frame = job.kind === 'clip' ? {} : spec.terminal && !own.element && !own.crop ? { ...own, element: '.mk-term' } : own
      // a mask selector counts as used when it matches in at least one frame of the job
      const unmatched = new Set(spec.mask)
      const shoot = async (rel: string) => {
        const file = join(project.manualDir, rel)
        mkdirSync(dirname(file), { recursive: true })
        const mask = spec.mask.map((m) => page.locator(m))
        for (const [i, m] of mask.entries()) if (unmatched.has(spec.mask[i]!) && (await m.count()) > 0) unmatched.delete(spec.mask[i]!)
        const hidden = [...config.capture.hide, ...spec.hide]
        const style = hidden.length ? hideCss(hidden) : undefined
        const options = { path: file, animations: 'disabled' as const, caret: 'hide' as const, mask, maskColor: '#9aa3ad', ...(style ? { style } : {}) }
        if (traffic.escaped) throw new CaptureFailure(`a request was redirected to ${traffic.escaped}, outside capture.allowlist`)
        onAllowlist(page, config)
        const clip = await frameClip(page, frame)
        await redact(page, config.capture.redact)
        if (clip) await page.screenshot({ ...options, clip, fullPage: true })
        else if (frame.element) await page.locator(frame.element).first().screenshot(options)
        else await page.screenshot(options)
        await unredact(page)
      }
      const report = (r: Ran) => {
        const named = (s: string) => `${job.lang} ${job.kind} ${job.id}: ${s}`
        ran.skipped.push(...r.skipped.map(named))
        ran.notes.push(...r.notes.map(named))
      }
      const ready = async (label?: string) => {
        const pending = await settle(page, traffic, config.capture.settle)
        if (pending) warnings.push({ job, message: label ? `${label}: ${pending}` : pending })
      }
      try {
        if (spec.terminal) await openTerminal(page, spec.terminal, project, job.lang, job.kind === 'clip')
        else await goto(page, absolute(config, spec.url!, job.lang), config)
        if (job.kind === 'shot') {
          const shot = shots.shots[job.id]!
          report(await run(page, shot.actions, config, job.lang, project.manualDir))
          await ready()
          await highlight(page, shot.highlight)
          await shoot(job.files[0]!)
        } else if (job.kind === 'steps') {
          const steps = shots.steps[job.id]!
          report(await run(page, steps.setup, config, job.lang, project.manualDir))
          for (const [i, step] of steps.steps.entries()) {
            report(await run(page, step.actions, config, job.lang, project.manualDir))
            if (step.settle !== false) await ready(`step ${i + 1}`)
            await highlight(page, step.highlight || undefined, i + 1)
            await shoot(job.files[i]!)
          }
        } else {
          report(await recordClip(page, shots.clips[job.id]!, job, config, shoot, ready, project.manualDir))
        }
      } catch (e) {
        // a mistake in the config stops the run; a screen that would not cooperate fails only its own job
        if (e instanceof UsageError && !spec.terminal) {
          await context.close()
          throw e
        }
        const reason = e instanceof UsageError ? e.message : await failureReport(page, project.manualDir, `${job.lang}-${job.kind}-${job.id}`, e, traffic.blocked, () => redact(page, config.capture.redact))
        await context.close()
        delete manifest[manifestKey(job.lang, job.kind, job.id)]
        failed.push({ job, reason })
        continue
      }
      await context.close()
      if (missingCss.length) {
        // an unstyled screenshot must never pass as captured
        for (const f of job.files) rmSync(join(project.manualDir, f), { force: true })
        delete manifest[manifestKey(job.lang, job.kind, job.id)]
        failed.push({ job, reason: `stylesheet blocked (${[...new Set(missingCss.map((u) => new URL(u).host))].join(', ')}); add the host to capture.assetHosts` })
        continue
      }
      manifest[manifestKey(job.lang, job.kind, job.id)] = job.hash
      captured.push(job)
      for (const m of unmatched) warnings.push({ job, message: `mask "${m}" matched nothing, so nothing was covered` })
    }
  } finally {
    await session.close()
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : 1)))
    mkdirSync(join(project.manualDir, 'media'), { recursive: true })
    writeFileSync(join(project.manualDir, MANIFEST_FILE), `${JSON.stringify(sorted, null, 2)}\n`)
  }
  return { captured, failed, blocked: [...blocked].sort(), warnings, skipped: [...session.ran.skipped, ...ran.skipped], notes: [...session.ran.notes, ...ran.notes] }
}

/** A Markdown checklist of every shot: url, pages that use it, status per language. */
export function shotlist(project: Project): string {
  const shots = loadShots(project.manualDir)
  const manifest = readManifest(project.manualDir)
  const usedBy = (kind: 'shot' | 'steps' | 'clip', id: string) =>
    [...new Set(project.pages.filter((p) => p.tokens.some((t) => t.kind === kind && t.arg === id)).map((p) => p.id))].join(', ') || '(not used)'
  const status = (lang: string, kind: 'shot' | 'steps' | 'clip', id: string, hash: string, files: string[]) =>
    files.some((f) => !existsSync(join(project.manualDir, f))) ? 'missing' : manifest[manifestKey(lang, kind, id)] === hash ? 'captured' : 'stale'
  const where = (s: { url?: string; terminal?: { file: string } }) => (s.terminal ? `- Terminal: ${s.terminal.file}` : `- URL: ${s.url}`)
  const out = [`# Shot list`, '', `Base URL: ${project.config.capture.baseUrl} · media level: ${project.config.media}`, '']
  for (const [id, s] of Object.entries(shots.shots)) {
    out.push(`## ${id}`, '', where(s), `- Pages: ${usedBy('shot', id)}`)
    if (s.login) out.push(`- Login: ${s.login}`)
    if (s.highlight) out.push(`- Highlight: \`${s.highlight}\``)
    if (s.mask.length) out.push(`- Mask: ${s.mask.map((m) => `\`${m}\``).join(', ')}`)
    out.push(`- Status: ${project.config.languages.map((l) => `${l}: ${status(l, 'shot', id, specHash(s, shots.logins), [shotPath(l, id)])}`).join(' · ')}`, '')
  }
  for (const [id, s] of Object.entries(shots.steps)) {
    out.push(`## ${id} (${s.steps.length} steps)`, '', where(s), `- Pages: ${usedBy('steps', id)}`)
    s.steps.forEach((st, i) => out.push(`  ${i + 1}. ${typeof st.text === 'string' ? st.text : (st.text[project.primary] ?? '')}${st.highlight ? ` (highlight \`${st.highlight}\`)` : ''}`))
    const needed = hasSteps(project.config.media)
    out.push(
      `- Status: ${
        needed
          ? project.config.languages.map((l) => `${l}: ${status(l, 'steps', id, specHash(s, shots.logins), s.steps.map((_, i) => stepPath(l, id, i + 1)))}`).join(' · ')
          : 'not needed at this media level'
      }`,
      '',
    )
  }
  for (const [id, c] of Object.entries(shots.clips)) {
    out.push(`## ${id} (clip, ${c.segments.length} segments)`, '', where(c), `- Pages: ${usedBy('clip', id)}`)
    c.segments.forEach((sg, i) => out.push(`  ${i + 1}. ${typeof sg.caption === 'string' ? sg.caption : (sg.caption[project.primary] ?? '')}`))
    out.push(
      `- Status: ${
        hasClips(project.config.media)
          ? project.config.languages.map((l) => `${l}: ${status(l, 'clip', id, specHash(c, shots.logins), clipCaptured(project.manualDir, l, id))}`).join(' · ')
          : 'not needed at this media level'
      }`,
      '',
    )
  }
  return out.join('\n')
}
