// nextjs, nuxt and react-spa: routes from the file-system router (react-spa: from the route definitions in the code),
// UI strings from i18n files or, without them, from the fixed text in components (TypeScript parser / Vue template
// parser). Code is read, never run.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import type { AdapterConfig } from '../config.ts'
import { ItemList, dataReader, files, flatten, inScope, read, type Scope } from './common.ts'
import { regexItems } from './generic.ts'
import { jsxStrings, vueStrings } from './literals.ts'
import { SPA_ROUTE_DIR, SPA_ROUTE_FILES, spaRoutes } from './react-spa.ts'
import { nuxtRoutes } from './nuxt-routes.ts'
import type { Adapter, InventoryItem } from './types.ts'

type Nextjs = Extract<AdapterConfig, { type: 'nextjs' }>
type Nuxt = Extract<AdapterConfig, { type: 'nuxt' }>
type ReactSpa = Extract<AdapterConfig, { type: 'react-spa' }>
type Framework = Nextjs | Nuxt | ReactSpa

/** `(group)` folders vanish from the URL (Next.js route groups, Nuxt 3.13+). */
const isGroup = (seg: string) => /^\([^.].*\)$/.test(seg)
/** Next.js parallel slots `@x` and intercepting routes `(.)x`, `(..)x`, `(...)x` are not pages of their own. */
const isSlotOrIntercept = (seg: string) => seg.startsWith('@') || /^\(\.{1,3}\)/.test(seg) || /^(\(\.\.\))+/.test(seg)

const toRoute = (segments: string[]) => `/${segments.filter((s) => s && !isGroup(s)).join('/')}`

/** The first existing folder of `candidates` (relative to the project root). */
const firstDir = (root: string, candidates: string[]) => candidates.find((d) => existsSync(join(root, d)))

function nextRoutes(root: string, scope: Scope): InventoryItem[] {
  const list = new ItemList()
  const app = firstDir(root, ['app', 'src/app'])
  if (app) {
    for (const rel of files(root, scope, [`${app}/**/page.{tsx,jsx,ts,js,mdx}`])) {
      const segs = rel.slice(app.length + 1).split('/').slice(0, -1)
      // private folders (_x) are not routable; slots and intercepting routes render inside another page
      if (segs.some((s) => s.startsWith('_') || isSlotOrIntercept(s))) continue
      list.add('route', toRoute(segs), { source: rel })
    }
  }
  const pages = firstDir(root, ['pages', 'src/pages'])
  if (pages) {
    for (const rel of files(root, scope, [`${pages}/**/*.{tsx,jsx,ts,js,mdx}`])) {
      const segs = rel.slice(pages.length + 1).replace(/\.(tsx|jsx|ts|js|mdx)$/, '').split('/')
      if (segs[0] === 'api' || segs.some((s) => s.startsWith('_'))) continue
      if (segs.at(-1) === 'index') segs.pop()
      list.add('route', toRoute(segs), { source: rel })
    }
  }
  return list.list()
}

const I18N_DIRS = ['locales', 'i18n/locales', 'i18n', 'lang', 'messages']

/** `lang -> file` from the config, or found as <dir>/<lang>(-REGION).(json|yaml|yml); empty when there are none. */
function i18nFiles(root: string, scope: Scope, cfg: Framework): Record<string, string> {
  if (cfg.i18n === false) return {}
  if (cfg.i18n) return Object.fromEntries(Object.entries(cfg.i18n).filter(([, rel]) => inScope(scope, rel)))
  for (const dir of I18N_DIRS) {
    const found: Record<string, string> = {}
    for (const rel of files(root, scope, [`${dir}/*.{json,yaml,yml}`])) {
      const m = /\/([a-z]{2,3})(?:[-_][A-Za-z0-9]+)?\.(json|ya?ml)$/.exec(rel)
      if (m && !found[m[1]!]) found[m[1]!] = rel
    }
    if (Object.keys(found).length) return found
  }
  return {}
}

function loadI18n(root: string, rel: string): Map<string, string> {
  const file = join(root, rel)
  if (!existsSync(file)) return new Map()
  const text = readFileSync(file, 'utf8')
  return flatten(rel.endsWith('.json') ? JSON.parse(text) : YAML.parse(text))
}

const NEXT_STRING_FILES = ['app/**/*.{tsx,jsx}', 'src/**/*.{tsx,jsx}', 'components/**/*.{tsx,jsx}', 'pages/**/*.{tsx,jsx}']
const NUXT_STRING_FILES = ['**/*.vue']
const SPA_STRING_FILES = ['src/**/*.{tsx,jsx}']

function frameworkAdapter(cfg: Framework, root: string, scope: Scope, routes: () => InventoryItem[], defaultFiles: string[]): Adapter {
  const i18n = i18nFiles(root, scope, cfg)
  const cache = new Map<string, Map<string, string>>()
  let literals: Map<string, string> | undefined
  const fromSource = () => {
    if (!literals) {
      literals = new Map()
      for (const rel of files(root, scope, cfg.strings.files ?? defaultFiles)) {
        const text = read(root, rel)
        const found = rel.endsWith('.vue') ? vueStrings(text) : rel.endsWith('.mdx') ? new Set<string>() : jsxStrings(rel, text, cfg.strings.literals)
        for (const s of found) literals.set(s, s)
      }
    }
    return literals
  }
  return {
    items() {
      const list = new ItemList()
      for (const i of [...routes(), ...regexItems(root, scope, { roles: cfg.roles, flags: cfg.flags })]) list.add(i.kind, i.id.slice(i.kind.length + 1), { ...(i.label ? { label: i.label } : {}), ...(i.source ? { source: i.source } : {}) })
      return list.list()
    },
    uiStrings(lang) {
      if (!Object.keys(i18n).length) return fromSource()
      const rel = i18n[lang]
      if (rel === undefined) return new Map()
      if (!cache.has(lang)) cache.set(lang, loadI18n(root, rel))
      return cache.get(lang)!
    },
    data: dataReader(root, cfg.data),
  }
}

export const nextjsAdapter = (cfg: Nextjs, root: string, scope: Scope) => frameworkAdapter(cfg, root, scope, () => nextRoutes(root, scope), NEXT_STRING_FILES)
export function nuxtAdapter(cfg: Nuxt, root: string, scope: Scope): Adapter {
  let scan: ReturnType<typeof nuxtRoutes> | undefined
  const scanned = () => (scan ??= nuxtRoutes(root, scope))
  const extra = (): InventoryItem[] => cfg.extraRoutes.map((path) => ({ id: `route:${path}`, kind: 'route', source: 'adapter.extraRoutes' }))
  return { ...frameworkAdapter(cfg, root, scope, () => [...scanned().items, ...extra()], NUXT_STRING_FILES), notes: () => scanned().notes }
}

function reactSpaRoutes(cfg: ReactSpa, root: string, scope: Scope): InventoryItem[] {
  const list = new ItemList()
  for (const r of spaRoutes(root, scope, { files: cfg.routes.files ?? SPA_ROUTE_FILES, dir: cfg.routes.dir ?? SPA_ROUTE_DIR })) list.add('route', r.path, { source: r.source })
  return list.list()
}

export const reactSpaAdapter = (cfg: ReactSpa, root: string, scope: Scope) => frameworkAdapter(cfg, root, scope, () => reactSpaRoutes(cfg, root, scope), SPA_STRING_FILES)
