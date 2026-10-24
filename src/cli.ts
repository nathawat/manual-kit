#!/usr/bin/env node
// manual-kit CLI. Every command is deterministic and never calls an AI service.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { Argument, Command, Option } from 'commander'
import { unzipSync } from 'fflate'
import { formatVerify, verifyDocx } from './verify-docx.ts'
import { buildDocx } from './build/docx.ts'
import type { FinalizeMode } from './build/finalize.ts'
import { buildPdf, buildTargets } from './build/pdf.ts'
import { buildWeb } from './build/web.ts'
import { dryRunCapture, runCapture, shotlist, type CaptureJob } from './capture.ts'
import { formatReport, runCheck } from './check.ts'
import { DEFAULT_TITLE, GITLAB_INCLUDE, detectCi, findProjectRoot, initManual, type CiProvider, type InitOptions } from './init.ts'
import { answersFromFlags, checklist, formatChecklist, mergeAnswers, readAnswers, type InputFlags } from './inputs.ts'
import { runLogin } from './login.ts'
import { loadShots } from './shots.ts'
import { runEncode } from './encode.ts'
import { HYPERFRAMES, runWalkthroughBuild } from './walkthrough/build.ts'
import { listControls, runMeasure } from './walkthrough/measure.ts'
import { EVERYWHERE } from './adapters/common.ts'
import { DISCOVERY_JSON, DISCOVERY_MD, detectAdapter, discoveryMarkdown, packageRoots, runDiscovery, scopeHint, serializeDiscovery } from './discover.ts'
import { readRuntimeRoutes } from './runtime-routes.ts'
import { hasConfig, loadConfig } from './config.ts'
import { runInventory } from './inventory.ts'
import { snap } from './snap.ts'
import { publishOutline } from './publish/outline.ts'
import { openBrowser, startPreview } from './preview.ts'
import { emptyBooks, openProject } from './project.ts'
import { ROOT } from './paths.ts'
import { UsageError, newPage, signPages } from './sign.ts'

/** Set by the plugin bundle (esbuild define); in the repository the version comes from package.json. */
declare const MANUAL_KIT_VERSION: string | undefined
const version =
  typeof MANUAL_KIT_VERSION === 'string' ? MANUAL_KIT_VERSION : (JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as { version: string }).version

const collect = (v: string, all: string[]) => [...all, v]
/** init flags given as comma-separated lists. */
type ListFlag = 'allowlist' | 'logos' | 'outputs' | 'redact'

/** Thrown to end a command with a non-zero exit code after its output is printed. */
class Exit extends Error {
  readonly code: number
  constructor(code: number) {
    super(`exit ${code}`)
    this.code = code
  }
}

/** Wall time since `start`, e.g. 0.8s, 42.1s, 3m12s. */
function elapsed(start: number): string {
  const s = (Date.now() - start) / 1000
  if (s < 59.95) return `${s.toFixed(1)}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, '0')}s`
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** ` (2 shots, 1 step set)`: capture jobs counted by kind, or nothing when there are none. */
function byKind(jobs: CaptureJob[]): string {
  const kinds = (['shot', 'steps', 'clip'] as const).map((k) => [k, jobs.filter((j) => j.kind === k).length] as const).filter(([, n]) => n)
  return kinds.length ? ` (${kinds.map(([k, n]) => count(n, k === 'steps' ? 'step set' : k)).join(', ')})` : ''
}

/** The deepest folder that holds every path. */
function commonDir(paths: string[]): string {
  const parts = paths.map((p) => dirname(p).split(sep))
  const first = parts[0] ?? []
  let n = 0
  while (n < first.length && parts.every((p) => p[n] === first[n])) n++
  return first.slice(0, n).join(sep)
}

export function buildProgram(): Command {
  const program = new Command('manual-kit')
    .description('Build and maintain formal customer manuals (PDF/DOCX) that stay in sync with the code')
    .version(version)
    .option('-m, --manual <dir>', 'manual folder', 'manual')
    .option('-v, --verbose', 'capture, encode, walkthrough and build: one line per item, not only the summary')
  const manualDir = () => resolve(program.opts<{ manual: string }>().manual)
  /** Per-item progress: printed with --verbose only. Failures and warnings are printed either way. */
  const item = (line: string) => {
    if (program.opts<{ verbose?: boolean }>().verbose) console.log(line)
  }

  program
    .command('init')
    .description('create manual/ (config, a sample page per language, shots.yaml) and fill in the project inputs; never overwrites, prints what is still missing')
    .option('--languages <list>', 'comma-separated, primary first', 'th,en')
    .option('--title <title>', 'document title', DEFAULT_TITLE)
    .addOption(new Option('--adapter <type>', 'how to read the code (default: nextjs, nuxt or react-spa when package.json shows one, else none)').choices(['none', 'generic', 'json-i18n', 'nextjs', 'nuxt', 'react-spa']))
    .option('--books <list>', 'comma-separated book folders, e.g. user-guide,admin-guide (default: user-guide)')
    .option('--no-samples', 'no sample page (the book folders are created empty)')
    .option('--ignore-dist', 'add manual/.gitignore with dist/ (default: the built PDF, DOCX and web are committed with the manual)')
    .addOption(new Option('--ci [provider]', 'also write a CI job: github (.github/workflows/manual-check.yml) or gitlab (.gitlab/ci/manual-check.gitlab-ci.yml); default: gitlab when .gitlab-ci.yml exists, else github').choices(['github', 'gitlab']))
    .option('--answers <file>', 'YAML/JSON answers: manual.config keys plus login (flags win over the file)')
    .option('--app-url <url>', 'app URL to capture (capture.baseUrl; its host joins the allowlist)')
    .option('--environment <name>', 'which environment the app URL is, e.g. staging (capture.environment)')
    .option('--allowlist <hosts>', 'more hosts capture may open, comma-separated (capture.allowlist)')
    .addOption(new Option('--login <type>', 'how capture signs in (shots.yaml logins.main)').choices(['none', 'form', 'cookie']))
    .option('--login-url <path>', 'sign-in page (form: /login, cookie: /)')
    .option('--user-env <NAME>', 'form login: environment variable holding the user name')
    .option('--password-env <NAME>', 'form login: environment variable holding the password')
    .option('--cookie <name>', 'cookie login: the session cookie name')
    .option('--cookie-env <NAME>', 'cookie login: environment variable holding the cookie value')
    .option('--client <name>', 'client organisation (document.client)')
    .option('--developer <name>', 'company that built the system, shown alone (document.developer)')
    .option('--system-name <name>', 'system name (web.brand.name)')
    .option('--logos <files>', 'seal,system logo files relative to the manual folder (document.logos)')
    .option('--cover-image <file>', 'cover illustration (document.coverImage)')
    .option('--audience <book=text>', 'who a book is for (books.<id>.audience); repeat per book', collect, [])
    .option('--book-icon <book=file>', 'a book icon (books.<id>.icon); repeat per book', collect, [])
    .option('--brand-color <hex>', 'brand colour (web.brand.colors.brand)')
    .option('--accent-color <hex>', 'accent colour (web.brand.colors.accent)')
    .option('--outputs <list>', 'pdf,docx,web,video (outputs; video sets media: steps+video)')
    .option('--redact <list>', 'blur presets: email,thai-name,latin-name or none (capture.redact.presets)')
    .action(async (opts: Omit<InputFlags, ListFlag> & Record<ListFlag, string | undefined> & { languages: string; title: string; adapter?: InitOptions['adapter']; books?: string; samples: boolean; ignoreDist?: boolean; ci?: boolean | CiProvider; answers?: string }, cmd: Command) => {
      const root = findProjectRoot(manualDir())
      const list = (v: string | undefined) => v?.split(',').map((s) => s.trim()).filter(Boolean)
      const fromCli = (name: string) => cmd.getOptionValueSource(name) === 'cli'
      const ci = opts.ci === undefined ? false : opts.ci === true ? detectCi(root) : opts.ci
      const file = opts.answers ? readAnswers(resolve(opts.answers)) : { config: {} }
      const flags = answersFromFlags({ ...opts, allowlist: list(opts.allowlist), logos: list(opts.logos), outputs: list(opts.outputs), redact: list(opts.redact) })
      if (fromCli('title')) flags.config.document = { ...(flags.config.document as object), title: opts.title }
      const answers = mergeAnswers(file, flags)
      const fileLanguages = Array.isArray(file.config.languages) ? (file.config.languages as string[]) : undefined
      const fileBooks = file.config.books && typeof file.config.books === 'object' ? Object.keys(file.config.books) : undefined
      const r = initManual(root, {
        languages: fromCli('languages') ? list(opts.languages)! : (fileLanguages ?? list(opts.languages)!),
        title: opts.title,
        adapter: opts.adapter ?? detectAdapter(root),
        ci,
        books: list(opts.books) ?? fileBooks,
        samples: opts.samples,
        manualDir: manualDir(),
        ignoreDist: !!opts.ignoreDist,
        answers,
      })
      for (const f of r.created) console.log(`created ${f}`)
      for (const f of r.existed) console.log(`exists ${f} (kept)`)
      if (r.filled.length) console.log(`filled ${r.filled.join(', ')}`)
      if (r.notFilled) console.log(`not filled: ${r.notFilled}`)
      if (ci === 'gitlab' && r.existed.includes('.gitlab-ci.yml')) console.log(`\nadd to .gitlab-ci.yml:\n\n${GITLAB_INCLUDE}`)
      const project = await loadConfig(manualDir())
      console.log(`\n${formatChecklist(checklist(project.config, Object.keys(loadShots(project.manualDir).logins).length, project.manualDir))}`)
      const hint = scopeHint(packageRoots(project.projectRoot, project.config.discover), project.config.discover)
      if (hint) console.log(`\n${hint}`)
      console.log('\nNext: manual-kit inventory, write pages, manual-kit check, manual-kit sign --all, manual-kit build pdf')
      if (!ci) console.log('CI (recommended): manual-kit init --ci adds a job that runs check on every merge request')
    })

  program
    .command('discover')
    .description('collect the evidence for the manual spec (documents, screens, roles, workflow states, forms, messages, API routes, flags, integrations) into discovery.json + discovery.md; works before init')
    .option('--print', 'print the JSON and write nothing')
    .option('--runtime [path]', "also read the route table from the running app's Vue Router at this path of capture.baseUrl (default /); needs a manual config")
    .option('--login <name>', 'sign in with this login from shots.yaml before --runtime reads the routes')
    .action(async (opts: { print?: boolean; runtime?: string | true; login?: string }) => {
      const dir = manualDir()
      const project = hasConfig(dir) ? await openProject(dir) : undefined
      if (opts.login && !opts.runtime) throw new UsageError('--login is used with --runtime')
      if (opts.runtime && !project) throw new UsageError('--runtime needs a manual config (capture.baseUrl and capture.allowlist): run manual-kit init first')
      const runtime = opts.runtime && project ? await readRuntimeRoutes(project, { url: opts.runtime === true ? '/' : opts.runtime, login: opts.login }) : undefined
      const d = project
        ? runDiscovery(project.projectRoot, { adapter: { type: project.config.adapter.type, adapter: project.adapter }, languages: project.config.languages, scope: project.config.discover, runtime })
        : runDiscovery(findProjectRoot(dir))
      if (opts.print) return console.log(serializeDiscovery(d))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, DISCOVERY_JSON), serializeDiscovery(d))
      writeFileSync(join(dir, DISCOVERY_MD), discoveryMarkdown(d))
      console.log(`wrote ${relative(process.cwd(), join(dir, DISCOVERY_JSON))} and ${DISCOVERY_MD}`)
      console.log(
        `adapter ${d.project.adapter}: ${d.docs.length} documents, ${d.routes.length} routes, ${d.roles.length} roles, ${d.permissions.length} permissions, ${d.states.length} state sets, ${d.forms.length} form fields, ${d.messages.length} messages, ${d.api.length} API routes, ${d.flags.length} flags`,
      )
      if (runtime) console.log(`runtime: ${runtime.length} routes in the router, ${d.routes.filter((r) => r.source === 'runtime').length} not found in the code`)
      if (d.notes.length) console.log(`${d.notes.length} not read from the code (see discovery.md)`)
      if (d.truncated.length) console.log(`capped: ${d.truncated.join(', ')}`)
      const hint = scopeHint(d.project.packageRoots, project?.config.discover ?? EVERYWHERE)
      if (hint) console.log(`\n${hint}`)
    })

  program
    .command('inventory')
    .description('read the code through the adapter and update coverage.yaml')
    .action(async () => {
      const r = runInventory(await openProject(manualDir()))
      if (!r.changed) return console.log('coverage.yaml: no changes')
      const unmapped = r.items.filter((i) => i.status === 'unmapped').length
      console.log(`coverage.yaml: ${r.added.length} new, ${r.removed.length} removed, ${unmapped} unmapped (of ${r.items.length})`)
    })

  program
    .command('check')
    .description('verify pages, UI strings, language twins, coverage, signatures, shots and wording (exit 1 on errors)')
    .option('--json', 'machine-readable report')
    .option('--allow-unsigned', 'unsigned or changed pages are warnings, not errors (still listed)')
    .option('--docx <file>', 'verify a built DOCX instead (Thai font settings, package integrity)')
    .option('--font <family>', 'with --docx: expected Thai font (w:cs)')
    .option('--latin-font <family>', 'with --docx: expected Latin font (w:ascii)')
    .action(async (opts: { json?: boolean; allowUnsigned?: boolean; docx?: string; font?: string; latinFont?: string }) => {
      if (opts.docx) {
        const v = verifyDocx(unzipSync(new Uint8Array(readFileSync(opts.docx))), { thaiFont: opts.font, latinFont: opts.latinFont })
        console.log(opts.json ? JSON.stringify(v, null, 2) : formatVerify(v))
        if (!v.ok) throw new Exit(1)
        return
      }
      const report = runCheck(await openProject(manualDir()), { allowUnsigned: opts.allowUnsigned })
      console.log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report))
      if (!report.ok) throw new Exit(1)
    })

  program
    .command('sign')
    .description('record that pages were reviewed (hashes of the page files and their sources)')
    .argument('[ids...]', 'page ids')
    .option('--all', 'sign every page')
    .action(async (ids: string[], opts: { all?: boolean }) => {
      if (!opts.all && !ids.length) throw new UsageError('give page ids or --all')
      const r = signPages(await openProject(manualDir()), opts.all ? 'all' : ids)
      console.log(r.changed ? r.signed.map((id) => `signed ${id}`).join('\n') : 'already signed; manual.lock.json unchanged')
    })

  program
    .command('new-page')
    .description('start a page in every language from the template for its kind')
    .argument('<id>', 'page id, e.g. teacher.create-class')
    .addOption(new Option('--kind <kind>', 'page kind').choices(['how-to', 'reference', 'concept']).makeOptionMandatory())
    .requiredOption('--book <book>', 'book folder, e.g. user-guide')
    .option('--title <title>', 'page title (all languages; translate afterwards)')
    .action(async (id: string, opts: { kind: 'how-to' | 'reference' | 'concept'; book: string; title?: string }) => {
      const created = newPage(await openProject(manualDir()), id, opts)
      console.log(created.length ? created.map((f) => `created ${f}`).join('\n') : `${id} exists in every language; nothing to do`)
    })

  program
    .command('build')
    .description('assemble the deliverables: front matter + content + images; no format = every output enabled in config outputs')
    .addArgument(new Argument('[format]', 'output format (default: all enabled in config outputs)').choices(['pdf', 'docx', 'web']))
    .option('--lang <lang>', 'only this language')
    .option('--book <book>', 'only this book')
    .option('--base <url>', 'web: where the site is hosted (URL or path) for canonical links; default config web.baseUrl')
    .addOption(new Option('--finalize <how>', 'DOCX: lay out once in a word processor to fill the lists; auto = LibreOffice if installed, else none; Microsoft Word only with --finalize word (default: config docx.finalize)').choices(['auto', 'word', 'libreoffice', 'none']))
    .action(async (format: 'pdf' | 'docx' | 'web' | undefined, opts: { lang?: string; book?: string; finalize?: FinalizeMode; base?: string }) => {
      const project = await openProject(manualDir())
      const { outputs } = project.config
      // pdf and docx first: the web build links the files built in the same run
      const formats = format ? [format] : (['pdf', 'docx', 'web'] as const).filter((f) => outputs[f])
      if (!formats.length) throw new UsageError('nothing to build: config outputs has pdf, docx and web all off')
      for (const e of emptyBooks(project)) if ((!opts.book || opts.book === e.book) && (!opts.lang || opts.lang === e.lang)) console.error(`WARNING: book "${e.book}" has no pages in ${e.lang}: not built`)
      const targets = buildTargets(project, opts)
      // role books (books.<id>.from) have no site: a plain build of only those skips web, "build web" says why
      const printOnly = targets.every((t) => project.config.books[t.book]?.from)
      for (const f of formats.filter((x) => format || x !== 'web' || !printOnly)) {
        const started = Date.now()
        const { written, warnings, notes, progress } =
          f === 'pdf'
            ? { written: await buildPdf(project, targets), warnings: [], notes: [], progress: [] }
            : f === 'web'
              ? { written: (await buildWeb(project, targets, { base: opts.base })).filter((x) => x.endsWith('index.html')), warnings: [], notes: [], progress: [] }
              : await buildDocx(project, targets, { finalize: opts.finalize })
        for (const w of written) item(`wrote ${relative(process.cwd(), w)}`)
        for (const p of progress) item(p)
        for (const n of notes) console.log(n)
        for (const w of warnings) console.log(`warning: ${w}`)
        console.log(`${f}: wrote ${count(written.length, f === 'web' ? 'index page' : 'file')} in ${relative(process.cwd(), commonDir(written)) || '.'} (${elapsed(started)})`)
      }
    })

  program
    .command('shotlist')
    .description('print a Markdown list of every shot with its pages and capture status')
    .action(async () => console.log(shotlist(await openProject(manualDir()))))

  program
    .command('capture')
    .description('take screenshots and step images with Playwright (allowlisted hosts only)')
    .option('--changed', 'only images that are missing or whose spec changed')
    .option('--only <ids>', 'only these shots, step sets and clips: ids or * globs, comma-separated or repeated (with --changed: both)', collect, [])
    .option('--dry-run', 'list what would be captured and why, the logins and hosts it needs; open no browser, write nothing')
    .action(async (opts: { changed?: boolean; only: string[]; dryRun?: boolean }) => {
      const started = Date.now()
      const only = opts.only.flatMap((o) => o.split(',')).map((o) => o.trim()).filter(Boolean)
      const project = await openProject(manualDir())
      if (opts.dryRun) {
        const d = dryRunCapture(project, { changed: opts.changed, only })
        for (const { job, login, hosts, outside } of d.jobs) {
          const where = hosts.map((h) => (outside.includes(h) ? `${h} (not in capture.allowlist)` : h)).join(', ')
          console.log(`  ${job.lang} ${job.kind} ${job.id}: ${[job.reason, login && `login ${login}`, where && `hosts ${where}`].filter(Boolean).join('; ')}`)
        }
        const logins = d.logins.map((l) => (l.noSession ? `${l.name} (no saved session: run manual-kit login ${l.name})` : l.name)).join(', ') || 'none'
        console.log(`dry run: ${d.jobs.length} to capture${byKind(d.jobs.map((p) => p.job))}; logins: ${logins}; hosts: ${d.hosts.join(', ') || 'none'}; nothing opened or written`)
        if (d.outside.length) {
          console.error(`manual-kit: ${d.outside.join(', ')} ${d.outside.length === 1 ? 'is' : 'are'} not in capture.allowlist`)
          throw new Exit(2)
        }
        return
      }
      const r = await runCapture(project, { changed: opts.changed, only })
      for (const j of r.captured) item(`  ${j.lang} ${j.kind} ${j.id}`)
      for (const s of r.skipped) item(`  skipped ${s} (not on the page)`)
      for (const n of r.notes) item(`  note ${n}`)
      if (r.blocked.length) console.log(`blocked requests to hosts outside the allowlist: ${r.blocked.join(', ')}`)
      for (const w of r.warnings) console.log(`warning ${w.job.lang} ${w.job.kind} ${w.job.id}: ${w.message}`)
      for (const f of r.failed) console.log(`failed ${f.job.lang} ${f.job.kind} ${f.job.id}: ${f.reason}`)
      console.log(`captured ${r.captured.length}${byKind(r.captured)}, ${r.failed.length} failed (${elapsed(started)})`)
      if (r.failed.length) throw new Exit(1)
    })

  program
    .command('login')
    .description('sign in by hand in a browser window (SSO, 2FA) and save the session that capture uses for shots.yaml logins.<name> with storageState: true')
    .argument('<name>', 'login name in shots.yaml')
    .action(async (name: string) => {
      const file = await runLogin(await openProject(manualDir()), name)
      console.log(`saved the session to ${relative(process.cwd(), file)}; capture now signs in with it. The file is a secret like a password: git ignores it; never share or commit it.`)
    })

  program
    .command('encode')
    .description('captured clips -> MP4 (H.264/AAC) + poster + silent WebP loop + WebVTT, captions burned in, original music bed (ffmpeg)')
    .option('--lang <lang>', 'only this language')
    .option('--changed', 'only clips captured again since the last encode')
    .action(async (opts: { lang?: string; changed?: boolean }) => {
      const started = Date.now()
      const r = await runEncode(await openProject(manualDir()), opts)
      for (const e of r.encoded) item(`  ${e.lang} ${e.id} (${e.seconds.toFixed(1)} s)`)
      for (const s of r.skipped) console.log(`skipped ${s.lang} ${s.id}: ${s.reason}`)
      console.log(`encoded ${count(r.encoded.length, 'clip')}, ${r.skipped.length} skipped (${elapsed(started)})`)
    })

  const walkthrough = program.command('walkthrough').description('walkthrough videos made from captured screenshots (shots.yaml walkthroughs, shown with {{clip:id}})')
  walkthrough
    .command('measure')
    .description('open each walkthrough screenshot\'s screen again (as capture does) and record where its targets are in media/walkthroughs.json')
    .option('--only <id>', 'only this walkthrough')
    .option('--lang <lang>', 'only this language')
    .option('--list <shot>', 'print the visible controls of a shot (text, hook, selector, box) to pick targets from; writes nothing')
    .action(async (opts: { only?: string; lang?: string; list?: string }) => {
      const project = await openProject(manualDir())
      if (opts.list) {
        for (const c of await listControls(project, opts.list, opts.lang)) console.log(`${c.box.join(',').padEnd(20)} ${c.selector}${c.text ? `  "${c.text}"` : ''}`)
        return
      }
      const r = await runMeasure(project, opts)
      for (const m of r.measured) item(`  ${m.lang} ${m.shot} (${m.targets} targets)`)
      for (const m of r.missing) console.log(`not on the screen: ${m.lang} ${m.shot} ${m.target}`)
      console.log(`measured ${r.measured.length} screens`)
      if (r.missing.length) throw new Exit(1)
    })
  walkthrough
    .command('build')
    .description(`compose each walkthrough (intro card, cursor, zoom, captions, outro, music) and render it with ${HYPERFRAMES} into the clip files (needs ffmpeg)`)
    .option('--only <id>', 'only this walkthrough')
    .option('--lang <lang>', 'only this language')
    .option('--changed', 'only walkthroughs whose screenshots, boxes or spec changed since the last build')
    .option('--no-render', 'write the compositions (dist/.build/walkthroughs) without rendering')
    .action(async (opts: { only?: string; lang?: string; changed?: boolean; render: boolean }) => {
      const started = Date.now()
      const r = await runWalkthroughBuild(await openProject(manualDir()), opts)
      for (const b of r.built) item(`  ${b.lang} ${b.id} (${b.seconds.toFixed(1)} s)${opts.render ? '' : ` ${relative(process.cwd(), b.dir)}`}`)
      for (const s of r.skipped) console.log(`skipped ${s.lang} ${s.id}: ${s.reason}`)
      console.log(`${opts.render ? 'rendered' : 'composed'} ${r.built.length}, ${r.skipped.length} skipped (${elapsed(started)})`)
      if (r.skipped.length) throw new Exit(1)
    })

  program
    .command('snap')
    .description('full-page PNG screenshots of a local page (e.g. the web build) at several widths, to look at the result')
    .argument('<target>', 'an HTML file or a 127.0.0.1/localhost URL')
    .option('--width <list>', 'comma-separated viewport widths', '1280,390')
    .option('--out <dir>', 'where to write the PNGs', 'manual/dist/snaps')
    .action(async (target: string, opts: { width: string; out: string }) => {
      const widths = opts.width.split(',').map((w) => Number(w.trim())).filter((w) => w > 0)
      for (const f of await snap(target, widths, resolve(opts.out))) console.log(`wrote ${relative(process.cwd(), f)}`)
    })

  const publish = program.command('publish').description('publish the built manual somewhere people read it')
  publish
    .command('outline')
    .description('pages as documents in an Outline wiki: one per book and per page, images/clips/PDF/DOCX as attachments; manual/outline.json keeps the mapping so publishing again updates instead of duplicating (API key from OUTLINE_API_KEY)')
    .option('--collection <id>', 'collection id or urlId (default: config outline.collection)')
    .option('--parent <docId>', 'put the book documents under this document')
    .option('--book <book>', 'only this book')
    .option('--lang <lang>', 'only this language')
    .option('--dry-run', 'print what would be created, updated and uploaded; send nothing')
    .action(async (opts: { collection?: string; parent?: string; book?: string; lang?: string; dryRun?: boolean }) => {
      await publishOutline(await openProject(manualDir()), opts)
    })

  program
    .command('preview')
    .description('serve dist/ on 127.0.0.1 and open the web build (Ctrl-C to stop)')
    .option('--port <n>', 'port (default: any free port)', '0')
    .option('--no-open', 'do not open a browser')
    .action(async (opts: { port: string; open: boolean }) => {
      const project = await openProject(manualDir())
      const dist = join(project.manualDir, project.config.outputs.dir)
      if (!existsSync(join(dist, 'web', 'index.html'))) throw new UsageError('no web build yet: run "manual-kit build web" first')
      const p = await startPreview(dist, Number(opts.port))
      const url = `${p.url}web/`
      console.log(`serving ${relative(process.cwd(), dist) || '.'} at ${url} (127.0.0.1 only; Ctrl-C to stop)`)
      if (opts.open) openBrowser(url)
      await new Promise<void>((done) => process.once('SIGINT', () => void p.close().then(done)))
    })

  return program
}

try {
  await buildProgram().parseAsync(process.argv)
} catch (e) {
  if (e instanceof Exit) process.exitCode = e.code
  else {
    console.error(`manual-kit: ${(e as Error).message}`)
    process.exitCode = 2
  }
}
