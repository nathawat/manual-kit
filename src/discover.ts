// discover: collect the evidence a manual spec is written from: requirement and design documents, screens, roles and
// permissions, workflow states, forms, messages, API routes, feature flags, integrations, environment names and seed
// data. Deterministic (sorted, no timestamps) so two runs can be diffed; every item names the file (and line) it came
// from; sizes are capped. Code is read as text, never run. Environment values are never read, only names.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Adapter } from './adapters/index.ts'
import { createAdapter } from './adapters/index.ts'
import { EVERYWHERE, files, type Scope } from './adapters/common.ts'
import { matchesAny } from './coverage.ts'
import { runtimeOnly, type RuntimeRoute } from './runtime-routes.ts'

export interface Evidence {
  name: string
  /** `path` or `path:line`, relative to the project root. */
  source: string
  detail?: string
}

export interface DocEvidence {
  path: string
  kind: 'readme' | 'agent-notes' | 'requirement' | 'design' | 'decision' | 'template' | 'doc'
  title: string
  headings: string[]
}

export interface StateEvidence {
  name: string
  values: string[]
  source: string
}

export interface Discovery {
  version: 1
  project: {
    name?: string
    description?: string
    adapter: string
    /** Folders with their own package.json, go.mod, pyproject.toml... (`.` = the project root). */
    packageRoots: string[]
    scripts: Evidence[]
    runFiles: string[]
  }
  docs: DocEvidence[]
  routes: Evidence[]
  /** What the adapter could not read statically (a route path built at run time...), at file:line. */
  notes: Evidence[]
  sections: Evidence[]
  roles: Evidence[]
  permissions: Evidence[]
  states: StateEvidence[]
  forms: Evidence[]
  messages: Evidence[]
  api: Evidence[]
  flags: Evidence[]
  env: Evidence[]
  integrations: Evidence[]
  seed: string[]
  uiStrings: { count: number; sample: string[] }
  /** Lists that hit their cap (the rest was left out). */
  truncated: string[]
}

export const LIMITS = { docs: 200, headings: 40, items: 300, files: 6000, fileBytes: 512 * 1024, sample: 120 }

/** Folders that never hold the product's own source or documents. */
const SKIP =
  /(^|\/)(node_modules|\.git|\.next|\.nuxt|\.output|\.svelte-kit|\.turbo|\.vercel|\.cache|dist|build|out|coverage|vendor|\.venv|venv|__pycache__|target|manual|playwright-report|test-results|tests?\/fixtures)(\/|$)|\.min\.js$/
const CODE = ['**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,astro,html,py,rb,php,go,java,kt,cs,sql,prisma,graphql}']
const TESTS = /(^|\/)(__tests__|__mocks__|e2e)\/|\.(test|spec|stories)\.\w+$/

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

class Bag {
  private map = new Map<string, Evidence>()
  hit = false
  private cap = LIMITS.items
  add(name: string, source: string, detail?: string) {
    const n = name.trim()
    if (!n || this.map.has(n)) return
    if (this.map.size >= this.cap) return void (this.hit = true)
    this.map.set(n, detail ? { name: n, source, detail } : { name: n, source })
  }
  list = () => [...this.map.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

function walk(root: string, scope: Scope, patterns: string[]): string[] {
  return files(root, scope, patterns).filter((f) => !SKIP.test(f))
}

const PACKAGE_FILES = ['package.json', 'go.mod', 'pyproject.toml', 'composer.json', 'Gemfile', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts']

/** Folders that hold a package of their own: several of them means a workspace of apps, services and prototypes. */
export function packageRoots(root: string, scope: Scope = EVERYWHERE): string[] {
  const dirs = walk(root, scope, PACKAGE_FILES.map((f) => `**/${f}`)).map((f) => f.split('/').slice(0, -1).join('/') || '.')
  return [...new Set(dirs)].sort()
}

/** Config text that scopes discover to one app, when it found several package roots and no scope is set. */
export function scopeHint(roots: string[], scope: Scope): string | undefined {
  const others = roots.filter((r) => r !== '.')
  if (roots.length < 2 || !others.length || scope.include.length || scope.exclude.length) return undefined
  return [
    `found ${roots.length} package roots: ${roots.join(', ')}`,
    'scope discover to the app the manual documents in manual.config.yaml (keep that app out of the list), e.g.:',
    '',
    'discover:',
    '  exclude:',
    ...others.map((r) => `    - ${r}/**`),
  ].join('\n')
}

/** Requirement, design and decision documents: path, title and headings (not the text). */
function docs(root: string, scope: Scope, truncated: string[]): DocEvidence[] {
  const found = walk(root, scope, ['**/*.{md,mdx,markdown,txt,adoc,rst}', '.github/**/*.{md,yml,yaml}', '.gitlab/**/*.md']).filter((f) => !/(^|\/)(CHANGELOG|LICENSE|CODE_OF_CONDUCT)/i.test(f))
  const kindOf = (f: string): DocEvidence['kind'] | undefined => {
    const base = f.split('/').at(-1)!
    if (/^readme\b/i.test(base)) return 'readme'
    if (/^(claude|agents|gemini|copilot-instructions)\.md$/i.test(base)) return 'agent-notes'
    if (/(issue_template|issue_templates|pull_request_template|merge_request_templates)/i.test(f)) return 'template'
    if (/(^|[/_.-])(adr|adrs|decisions?)([/_.-]|$)|^\d{3,4}-/i.test(f)) return 'decision'
    if (/(^|[/_.-])(prd|brd|srs|frd|requirements?|specs?|specification|user-?stor(y|ies)|use-?cases?|features?|rfcs?|scope|conops)([/_.-]|$)/i.test(f)) return 'requirement'
    if (/(^|[/_.-])(design|architecture|ux|ui|flows?|workflows?|wireframes?|proposals?)([/_.-]|$)/i.test(f)) return 'design'
    if (/^(docs?|documentation|wiki|handbook|guides?)\//i.test(f)) return 'doc'
    return undefined
  }
  const out: DocEvidence[] = []
  for (const path of found) {
    const kind = kindOf(path)
    if (!kind) continue
    if (out.length >= LIMITS.docs) {
      truncated.push('docs')
      break
    }
    const text = safeRead(root, path)
    const headings = [...withoutFences(text).matchAll(/^(#{1,3})\s+(.+?)\s*#*\s*$/gm)].map((m) => `${'  '.repeat(m[1]!.length - 1)}${m[2]}`)
    const front = /^---\n[\s\S]*?\btitle:\s*["']?(.+?)["']?\s*\n[\s\S]*?---/.exec(text)?.[1]
    const title = front ?? headings.find((h) => !h.startsWith(' '))?.trim() ?? path.split('/').at(-1)!
    out.push({ path, kind, title, headings: headings.slice(0, LIMITS.headings) })
  }
  return out
}

/** The text with fenced code blocks emptied (a `# comment` in a bash block is not a heading). */
function withoutFences(text: string): string {
  let fence: string | undefined
  return text
    .split('\n')
    .map((line) => {
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (m && (!fence || (m[1]![0] === fence[0] && m[1]!.length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)))) {
        fence = fence ? undefined : m[1]
        return ''
      }
      return fence ? '' : line
    })
    .join('\n')
}

function safeRead(root: string, rel: string): string {
  try {
    const file = join(root, rel)
    if (statSync(file).size > LIMITS.fileBytes) return ''
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

const STRING = `(['"\`])((?:\\\\.|(?!\\1)[^\\n\\\\])*)\\1`
const re = (s: string, flags = 'g') => new RegExp(s, flags)

/** Pattern -> bag, with the capture group that holds the name. */
const ROLE_PATTERNS = [
  re(`\\brole[sA-Z_]*\\s*(?:===?|!==?)\\s*${STRING}`, 'gi'),
  re(`\\b(?:hasRole|hasAnyRole|requireRole|requireRoles|isRole|checkRole|withRole|roleRequired|Roles)\\(\\s*${STRING}`, 'g'),
  re(`@(?:Roles|HasRole|RolesAllowed)\\(\\s*${STRING}`, 'g'),
]
const PERMISSION_PATTERNS = [
  re(`\\b(?:requirePermission|hasPermission|checkPermission|can|cannot|authorize|ability\\.can|allow|permit|gate\\.allows)\\(\\s*${STRING}`, 'g'),
  re(`\\bpermission[sA-Z_]*\\s*(?:===?|:)\\s*${STRING}`, 'gi'),
]
const MESSAGE_PATTERNS = [
  re(`\\b(?:message|errorMessage|error|invalid_type_error|required_error|description)\\s*:\\s*${STRING}`, 'g'),
  re(`\\b(?:throw new \\w*Error|toast\\.(?:error|warning|warn|success|info)|alert|confirm|setError|notify\\.\\w+|showError|fail|reject)\\(\\s*${STRING}`, 'g'),
  re(`\\.(?:email|url|uuid|nonempty|cuid|datetime)\\(\\s*${STRING}`, 'g'),
  re(`\\.(?:min|max|length|email|url|regex|nonempty|refine|positive|int|uuid|startsWith|endsWith|includes)\\([^()]*?,\\s*${STRING}`, 'g'),
]
const API_PATTERNS = [
  re(`\\b(?:app|router|route|r|api|server|fastify|hono)\\.(get|post|put|patch|delete|all)\\(\\s*${STRING}`, 'gi'),
  re(`@(Get|Post|Put|Patch|Delete)\\(\\s*${STRING}`, 'g'),
  re(`\\{\\s*(?:method|m)\\s*:\\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\\s*,\\s*(?:path|pattern|url)\\s*:\\s*${STRING}`, 'gi'),
]
const ENV_PATTERNS = [
  /\bprocess\.env\.([A-Z][A-Z0-9_]+)/g,
  /\bprocess\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /\bimport\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  /\b(?:os\.environ(?:\.get)?|getenv|Deno\.env\.get|env)\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /\bos\.environ\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g,
  /\buseRuntimeConfig\(\)\.(\w+)/g,
]
const STATE_NAME = /(status|state|step|stage|phase|role|kind|type|level|mode|priority|category)s?$/i

/** Known services by package name: the manual explains what the user meets of them (sign-in, payment, e-mail...). */
const INTEGRATIONS: [RegExp, string][] = [
  [/^(stripe|@stripe\/)/, 'Stripe (payments)'],
  [/^(omise|omise-node)$/, 'Omise (payments)'],
  [/^(@line\/bot-sdk|@line\/liff|line-login)/, 'LINE (messaging / login)'],
  [/^(firebase|firebase-admin|@firebase\/)/, 'Firebase'],
  [/^@supabase\//, 'Supabase'],
  [/^(aws-sdk|@aws-sdk\/)/, 'AWS'],
  [/^(@google-cloud\/|googleapis$)/, 'Google Cloud / Google APIs'],
  [/^(nodemailer|@sendgrid\/|resend$|postmark$|mailgun)/, 'E-mail sending'],
  [/^(twilio)$/, 'Twilio (SMS)'],
  [/^(next-auth|@auth\/|passport|@clerk\/|auth0|@auth0\/|lucia|better-auth|keycloak)/, 'Sign-in / authentication'],
  [/^(openai|@anthropic-ai\/|@google\/generative-ai|ai$)/, 'AI service'],
  [/^(prisma|@prisma\/client|drizzle-orm|typeorm|sequelize|mongoose|pg|mysql2|knex|kysely|better-sqlite3)$/, 'Database'],
  [/^(redis|ioredis|bullmq|bull)$/, 'Queue / cache'],
  [/^(@sentry\/|posthog|mixpanel|@vercel\/analytics)/, 'Monitoring / analytics'],
  [/^(socket\.io|ws|pusher|ably)$/, 'Real-time updates'],
  [/^(pdfkit|puppeteer|exceljs|xlsx|docx)$/, 'Document export'],
  [/^(@cloudflare\/|wrangler$)/, 'Cloudflare'],
  [/^(minio|multer|@uploadthing\/)/, 'File upload / storage'],
]

const SPA_ROUTERS = ['react-router-dom', 'react-router', 'wouter', '@tanstack/react-router']

/** The adapter that reads this project's code: nextjs, nuxt, react-spa (Vite + a React router) or none. */
export function detectAdapter(root: string, pkg = readPackage(root), scope: Scope = EVERYWHERE): 'nextjs' | 'nuxt' | 'react-spa' | 'none' {
  const deps = { ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) } as Record<string, string>
  if (deps.next || walk(root, scope, ['{app,src/app}/**/page.{tsx,jsx,ts,js}']).length) return 'nextjs'
  if (deps.nuxt || existsSync(join(root, 'nuxt.config.ts')) || existsSync(join(root, 'nuxt.config.js'))) return 'nuxt'
  if (deps.vite && SPA_ROUTERS.some((r) => deps[r])) return 'react-spa'
  return 'none'
}

function readPackage(root: string): Record<string, unknown> | undefined {
  const pkgFile = join(root, 'package.json')
  try {
    return existsSync(pkgFile) ? (JSON.parse(readFileSync(pkgFile, 'utf8')) as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

export interface DiscoverOptions {
  /** The manual's own adapter when the project already has a manual config; otherwise one is picked from the code. */
  adapter?: { type: string; adapter: Adapter }
  languages?: string[]
  /** Config `discover`: files outside it are never read. */
  scope?: Scope
  /** Routes read from the running app's router (`discover --runtime`); those the code did not show get source `runtime`. */
  runtime?: RuntimeRoute[]
}

/** Collect the evidence. */
export function runDiscovery(root: string, { adapter, languages = ['th', 'en'], scope = EVERYWHERE, runtime }: DiscoverOptions = {}): Discovery {
  const truncated: string[] = []
  const pkg = readPackage(root)
  const type = adapter?.type ?? detectAdapter(root, pkg, scope)
  const ad = adapter?.adapter ?? createAdapter({ type: type as 'none' }, root, scope)

  const bags = {
    routes: new Bag(),
    sections: new Bag(),
    roles: new Bag(),
    permissions: new Bag(),
    forms: new Bag(),
    messages: new Bag(),
    api: new Bag(),
    flags: new Bag(),
    env: new Bag(),
    integrations: new Bag(),
  }
  for (const item of ad.items()) {
    const name = item.id.slice(item.kind.length + 1)
    const bag = { route: bags.routes, section: bags.sections, role: bags.roles, permission: bags.permissions, flag: bags.flags }[item.kind]
    bag.add(name, item.source ?? '(adapter)', item.label)
  }
  if (runtime) for (const e of runtimeOnly(new Set(bags.routes.list().map((r) => r.name)), runtime)) bags.routes.add(e.name, e.source, e.detail)
  const notes = (ad.notes?.() ?? []).map((n) => ({ name: n.message, source: n.source })).sort((a, b) => a.source.localeCompare(b.source, 'en', { numeric: true }))

  const states = new Map<string, StateEvidence>()
  const addState = (name: string, values: string[], source: string) => {
    const vals = [...new Set(values.map((v) => v.trim()).filter(Boolean))]
    if (vals.length < 2 || states.has(name)) return
    if (states.size >= LIMITS.items) return void truncated.push('states')
    states.set(name, { name, values: vals, source })
  }

  let code = walk(root, scope, CODE).filter((f) => !TESTS.test(f))
  if (code.length > LIMITS.files) {
    truncated.push('code files')
    code = code.slice(0, LIMITS.files)
  }
  for (const rel of code) {
    const text = safeRead(root, rel)
    if (!text) continue
    const at = (i: number) => `${rel}:${lineOf(text, i)}`
    const each = (patterns: RegExp[], fn: (m: RegExpMatchArray, source: string) => void) => {
      for (const p of patterns) for (const m of text.matchAll(p)) fn(m, at(m.index!))
    }
    each(ROLE_PATTERNS, (m, s) => bags.roles.add(m.at(-1)!, s))
    each(PERMISSION_PATTERNS, (m, s) => /^[\w.:-]{2,60}$/.test(m.at(-1)!) && bags.permissions.add(m.at(-1)!, s))
    each(MESSAGE_PATTERNS, (m, s) => {
      const msg = m.at(-1)!
      // a message has words; identifiers, URLs and CSS classes are not messages
      if (msg.length >= 4 && msg.length <= 200 && /[\s฀-๿]/.test(msg) && !/^(https?:|\/|\.|#)/.test(msg)) bags.messages.add(msg, s)
    })
    each(API_PATTERNS, (m, s) => {
      const path = m.at(-1)!
      if (path.startsWith('/')) bags.api.add(`${m[1]!.toUpperCase()} ${path}`, s)
    })
    each(ENV_PATTERNS, (m, s) => bags.env.add(m[1]!, s))
    // form fields: <input name="..."> / <select> / <textarea>, v-model, register('...') (react-hook-form), formik names
    for (const m of text.matchAll(/<(input|select|textarea)\b[^>]*?\bname=["']([^"'{}]+)["'][^>]*>/gi)) {
      const tag = m[0]
      const label = /\b(?:placeholder|aria-label|label)=["']([^"']+)["']/.exec(tag)?.[1]
      const kind = /\btype=["'](\w+)["']/.exec(tag)?.[1] ?? m[1]!.toLowerCase()
      bags.forms.add(m[2]!, at(m.index!), [kind, label].filter(Boolean).join(': '))
    }
    for (const m of text.matchAll(/\b(?:register|useField|getFieldProps|field)\(\s*['"]([\w.[\]-]+)['"]/g)) bags.forms.add(m[1]!, at(m.index!))
    for (const m of text.matchAll(/\bv-model(?:\.\w+)*=["'](?:form|state|model|data)\.([\w.]+)["']/g)) bags.forms.add(m[1]!, at(m.index!))
    // workflow states: TS enums, string-literal unions, const arrays, Prisma enums, SQL CHECK ... IN (...)
    for (const m of text.matchAll(/\benum\s+(\w+)\s*\{([^}]*)\}/g)) {
      const body = m[2]!
      const values = rel.endsWith('.prisma')
        ? body.split(/\s+/).filter((w) => /^\w+$/.test(w))
        : [...body.matchAll(/(\w+)\s*(?:=\s*['"]?([^,'"\n]+)['"]?)?\s*,?/g)].map((v) => v[2] ?? v[1]!)
      if (STATE_NAME.test(m[1]!) || rel.endsWith('.prisma')) addState(m[1]!, values, at(m.index!))
    }
    for (const m of text.matchAll(/\btype\s+(\w+)\s*=\s*((?:\s*\|?\s*['"][^'"\n]+['"]){2,})/g))
      if (STATE_NAME.test(m[1]!)) addState(m[1]!, [...m[2]!.matchAll(/['"]([^'"\n]+)['"]/g)].map((v) => v[1]!), at(m.index!))
    for (const m of text.matchAll(/\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*\[((?:\s*['"][^'"\n]+['"]\s*,?){2,})\]/g))
      if (STATE_NAME.test(m[1]!) || /^[A-Z_]+$/.test(m[1]!)) addState(m[1]!, [...m[2]!.matchAll(/['"]([^'"\n]+)['"]/g)].map((v) => v[1]!), at(m.index!))
    for (const m of text.matchAll(/\b(\w+)\s+(?:TEXT|VARCHAR\(\d+\)|INTEGER)?[^,\n]*CHECK\s*\(\s*\w+\s+IN\s*\(([^)]*)\)/gi))
      addState(m[1]!, [...m[2]!.matchAll(/'([^']+)'/g)].map((v) => v[1]!), at(m.index!))
  }

  // file-system API routes
  for (const rel of walk(root, scope, ['{app,src/app}/**/route.{ts,js}'])) {
    const path = `/${rel.replace(/^(src\/)?app\//, '').replace(/\/?route\.(ts|js)$/, '').split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/')}`
    const methods = [...safeRead(root, rel).matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]!)
    for (const m of methods.length ? methods : ['ANY']) bags.api.add(`${m} ${path}`, rel)
  }
  for (const rel of walk(root, scope, ['{pages,src/pages}/api/**/*.{ts,js}', 'server/{api,routes}/**/*.{ts,js}', 'functions/**/*.{ts,js}'])) {
    const m = /^(?:src\/)?(?:pages|server)\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete))?\.(ts|js)$/.exec(rel)
    if (!m) continue
    const path = `/${m[1] === 'api' ? 'api/' : ''}${m[2]!.replace(/\/?index$/, '')}`
    bags.api.add(`${(m[3] ?? 'ANY').toUpperCase()} ${path}`, rel)
  }

  // environment names from example files (names only, values are never read)
  for (const rel of walk(root, scope, ['**/.env.example', '**/.env.sample', '**/.env.template', '**/.dev.vars.example', '**/example.env'])) {
    for (const m of safeRead(root, rel).matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/gm)) bags.env.add(m[1]!, `${rel}`)
  }
  for (const e of bags.env.list()) if (/(FEATURE|FLAG|ENABLE|DISABLE|_ON$|_OFF$)/.test(e.name)) bags.flags.add(e.name, e.source)

  // integrations from the dependency list
  const deps = Object.keys({ ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) }).sort()
  for (const d of deps) for (const [p, name] of INTEGRATIONS) if (p.test(d)) bags.integrations.add(name, 'package.json', d)
  for (const rel of walk(root, scope, ['requirements*.txt', 'pyproject.toml', 'go.mod', 'Gemfile', 'composer.json'])) bags.integrations.add(`dependencies (${rel})`, rel)

  // how to run it, and test data
  const scripts = Object.entries((pkg?.scripts as Record<string, string>) ?? {}).map(([name, cmd]) => ({ name, source: 'package.json', detail: cmd }))
  const runFiles = walk(root, scope, ['{docker-,}compose*.{yml,yaml}', '**/{docker-,}compose*.{yml,yaml}', '**/Dockerfile', 'Makefile', 'Procfile', '**/.env.example', '**/.dev.vars.example', 'wrangler.{toml,json,jsonc}', 'vercel.json', 'netlify.toml', '.tool-versions', '.nvmrc'])
  const seed = walk(root, scope, ['**/*{seed,Seed,fixture,demo,sample,mock}*.{ts,js,mjs,sql,json,yaml,yml,py,rb,csv}', '**/{seeds,seeders,fixtures,demo}/**/*']).filter((f) => !TESTS.test(f)).slice(0, 60)

  const primary = languages.find((l) => ad.uiStrings(l).size) ?? languages[0]!
  const strings = [...new Set(ad.uiStrings(primary).values())]
  // UI strings that read as messages (keys or text about errors and validation)
  for (const [key, text] of ad.uiStrings(primary)) if (/(error|invalid|required|fail|warn|denied|notfound|not_found|expired)/i.test(key)) bags.messages.add(text, `ui:${key}`)

  // a value set named like Role / UserRole lists the roles
  for (const st of states.values()) if (/role/i.test(st.name)) for (const v of st.values) bags.roles.add(v, st.source, st.name)

  for (const [name, bag] of Object.entries(bags)) if (bag.hit) truncated.push(name)
  const list = (k: keyof typeof bags) => bags[k].list()
  return {
    version: 1,
    project: {
      ...(typeof pkg?.name === 'string' ? { name: pkg.name } : {}),
      ...(typeof pkg?.description === 'string' ? { description: pkg.description } : {}),
      adapter: type,
      packageRoots: packageRoots(root, scope),
      scripts,
      runFiles,
    },
    docs: docs(root, scope, truncated),
    routes: list('routes'),
    notes,
    sections: list('sections'),
    roles: list('roles'),
    permissions: list('permissions'),
    states: [...states.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
    forms: list('forms'),
    messages: list('messages'),
    api: list('api'),
    flags: list('flags'),
    env: list('env'),
    integrations: list('integrations'),
    seed,
    uiStrings: { count: strings.length, sample: strings.slice(0, LIMITS.sample) },
    truncated: [...new Set(truncated)].sort(),
  }
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** The same evidence as a document Claude and people read before writing manual-spec.md. */
export function discoveryMarkdown(d: Discovery): string {
  const out: string[] = []
  const section = (title: string, rows: string[], empty = '(none found)') => {
    out.push(`## ${title}`, '', ...(rows.length ? rows : [empty]), '')
  }
  const table = (items: Evidence[], cols: [string, string, string] = ['Name', 'Detail', 'Source']) =>
    items.length ? [`| ${cols.join(' | ')} |`, '|---|---|---|', ...items.map((i) => `| ${esc(i.name)} | ${esc(i.detail ?? '')} | \`${i.source}\` |`)] : []
  out.push(
    '# Discovery',
    '',
    'Evidence collected by `manual-kit discover` (deterministic; code is read, never run). Each item names the file it came from. This is the input for `manual-spec.md`; it is not the spec.',
    '',
    `- Project: ${d.project.name ?? '(no package name)'}${d.project.description ? ` - ${d.project.description}` : ''}`,
    `- Adapter: ${d.project.adapter}`,
    ...(d.project.packageRoots.length > 1 ? [`- Package roots: ${d.project.packageRoots.join(', ')} (set \`discover.include\` / \`discover.exclude\` to the app the manual documents)`] : []),
    `- Counts: ${d.docs.length} documents, ${d.routes.length} routes, ${d.roles.length} roles, ${d.permissions.length} permissions, ${d.states.length} state sets, ${d.forms.length} form fields, ${d.messages.length} messages, ${d.api.length} API routes, ${d.flags.length} flags, ${d.env.length} environment names, ${d.uiStrings.count} UI strings`,
    ...(d.truncated.length ? [`- Capped (more exist than listed): ${d.truncated.join(', ')}`] : []),
    '',
  )
  section(
    'Requirement and design documents',
    d.docs.map((doc) => [`- **${esc(doc.title)}** (${doc.kind}) \`${doc.path}\``, ...doc.headings.slice(1, 25).map((h) => `  - ${h.trim()}`)].join('\n')),
  )
  section('Screens (routes)', table(d.routes, ['Route', 'Label', 'Source']))
  if (d.notes.length) section('Not read from the code (check by hand)', d.notes.map((n) => `- \`${n.source}\`: ${esc(n.name)}`))
  section('In-page sections', table(d.sections, ['Section', 'Label', 'Source']))
  section('Roles', table(d.roles, ['Role', 'Detail', 'Source']))
  section('Permissions', table(d.permissions, ['Permission', 'Detail', 'Source']))
  section('Workflow states and value sets', d.states.map((s) => `- **${s.name}**: ${s.values.map((v) => `\`${v}\``).join(' → ')} (\`${s.source}\`)`))
  section('Form fields', table(d.forms, ['Field', 'Type / label', 'Source']))
  section('Messages users can meet (errors, validation, notices)', table(d.messages, ['Message', '', 'Source']))
  section('API routes', table(d.api, ['Route', '', 'Source']))
  section('Feature flags', table(d.flags, ['Flag', '', 'Source']))
  section('Integrations', table(d.integrations, ['Service', 'Package', 'Source']))
  section('Environment names (values are never read)', d.env.length ? [d.env.map((e) => `\`${e.name}\``).join(', ')] : [])
  section(
    'Running it locally',
    [...d.project.scripts.map((s) => `- \`${s.name}\`: \`${esc(s.detail ?? '')}\``), ...d.project.runFiles.map((f) => `- file: \`${f}\``)],
  )
  section('Seed / demo data', d.seed.map((f) => `- \`${f}\``), '(none found: the manual needs invented test data)')
  section('UI strings (sample)', d.uiStrings.sample.length ? [d.uiStrings.sample.map((s) => `"${esc(s)}"`).join(', ')] : [])
  return `${out.join('\n').trimEnd()}\n`
}

/** Names the spec must mention: screens, roles, permissions and flags (for `check`). */
export function specTerms(d: Pick<Discovery, 'routes' | 'roles' | 'permissions' | 'flags'>): { kind: string; name: string; source: string }[] {
  return [
    ...d.routes.map((e) => ({ kind: 'route', name: e.name, source: e.source })),
    ...d.roles.map((e) => ({ kind: 'role', name: e.name, source: e.source })),
    ...d.permissions.map((e) => ({ kind: 'permission', name: e.name, source: e.source })),
    ...d.flags.map((e) => ({ kind: 'flag', name: e.name, source: e.source })),
  ]
}

/**
 * The terms of `d` that `spec` (manual-spec.md text) never mentions, and the route globs in it that match no route.
 * Roles and flags match without case. A route glob is quoted in backticks: `` `/settings/roles*` `` names every
 * route that starts with /settings/roles (`*` matches any characters, `/` included, as in coverage `covers`).
 */
export function specGaps(d: Discovery, spec: string) {
  const lower = spec.toLowerCase()
  const globs = [...spec.matchAll(/`(\/[^`\s]*\*[^`\s]*)`/g)].map((m) => ({ glob: m[1]!, line: lineOf(spec, m.index!) }))
  const named = (route: string) => spec.includes(route) || matchesAny(route, globs.map((g) => g.glob))
  return {
    missing: specTerms(d).filter((t) => (t.kind === 'route' ? !named(t.name) : !lower.includes(t.name.toLowerCase()))),
    unmatched: globs.filter((g) => !d.routes.some((r) => matchesAny(r.name, [g.glob]))),
  }
}

export const DISCOVERY_JSON = 'discovery.json'
export const DISCOVERY_MD = 'discovery.md'
export const SPEC_FILE = 'manual-spec.md'

export const serializeDiscovery = (d: Discovery) => `${JSON.stringify(d, null, 2)}\n`
