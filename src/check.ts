// check: every rule that keeps the manual true to the product. Pure over the project files; no writes.
import { existsSync, readFileSync } from 'node:fs'
import { SPEC_FILE, runDiscovery, specGaps, type Discovery } from './discover.ts'
import { join } from 'node:path'
import { autoPages, COVERAGE_FILE, effectiveStatus, readCoverage, type CoverageItem } from './coverage.ts'
import { localize } from './config.ts'
import { currentSignature, readLock, signatureDiff, type Lock } from './lock.ts'
import { findUi, groupName, mapTokens, scanTokens, type Page } from './pages.ts'
import { emptyBooks, type Project } from './project.ts'
import { clipFiles, clipTimeline, hasClips, hasSteps, loadShots, manifestKey, readManifest, shotPath, specHash, stepPath, type Shots } from './shots.ts'
import { encodeHash } from './encode.ts'
import { BOXES_FILE, boxKey, imageHash, readBoxes } from './walkthrough/boxes.ts'
import { walkthroughSource } from './walkthrough/build.ts'
import { HOW_TO_PARTS, howToLangs, howToProblems, howToSections, PROBLEM_HEADINGS, type HowToLang, type HowToSection } from './how-to.ts'

export type Rule =
  | 'front-matter'
  | 'duplicate-id'
  | 'book'
  | 'language'
  | 'twin'
  | 'link'
  | 'ui'
  | 'data'
  | 'token'
  | 'shot'
  | 'clip'
  | 'source'
  | 'coverage'
  | 'signature'
  | 'wording'
  | 'structure'
  | 'spec'
  | 'book'

export interface Finding {
  rule: Rule
  severity: 'error' | 'warning'
  /** Relative to the manual folder. */
  file?: string
  line?: number
  message: string
}

export interface Report {
  ok: boolean
  errors: number
  warnings: number
  findings: Finding[]
  /** Pages never signed or changed since they were signed: a person still has to read them. Listed even when allowed. */
  unsigned: string[]
}

export interface CheckOptions {
  /** Unsigned pages are warnings for this run (CI on a branch); config `signing: warn` does the same for every run. */
  allowUnsigned?: boolean
}

const SUPERLATIVES: RegExp[] = [
  /\b(best|greatest|most complete|most advanced|world[- ]class|number one|ultimate|unbeatable|unrivall?ed|perfect)\b/i,
  /#1\b/,
  /(ดีที่สุด|ครบที่สุด|สมบูรณ์ที่สุด|เก่งที่สุด|ล้ำที่สุด|ทันสมัยที่สุด|อันดับ ?(?:1|หนึ่ง)|เหนือชั้น|ไร้เทียมทาน)/,
]

/** System words a reader should never meet in page text, in the order they claim a span (a route before its parts). */
const PLAIN: { re: RegExp; what: string }[] = [
  { re: /(?<=^|[\s(“"'])\/[A-Za-z][\w-]*(?:\/[\w:.-]+)*\/?/g, what: 'a route path' },
  { re: /\b[A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9]\b/g, what: 'an environment variable name' },
  { re: /\b[a-z][\w-]*:[a-z][\w.-]*[a-z0-9]/g, what: 'a namespaced key' },
  { re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, what: 'a snake_case name' },
  { re: /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g, what: 'a camelCase name' },
  { re: /\b[A-Z]{3,}\b/g, what: 'an all-caps code' },
]
/** Common names readers know, accepted by the plain-language rule on top of `wording.allow`. */
const PLAIN_ALLOW = ['PDF', 'DOCX', 'CSV', 'PNG', 'JPG', 'JPEG', 'OTP', 'SMS', 'USB', 'LINE', 'HTML', 'iPhone', 'iPad', 'iOS', 'macOS']
/** Markdown that is not prose: inline code, link targets, URLs, HTML tags, a note box marker (`> [!NOTE]`). */
const NOT_PROSE = /`[^`]*`|\]\([^)]*\)|<[^>]*>|\bhttps?:\/\/\S+|^\s*\[[^\]]+\]:\s*\S+|^\s*>\s*\[![A-Za-z]+\]/g

/** Plain-language findings for one line of page text. */
function plainLanguage(line: string, allow: Set<string>): string[] {
  let rest = line.replace(NOT_PROSE, (m) => ' '.repeat(m.length))
  const out: string[] = []
  for (const { re, what } of PLAIN)
    rest = rest.replace(re, (m) => {
      if (!allow.has(m)) out.push(`"${m}" looks like ${what}: say it the way the reader sees it on screen (or add it to wording.allow)`)
      return ' '.repeat(m.length)
    })
  for (const m of rest.matchAll(/พัฒนา(?:ระบบ)?โดย/g)) out.push(`"${m[0]}": show the company name alone`)
  return out
}

/** Prose that sends the reader to the video. Video is web-only, so in the PDF and DOCX the line points at nothing. */
const VIDEO_LINES: RegExp[] = [
  /(?:ดู|ชม)\s*(?:วิดีโอ|วีดิโอ|วีดีโอ|คลิป)|(?:วิดีโอ|วีดิโอ|วีดีโอ|คลิป)\s*(?:ด้านล่าง|ด้านบน|ข้างล่าง|ข้างบน)/,
  /\b(?:watch|see)\s+(?:the\s+|this\s+)?(?:video|clip)\b|\b(?:video|clip)\s+(?:below|above)\b/i,
]

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])[ \t]/
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
/** Characters a reader reads: tokens as their label, Markdown marks and link targets dropped; Thai marks join their letter. */
const readLength = (text: string) => [...graphemes.segment(text.replace(/\[\[[^\]]*\]\]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim())].length

/** Numbered items of a how-to's "วิธี…" section with their first paragraph and body line index; fenced code skipped. */
function numberedSteps(section: HowToSection): { text: string; at: number; sub: number }[] {
  const out: { text: string; at: number; sub: number }[] = []
  let fence = false
  let sub = 0
  let open: { text: string; at: number; sub: number } | undefined
  section.lines.forEach((line, k) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) return void (open = undefined)
    if (/^###/.test(line)) sub++
    const m = /^ {0,3}\d+[.)][ \t]+(.*)$/.exec(line)
    if (m) out.push((open = { text: m[1]!, at: section.line + 1 + k, sub }))
    else if (open && line.trim() && !LIST_ITEM.test(line) && !/^\s*(?:\{\{|!\[|\||>|#)/.test(line)) open.text += ` ${line.trim()}`
    else open = undefined
  })
  return out
}

/** Problem titles in a problems section: "ปัญหา: “…”" lines and bold-symptom items, with their body line index. */
function problemTitles(section: HowToSection): { title: string; at: number }[] {
  return section.lines.flatMap((line, k) => {
    const m = /^\s*(?:[-*+][ \t]+)?(?:\*\*)?\s*(?:ปัญหา|Problem)\s*[:：]\s*(?:\*\*)?\s*(.+?)\s*$/i.exec(line) ?? /^\s*(?:[-*+][ \t]+)?\*\*(.+?)\*\*/.exec(line)
    return m ? [{ title: m[1]!, at: section.line + 1 + k }] : []
  })
}

/** A system message as the code holds it, placeholders (`{name}`, `${x}`, `%s`) matching any text. */
const messagePattern = (msg: string) =>
  new RegExp(`^${msg.replace(/\s+/g, ' ').trim().split(/\$\{[^}]*\}|\{\{[^}]*\}\}|\{[^}]*\}|%[sd]/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`)

const COMPARED = new Set(['ui', 'shot', 'steps', 'clip', 'data', 'link'])
const tokenBag = (p: Page) =>
  p.tokens
    // quoted labels are the visible text, which differs between languages: not compared
    .filter((t) => COMPARED.has(t.kind) && !t.quoted)
    .map((t) => `${t.kind}:${t.arg}`)
    .sort()

function bagDiff(a: string[], b: string[]): string[] {
  const rest = [...b]
  const missing: string[] = []
  for (const x of a) {
    const i = rest.indexOf(x)
    if (i >= 0) rest.splice(i, 1)
    else missing.push(x)
  }
  return missing
}

export function runCheck(project: Project, opts: CheckOptions = {}): Report {
  const findings: Finding[] = []
  const add = (f: Finding) => findings.push(f)
  const err = (rule: Rule, message: string, file?: string, line?: number) =>
    add({ rule, severity: 'error', message, ...(file ? { file } : {}), ...(line ? { line } : {}) })
  const warn = (rule: Rule, message: string, file?: string, line?: number) =>
    add({ rule, severity: 'warning', message, ...(file ? { file } : {}), ...(line ? { line } : {}) })
  const { config, pages, primary } = project
  const langs = config.languages

  for (const p of project.pageProblems) err('front-matter', p.message, p.file)

  // structure
  const seen = new Map<string, Page>()
  for (const p of pages) {
    const key = `${p.lang}/${p.id}`
    if (seen.has(key)) err('duplicate-id', `id "${p.id}" is also used by ${seen.get(key)!.rel}`, p.rel)
    else seen.set(key, p)
    if (p.meta.book !== p.book) err('book', `front matter book "${p.meta.book}" but the page is in folder "${p.book}"`, p.rel)
    const from = config.books[p.book]?.from
    if (from) err('book', `book "${p.book}" is made from "${from.book}" (books.${p.book}.from), so it has no pages of its own: move this page to "${from.book}" and name its audience`, p.rel)
    if (p.meta.kind === 'how-to' && howToLangs(p.lang)) {
      const problems = howToProblems(p.body, p.lang)
      if (problems.length)
        warn('structure', `how-to page ${p.id}: ${problems.join('; ')} (a how-to has ## ${HOW_TO_PARTS.map((h) => `"${h.name[p.lang as HowToLang]}"${h.required ? '' : ' (optional)'}`).join(', ')}, in this order)`, p.rel)
    }
    if (!langs.includes(p.lang)) err('language', `language folder "${p.lang}" is not in config.languages (${langs.join(', ')})`, p.rel)
  }
  const unnamed = new Map<string, Page>()
  const titled = (p: Page, g: string) => !!config.web.groups[g] || !!config.books[p.book]?.groups?.some((x) => x.id === g)
  for (const p of pages) if (p.meta.group && !titled(p, p.meta.group) && !unnamed.has(p.meta.group)) unnamed.set(p.meta.group, p)
  for (const [id, p] of unnamed)
    warn('front-matter', `group "${id}" is not in web.groups, so the web titles it "${groupName(id)}": add web.groups.${id} with a title (and icon)`, p.rel)

  // language twins
  const ids = [...new Set(pages.map((p) => p.id))].sort()
  for (const id of ids) {
    const base = seen.get(`${primary}/${id}`)
    for (const lang of langs) {
      const page = seen.get(`${lang}/${id}`)
      if (!page) {
        err('twin', `page ${id} has no ${lang} version`, (base ?? pages.find((p) => p.id === id))?.rel)
        continue
      }
      if (!base || page === base) continue
      if (page.meta.book !== base.meta.book || page.meta.kind !== base.meta.kind) err('twin', `${id}: book/kind differ from the ${primary} version`, page.rel)
      const missing = bagDiff(tokenBag(base), tokenBag(page))
      const extra = bagDiff(tokenBag(page), tokenBag(base))
      if (missing.length || extra.length)
        err(
          'twin',
          `${id}: tokens differ from the ${primary} version${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; extra ${extra.join(', ')}` : ''}`,
          page.rel,
        )
    }
  }

  // tokens
  let shots: Shots = { logins: {}, shots: {}, steps: {}, clips: {}, walkthroughs: {} }
  try {
    shots = loadShots(project.manualDir)
  } catch (e) {
    err('shot', (e as Error).message, 'shots.yaml')
  }
  for (const [kind, specs] of [['shot', shots.shots], ['steps', shots.steps], ['clip', shots.clips]] as const)
    for (const [id, spec] of Object.entries(specs))
      if (spec.terminal && !existsSync(join(project.manualDir, spec.terminal.file)))
        err('shot', `terminal transcript "${spec.terminal.file}" of ${kind} "${id}" does not exist`, 'shots.yaml')
  for (const [id, spec] of Object.entries(shots.steps)) {
    if (spec.terminal) continue
    spec.steps.forEach((st, i) => {
      if (st.highlight === undefined)
        warn('shot', `steps "${id}" step ${i + 1} has no highlight: the reader needs the red frame on the control to act on (highlight: <selector>, or highlight: false for a step that only shows the system's response)`, 'shots.yaml')
    })
  }
  const manifest = readManifest(project.manualDir)
  const mediaChecked = new Set<string>()
  const needMedia = (lang: string, kind: 'shot' | 'steps' | 'clip', id: string, files: string[], hash: string, page: Page) => {
    const key = manifestKey(lang, kind, id)
    if (mediaChecked.has(key)) return
    mediaChecked.add(key)
    const missing = files.filter((f) => !existsSync(join(project.manualDir, f)))
    if (missing.length) err('shot', `${kind} "${id}" not captured yet: ${missing.join(', ')} (run "manual-kit capture")`, page.rel)
    else if (manifest[key] !== hash) err('shot', `${kind} "${id}" (${lang}) spec changed since capture (run "manual-kit capture --changed")`, page.rel)
  }
  const boxes = readBoxes(project.manualDir)
  /** A walkthrough shown on a page: measured, built from the current screenshots. */
  const needWalkthrough = (lang: string, id: string, page: Page) => {
    const key = manifestKey(lang, 'walkthrough', id)
    if (mediaChecked.has(key)) return
    mediaChecked.add(key)
    const before = findings.length
    for (const shot of new Set(shots.walkthroughs[id]!.scenes.map((sc) => sc.shot))) needMedia(lang, 'shot', shot, [shotPath(lang, shot)], specHash(shots.shots[shot]!, shots.logins), page)
    if (findings.length > before) return
    const src = walkthroughSource(project, shots, boxes, lang, id)
    if (!src.ok) {
      for (const problem of src.problems) err('clip', `walkthrough "${id}": ${problem}`, page.rel)
      return
    }
    const f = clipFiles(lang, id)
    if ([f.mp4, f.poster].some((x) => !existsSync(join(project.manualDir, x))) || manifest[key] !== src.hash)
      err('clip', `walkthrough "${id}" (${lang}) is not built from its current screenshots and spec (run "manual-kit walkthrough build")`, page.rel)
  }
  for (const [id, w] of Object.entries(shots.walkthroughs)) {
    const own = pages.filter((p) => p.id === w.page)
    if (!own.length) err('clip', `walkthrough "${id}": page "${w.page}" does not exist`, 'shots.yaml')
    else if (!own.some((p) => p.tokens.some((t) => t.kind === 'clip' && t.arg === id))) warn('clip', `walkthrough "${id}" is not shown on its page "${w.page}" (add {{clip:${id}}} there)`, own[0]!.rel)
    for (const lang of langs)
      for (const shot of new Set(w.scenes.map((sc) => sc.shot))) {
        const measured = boxes[boxKey(lang, shot)]
        if (measured && measured.image !== imageHash(project.manualDir, lang, shot))
          warn('clip', `walkthrough "${id}": the screenshot of shot "${shot}" (${lang}) changed since its targets were measured (run "manual-kit walkthrough measure")`, BOXES_FILE)
      }
  }
  const strings = new Map(langs.map((l) => [l, project.adapter.uiStrings(l)]))
  for (const p of pages) {
    for (const t of p.tokens) {
      switch (t.kind) {
        case 'ui':
          if (findUi(strings.get(p.lang) ?? new Map(), t.arg) === undefined) err('ui', `UI ${t.quoted ? 'label' : 'string'} "${t.arg}" does not exist in ${p.lang}`, p.rel, t.line)
          break
        case 'data':
          if (project.adapter.data(t.arg) === undefined) err('data', `data "${t.arg}" not found (adapter.data files)`, p.rel, t.line)
          break
        case 'link':
          if (!seen.has(`${p.lang}/${t.arg}`)) err('link', `link to unknown page "${t.arg}"`, p.rel, t.line)
          break
        case 'unknown':
          err('token', `unknown token {{${t.arg}}} (use ui, data, shot, steps or clip)`, p.rel, t.line)
          break
        case 'clip': {
          const spec = shots.clips[t.arg]
          if (shots.walkthroughs[t.arg]) {
            if (hasClips(config.media)) needWalkthrough(p.lang, t.arg, p)
          } else if (!spec) err('clip', `clip "${t.arg}" is not in shots.yaml`, p.rel, t.line)
          else if (hasClips(config.media)) {
            const before = findings.length
            needMedia(p.lang, 'clip', t.arg, [clipTimeline(p.lang, t.arg)], specHash(spec, shots.logins), p)
            const key = manifestKey(p.lang, 'encode', t.arg)
            if (findings.length === before && !mediaChecked.has(key)) {
              mediaChecked.add(key)
              const f = clipFiles(p.lang, t.arg)
              const missing = [f.mp4, f.poster].filter((x) => !existsSync(join(project.manualDir, x)))
              if (missing.length || manifest[key] !== encodeHash(project, spec, p.lang, t.arg))
                err('clip', `clip "${t.arg}" (${p.lang}) is not encoded from its latest capture (run "manual-kit encode")`, p.rel)
            }
          }
          break
        }
        case 'shot': {
          const spec = shots.shots[t.arg]
          if (!spec) err('shot', `shot "${t.arg}" is not in shots.yaml`, p.rel, t.line)
          else if (config.media !== 'none') needMedia(p.lang, 'shot', t.arg, [shotPath(p.lang, t.arg)], specHash(spec, shots.logins), p)
          break
        }
        case 'steps': {
          const spec = shots.steps[t.arg]
          if (!spec) err('shot', `steps "${t.arg}" is not in shots.yaml`, p.rel, t.line)
          else if (hasSteps(config.media))
            needMedia(p.lang, 'steps', t.arg, spec.steps.map((_, i) => stepPath(p.lang, t.arg, i + 1)), specHash(spec, shots.logins), p)
          break
        }
      }
    }
  }
  // UI strings used in shot captions, step texts and details, and walkthrough captions
  const shotTexts = [
    ...Object.entries(shots.shots).map(([id, s]) => [id, s.caption] as const),
    ...Object.entries(shots.steps).flatMap(([id, s]) => s.steps.flatMap((st) => [st.text, ...(st.details ?? [])].map((t) => [id, t] as const))),
    ...Object.entries(shots.walkthroughs).flatMap(([id, w]) => [...(w.title ? [w.title] : []), ...w.scenes.flatMap((sc) => sc.steps.map((st) => st.caption))].map((t) => [id, t] as const)),
  ]
  for (const [id, text] of shotTexts) {
    for (const lang of langs) {
      for (const t of scanTokens(localize(text, lang, primary))) {
        if (t.kind === 'ui' && findUi(strings.get(lang) ?? new Map(), t.arg) === undefined) err('ui', `shots.yaml "${id}": UI string "${t.arg}" does not exist in ${lang}`, 'shots.yaml')
      }
    }
  }

  // books without pages are skipped by build: say so
  for (const e of emptyBooks(project)) warn('book', `book "${e.book}" has no pages in ${e.lang}: it will not be built`)
  for (const [id, b] of Object.entries(config.books)) {
    if (!b.from) continue
    const named = new Set(pages.filter((p) => p.book === b.from!.book).flatMap((p) => p.meta.audience))
    for (const a of b.from.audience) if (!named.has(a)) warn('book', `books.${id}.from.audience: no page of "${b.from.book}" names audience "${a}"`)
  }

  // sources exist
  for (const p of pages) {
    for (const s of p.meta.sources) if (!existsSync(join(project.projectRoot, s))) err('source', `source "${s}" does not exist in the project`, p.rel)
  }

  // coverage
  let coverage: CoverageItem[] = []
  const coverageFile = existsSync(join(project.manualDir, COVERAGE_FILE))
  try {
    coverage = readCoverage(project.manualDir)
  } catch (e) {
    err('coverage', (e as Error).message, COVERAGE_FILE)
  }
  if (!coverageFile && config.adapter.type !== 'none') warn('coverage', 'no coverage.yaml yet (run "manual-kit inventory")')
  const auto = autoPages(project.pages, primary, coverage.map((i) => i.id))
  if (coverage.length) for (const u of auto.unmatched) err('coverage', `covers "${u.entry}" matches no item in ${COVERAGE_FILE}`, u.page.rel)
  for (const item of coverage) {
    const fromPages = auto.map.get(item.id) ?? []
    const status = effectiveStatus(item, fromPages)
    if (status === 'unmapped')
      err('coverage', `${item.id} has no manual page (name it in a page's front matter routes/covers, add page ids to "pages", or set status ignored/manual-later)`, COVERAGE_FILE)
    else if (status === 'removed')
      err('coverage', `${item.id} is no longer in the code; update the pages that cover it${[...item.pages, ...fromPages].length ? ` (${[...new Set([...item.pages, ...fromPages])].join(', ')})` : ''} and delete the item`, COVERAGE_FILE)
    else if (status === 'manual-later') warn('coverage', `${item.id} is marked manual-later`, COVERAGE_FILE)
    for (const pid of item.pages) if (!ids.includes(pid)) err('coverage', `${item.id} points to unknown page "${pid}"`, COVERAGE_FILE)
  }

  // signatures
  let lock: Lock = { version: 1, pages: {} }
  try {
    lock = readLock(project.manualDir)
  } catch (e) {
    err('signature', (e as Error).message, 'manual.lock.json')
  }
  const unsigned: string[] = []
  const sig = config.signing === 'warn' || opts.allowUnsigned ? warn : err
  for (const id of ids) {
    const stored = lock.pages[id]
    const where = (seen.get(`${primary}/${id}`) ?? pages.find((p) => p.id === id))?.rel
    if (!stored) {
      unsigned.push(id)
      sig('signature', `${id} has not been signed (a person reads it, then runs "manual-kit sign ${id}")`, where)
      continue
    }
    const d = signatureDiff(stored, currentSignature(project, id))
    if (d.files.length || d.sources.length) {
      unsigned.push(id)
      const parts = [d.sources.length ? `sources changed: ${d.sources.join(', ')}` : '', d.files.length ? `page edited: ${d.files.join(', ')}` : ''].filter(Boolean)
      sig('signature', `${id} changed since it was signed (${parts.join('; ')}); a person reviews it, then runs "manual-kit sign ${id}"`, where)
    }
  }

  // the manual spec names every screen, role, permission and flag the code has (only once a spec exists)
  let discovery: Discovery | undefined
  const discover = () => (discovery ??= runDiscovery(project.projectRoot, { adapter: { type: config.adapter.type, adapter: project.adapter }, languages: langs, scope: config.discover }))
  const specFile = join(project.manualDir, SPEC_FILE)
  if (existsSync(specFile)) {
    const gaps = specGaps(discover(), readFileSync(specFile, 'utf8'))
    for (const t of gaps.missing)
      warn('spec', `${t.kind} "${t.name}" (${t.source}) is not in ${SPEC_FILE}: add it to the spec (feature, workflow or out of scope)`, SPEC_FILE)
    for (const g of gaps.unmatched) warn('spec', `route glob \`${g.glob}\` matches no discovered route: fix it or remove it`, SPEC_FILE, g.line)
  }

  // wording
  const rules = config.wording.forbidden.map((r) => ({ ...r, re: new RegExp(r.pattern, r.flags) }))
  const allow = new Set([...PLAIN_ALLOW, ...config.wording.allow])
  for (const p of pages) {
    let fence = false
    mapTokens(p.body, () => '').split('\n').forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence
      if (fence || /^\s*(```|~~~)/.test(line)) return
      const lineNo = p.bodyLine + i
      if (config.wording.superlatives) {
        for (const re of SUPERLATIVES) {
          const m = re.exec(line)
          if (m) err('wording', `superlative "${m[0]}": state facts, not rankings`, p.rel, lineNo)
        }
      }
      for (const r of rules) {
        if (r.lang && r.lang !== p.lang) continue
        if (r.re.test(line)) err('wording', r.message, p.rel, lineNo)
      }
      if (config.wording.plainLanguage) for (const m of plainLanguage(line, allow)) warn('wording', m, p.rel, lineNo)
      if (config.wording.videoInProse)
        for (const re of VIDEO_LINES) {
          const m = re.exec(line.replace(NOT_PROSE, ' '))
          if (m) warn('wording', `"${m[0]}" points the reader at the video: video is on the web only, so the PDF and DOCX would show a line with nothing to watch (delete the line)`, p.rel, lineNo)
        }
    })
  }

  // how-to steps (one short action each, with images) and problems (titled by the system's own message)
  const w = config.wording
  const stepMax = (lang: string) => w.stepLength[lang] ?? 160
  /** Step text as the reader reads it: a UI token is its label, a data token its value, media tokens nothing. */
  const readStep = (text: string, lang: string) =>
    readLength(
      mapTokens(text, (t) => {
        if (t.kind === 'ui') return (t.quoted ? t.arg : (findUi(strings.get(lang) ?? new Map(), t.arg) ?? t.arg)).replace(/<[^>]+>/g, '')
        if (t.kind === 'data') return String(project.adapter.data(t.arg) ?? '')
        return ''
      }),
    )
  const tooLong = (n: number, lang: string) =>
    `${n} characters (limit ${stepMax(lang)}): keep a step to one short action and move the explanation into the "${lang === 'th' ? '…คืออะไร' : 'What is …'}" intro or "${lang === 'th' ? 'ข้อควรทราบ' : 'Good to know'}"`
  const messages: RegExp[] = []
  let messagesRead = false
  const knownMessage = (title: string, lang: string): boolean | undefined => {
    if (!messagesRead) {
      messagesRead = true
      if (config.adapter.type !== 'none') messages.push(...discover().messages.map((m) => messagePattern(m.name)))
    }
    // the rule only runs when discovery finds messages: otherwise there is nothing to compare against
    if (!messages.length) return undefined
    const want = title.replace(/\s+/g, ' ').trim()
    return findUi(strings.get(lang) ?? new Map(), want) !== undefined || [...(strings.get(lang)?.values() ?? [])].some((v) => messagePattern(v.replace(/<[^>]+>/g, '')).test(want)) || messages.some((re) => re.test(want))
  }
  for (const p of pages) {
    if (p.meta.kind !== 'how-to' || !howToLangs(p.lang)) continue
    for (const section of howToSections(p.body, p.lang)) {
      if (section.part === 'how') {
        const steps = numberedSteps(section)
        if (stepMax(p.lang) > 0)
          for (const st of steps) {
            const n = readStep(st.text, p.lang)
            if (n > stepMax(p.lang)) warn('wording', `step is ${tooLong(n, p.lang)}`, p.rel, p.bodyLine + st.at)
          }
        if (w.stepImages && hasSteps(config.media))
          for (const sub of new Set(steps.map((st) => st.sub))) {
            // a "### วิธีที่ N" sub-section is checked on its own
            let n = 0
            const chunk = section.lines.filter((l) => (/^###/.test(l) ? ++n : n) === sub).join('\n')
            const first = steps.find((st) => st.sub === sub)!
            if (!/\{\{steps:/.test(chunk))
              warn('structure', `steps are a plain numbered list while media is "${config.media}": use {{steps:id}} so every step has its own screenshot with a frame on the control`, p.rel, p.bodyLine + first.at)
          }
      }
      if (w.problemMessages && (section.part === 'problems' || PROBLEM_HEADINGS.has(section.heading.toLowerCase())))
        for (const { title, at } of problemTitles(section)) {
          const quoted = /^["“](.+)["”]$/.exec(title)
          if (!quoted || quoted[1]!.includes('{{')) continue
          if (knownMessage(quoted[1]!, p.lang) === false)
            warn('ui', `problem "${quoted[1]}" is not a message the system has in ${p.lang} (no UI string or message in the code matches): title a problem with the message exactly as the screen shows it`, p.rel, p.bodyLine + at)
        }
    }
  }
  for (const [id, spec] of Object.entries(shots.steps))
    spec.steps.forEach((st, i) => {
      for (const lang of langs) {
        const n = readStep(localize(st.text, lang, primary), lang)
        if (stepMax(lang) > 0 && n > stepMax(lang)) warn('wording', `shots.yaml steps "${id}" step ${i + 1} (${lang}) is ${tooLong(n, lang)}`, 'shots.yaml')
      }
    })

  const sorted = findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.file ?? '').localeCompare(b.f.file ?? '') || (a.f.line ?? 0) - (b.f.line ?? 0) || a.i - b.i)
    .map((x) => x.f)
  const errors = sorted.filter((f) => f.severity === 'error').length
  return { ok: errors === 0, errors, warnings: sorted.length - errors, findings: sorted, unsigned }
}

/**
 * The text report. Findings with the same severity, rule and message are one line that lists every place
 * (`file:line,line file:line`), errors first. Signature warnings are left to the "not signed" line, which names the same pages;
 * signature errors stay one line per page. `--json` keeps every finding.
 */
export function formatReport(r: Report): string {
  const groups = new Map<string, { f: Finding; at: Map<string, number[]> }>()
  for (const f of r.findings) {
    if (f.rule === 'signature' && f.severity === 'warning') continue
    const key = `${f.severity}\0${f.rule}\0${f.message}`
    const g = groups.get(key) ?? groups.set(key, { f, at: new Map() }).get(key)!
    if (f.file === undefined) continue
    const lines = g.at.get(f.file) ?? g.at.set(f.file, []).get(f.file)!
    if (f.line) lines.push(f.line)
  }
  const lines = [...groups.values()]
    .sort((a, b) => Number(a.f.severity === 'warning') - Number(b.f.severity === 'warning'))
    .map(({ f, at }) => {
      const where = [...at].map(([file, ls]) => (ls.length ? `${file}:${ls.join(',')}` : file)).join(' ')
      return `${f.severity === 'error' ? 'error  ' : 'warning'}  ${f.rule.padEnd(12)} ${where ? `${where}  ` : ''}${f.message}`
    })
  if (r.unsigned.length) lines.push(`not signed (${r.unsigned.length}): ${r.unsigned.join(', ')} (only a person signs, after reading the page)`)
  lines.push(`${r.ok ? 'ok' : 'failed'}: ${r.errors} errors, ${r.warnings} warnings`)
  return lines.join('\n')
}
