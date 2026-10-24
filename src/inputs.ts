// The project inputs `init` gathers up front: answers (flags or an answers file) filled into manual.config.yaml and
// shots.yaml, and the checklist of what is still missing so an agent can ask for all of it in one round.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML, { isCollection, type Document } from 'yaml'
import { z } from 'zod'
import { REDACT_PRESETS, type ManualConfig } from './config.ts'
import type { LoginSpec } from './shots.ts'

/** What init writes where a person still has to answer. */
export const PENDING = '(รอระบุ)'
/** The login init writes into shots.yaml; shots name it with `login: main`. */
export const LOGIN_NAME = 'main'

const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'an environment variable name such as MANUAL_USER (never the value)')

/** How capture signs in. Only environment variable names are taken: the values never enter a file. */
export const LoginAnswer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('form'), url: z.string().min(1).default('/login'), userEnv: EnvName, passwordEnv: EnvName }).strict(),
  z.object({ type: z.literal('cookie'), url: z.string().min(1).default('/'), cookie: z.string().min(1), valueEnv: EnvName }).strict(),
])
export type LoginAnswer = z.infer<typeof LoginAnswer>

/** Answers: any manual.config keys (partial), plus `login` for shots.yaml. */
export interface Answers {
  config: Record<string, unknown>
  login?: LoginAnswer
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function mergeAnswers(base: Answers, over: Answers): Answers {
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v
    return out
  }
  return { config: merge(base.config, over.config), login: over.login ?? base.login }
}

/** An answers file (YAML or JSON): config keys at the top level, `login` for the sign-in. */
export function readAnswers(file: string): Answers {
  let raw: unknown
  try {
    raw = YAML.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read answers ${file}: ${(e as Error).message}`)
  }
  if (!isPlain(raw)) throw new Error(`answers ${file}: expected a map of config keys`)
  const { login, ...config } = raw
  if (login === undefined) return { config }
  const parsed = LoginAnswer.safeParse(login)
  if (!parsed.success) throw new Error(`answers ${file}: login: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'login'} ${i.message}`).join('; ')}`)
  return { config, login: parsed.data }
}

export interface InputFlags {
  appUrl?: string
  environment?: string
  allowlist?: string[]
  login?: LoginAnswer['type']
  loginUrl?: string
  userEnv?: string
  passwordEnv?: string
  cookie?: string
  cookieEnv?: string
  client?: string
  developer?: string
  systemName?: string
  logos?: string[]
  coverImage?: string
  /** `<book>=<text>` */
  audience?: string[]
  /** `<book>=<file>` */
  bookIcon?: string[]
  brandColor?: string
  accentColor?: string
  /** pdf, docx, web, video */
  outputs?: string[]
  /** preset names, or `none` */
  redact?: string[]
}

const OUTPUTS = ['pdf', 'docx', 'web', 'video']

/** The same answers as a file, from command-line flags. */
export function answersFromFlags(f: InputFlags): Answers {
  const config: Record<string, unknown> = {}
  const set = (path: string[], v: unknown) => {
    if (v === undefined) return
    let o = config
    for (const k of path.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>
    o[path.at(-1)!] = v
  }
  const pairs = (list: string[] | undefined, field: string) => {
    for (const p of list ?? []) {
      const i = p.indexOf('=')
      if (i < 1) throw new Error(`expected <book>=<${field}>, got "${p}"`)
      set(['books', p.slice(0, i), field], p.slice(i + 1))
    }
  }
  set(['capture', 'baseUrl'], f.appUrl)
  set(['capture', 'environment'], f.environment)
  set(['capture', 'allowlist'], f.allowlist)
  set(['document', 'client'], f.client)
  set(['document', 'developer'], f.developer)
  set(['web', 'brand', 'name'], f.systemName)
  set(['document', 'logos'], f.logos)
  set(['document', 'coverImage'], f.coverImage)
  pairs(f.audience, 'audience')
  pairs(f.bookIcon, 'icon')
  set(['web', 'brand', 'colors', 'brand'], f.brandColor)
  set(['web', 'brand', 'colors', 'accent'], f.accentColor)
  if (f.outputs) {
    const bad = f.outputs.filter((o) => !OUTPUTS.includes(o))
    if (bad.length) throw new Error(`--outputs: unknown ${bad.join(', ')} (choose from ${OUTPUTS.join(', ')})`)
    set(['outputs'], { pdf: f.outputs.includes('pdf'), docx: f.outputs.includes('docx'), web: f.outputs.includes('web') })
    if (f.outputs.includes('video')) set(['media'], 'steps+video')
  }
  if (f.redact) {
    const presets = f.redact.filter((p) => p !== 'none')
    const bad = presets.filter((p) => !(p in REDACT_PRESETS))
    if (bad.length) throw new Error(`--redact: unknown ${bad.join(', ')} (choose from ${Object.keys(REDACT_PRESETS).join(', ')}, or none)`)
    set(['capture', 'redact', 'presets'], presets)
  }
  if (!f.login) return { config }
  const login =
    f.login === 'form'
      ? { type: f.login, url: f.loginUrl, userEnv: f.userEnv, passwordEnv: f.passwordEnv }
      : f.login === 'cookie'
        ? { type: f.login, url: f.loginUrl, cookie: f.cookie, valueEnv: f.cookieEnv }
        : { type: f.login }
  const parsed = LoginAnswer.safeParse(JSON.parse(JSON.stringify(login)))
  if (!parsed.success) throw new Error(`--login ${f.login}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')} (form needs --user-env and --password-env; cookie needs --cookie and --cookie-env)`)
  return { config, login: parsed.data }
}

/** The login spec shots.yaml gets; selectors are common guesses to check against the real sign-in page. */
export function loginSpec(a: LoginAnswer): LoginSpec | undefined {
  if (a.type === 'form')
    return {
      url: a.url,
      actions: [
        { fill: 'input[name=username], input[name=email], input[type=email], input[type=text]', value: `{env:${a.userEnv}}` },
        { fill: 'input[type=password]', value: `{env:${a.passwordEnv}}` },
        { click: 'button[type=submit], input[type=submit]' },
        { waitMs: 1500 },
      ],
    }
  if (a.type === 'cookie') return { url: a.url, actions: [{ waitMs: 500 }], storage: { localStorage: {}, sessionStorage: {}, cookies: [{ name: a.cookie, value: `{env:${a.valueEnv}}`, path: '/' }] } }
  return undefined
}

const plain = (v: unknown): unknown => (isCollection(v) ? v.toJSON() : v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const blank = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || v === PENDING || (Array.isArray(v) && v.length === 0) || (isPlain(v) && Object.values(v).every(blank))
const at = (o: unknown, path: string[]): unknown => path.reduce<unknown>((x, k) => (isPlain(x) ? x[k] : undefined), o)

/**
 * Fill answers into a YAML document. A key is written only while it is blank or still holds the value init wrote
 * (`defaults`), so a value a person set is never changed. `capture.allowlist` gains hosts instead. Returns the keys set.
 */
export function fillDocument(doc: Document, answers: Record<string, unknown>, defaults: unknown): string[] {
  const set: string[] = []
  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [k, v] of Object.entries(node)) {
      const p = [...path, k]
      const cur = plain(doc.getIn(p))
      if (isPlain(v) && (cur === undefined || isPlain(cur))) {
        walk(v, p)
        continue
      }
      const next = p.join('.') === 'capture.allowlist' && Array.isArray(cur) && Array.isArray(v) ? [...new Set([...cur, ...v])] : v
      if (same(cur, next)) continue
      if (p.join('.') !== 'capture.allowlist' && !blank(cur) && !same(cur, at(defaults, p))) continue
      doc.setIn(p, next)
      set.push(p.join('.'))
    }
  }
  walk(answers, [])
  return set
}

/** The app URL's host joins the allowlist, so capture may open the app it was pointed at. */
export function withAppHost(answers: Answers): Answers {
  const url = at(answers.config, ['capture', 'baseUrl'])
  if (typeof url !== 'string') return answers
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return answers
  }
  const list = at(answers.config, ['capture', 'allowlist'])
  const allowlist = [...new Set([...(Array.isArray(list) ? (list as string[]) : []), host])]
  return mergeAnswers(answers, { config: { capture: { allowlist } } })
}

export interface Item {
  key: string
  ask: string
}

const DEFAULT_BASE_URL = 'http://localhost:5173'
const hostAllowed = (host: string, list: string[]) => list.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h))

/** What a person still has to answer (`missing`) and what to confirm, from the config and shots.yaml as they are. */
export function checklist(config: ManualConfig, logins: number, manualDir: string): { missing: Item[]; confirm: Item[] } {
  const missing: Item[] = []
  const need = (key: string, ask: string) => missing.push({ key, ask })
  const file = (key: string, path: string | undefined, ask: string) => {
    if (!path) need(key, ask)
    else if (!existsSync(join(manualDir, path))) need(key, `file not found: ${path} (relative to the manual folder)`)
  }
  for (const [id, b] of Object.entries(config.books)) {
    // a role book has no web card, so no eyebrow or blurb to ask for
    if (!b.from && blank(b.audience)) need(`books.${id}.audience`, `who reads "${id}" (shown as "For ..." on its web card)`)
    if (!b.from && blank(b.description)) need(`books.${id}.description`, `one or two sentences on what "${id}" covers`)
    file(`books.${id}.icon`, b.icon, `icon image for "${id}" (cover and video title cards)`)
  }
  const { capture, document: doc, web } = config
  if (capture.baseUrl === DEFAULT_BASE_URL) need('capture.baseUrl', 'app URL to capture (a test environment, never production)')
  else if (!hostAllowed(new URL(capture.baseUrl).hostname, capture.allowlist)) need('capture.allowlist', `add ${new URL(capture.baseUrl).hostname} (the app URL's host)`)
  if (blank(capture.environment)) need('capture.environment', 'which environment the app URL is (e.g. staging, uat)')
  if (logins === 0)
    need('login', 'how capture signs in: form (env var names for user and password), cookie (cookie name and its env var), or none; never the values')
  if (blank(doc.client)) need('document.client', 'client organisation name')
  if (blank(doc.developer)) need('document.developer', 'company that built the system (shown alone, no "developed by")')
  if (blank(web.brand.name)) need('web.brand.name', 'system name')
  if (doc.logos.length === 0) need('document.logos', 'organisation seal and system logo (image files: seal first, system second)')
  else {
    for (const l of doc.logos) file('document.logos', l, '')
    if (doc.logos.length === 1) need('document.logos', 'system logo (second logo, after the seal)')
  }
  file('document.coverImage', doc.coverImage, 'cover illustration (image file)')
  if (blank(web.brand.colors.brand)) need('web.brand.colors.brand', 'brand colour (#rrggbb); optional accent (web.brand.colors.accent)')
  const outputs = [...(['pdf', 'docx', 'web'] as const).filter((o) => config.outputs[o]), ...(config.media === 'steps+video' ? ['video'] : [])]
  const { presets, text, images } = capture.redact
  const confirm: Item[] = [
    { key: 'books', ask: Object.keys(config.books).join(', ') || 'none' },
    { key: 'document.title', ask: JSON.stringify(doc.title) },
    { key: 'outputs', ask: `${outputs.join(', ') || 'none'} (choose from pdf, docx, web, video)` },
    { key: 'capture.redact.presets', ask: `${presets.join(', ') || (text.length || images.length ? 'custom patterns only' : 'none')} (blur personal data: ${Object.keys(REDACT_PRESETS).join(', ')})` },
  ]
  return { missing, confirm }
}

export function formatChecklist(c: { missing: Item[]; confirm: Item[] }): string {
  const lines = c.missing.length
    ? ['Still missing (ask for all of these in one round, put the answers in a file, run "manual-kit init --answers <file>"):', ...c.missing.map((i) => `  - ${i.key}: ${i.ask}`)]
    : ['All project inputs are set.']
  return [...lines, 'Confirm:', ...c.confirm.map((i) => `  - ${i.key}: ${i.ask}`)].join('\n')
}
