// Nuxt routes read from the code, never run: pages/ files (Nuxt 3/4 `[id]`, Nuxt 2 `_id`), definePageMeta path and
// alias, the pages:extend hook and Nuxt 2 router.extendRoutes in nuxt.config, router.options.ts routes, and
// @nuxtjs/i18n per-locale paths. A value that is not a literal is skipped with a note naming file:line.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type * as TS from 'typescript'
import { lazyDep } from '../deps.ts'
import { files, read, type Scope } from './common.ts'
import type { AdapterNote, InventoryItem } from './types.ts'

const ts = lazyDep<typeof TS>('typescript')

interface Route {
  path: string
  /** `file` or `file:line`. */
  source: string
  name?: string
  /** pages/-relative file without extension (`users/[id]`), the key @nuxtjs/i18n `pages` uses. */
  key?: string
  details: string[]
}

const PAGES_DIRS = ['pages', 'app/pages', 'src/pages']
const CONFIGS = ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs']
const ROUTER_OPTIONS = ['app/router.options.ts', 'router.options.ts', 'src/router.options.ts', 'app/router.options.js', 'router.options.js']
const FIX = 'add it to adapter.extraRoutes'

const isGroup = (seg: string) => /^\([^.].*\)$/.test(seg)

function nuxtMajor(root: string): 2 | 3 {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    const v = pkg.dependencies?.nuxt ?? pkg.devDependencies?.nuxt ?? ''
    return /^[\^~>=\s]*2\./.test(v) || pkg.dependencies?.['nuxt-edge'] ? 2 : 3
  } catch {
    return 3
  }
}

/** One file-name segment as a path segment: `[id]` -> `:id`, `[[opt]]` -> `:opt?`, `[...slug]` -> `:slug(.*)*`; Nuxt 2 `_id` -> `:id`. */
function pathSegment(seg: string, major: 2 | 3): string {
  if (major === 2) return seg === '_' ? '*' : seg.startsWith('_') ? `:${seg.slice(1)}` : seg
  return seg
    .replace(/\[\[([^\]]+)\]\]/g, ':$1?')
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1(.*)*')
    .replace(/\[([^\]]+)\]/g, ':$1')
}

const nameSegment = (seg: string, major: 2 | 3) => (major === 2 ? seg.replace(/^_/, '') : seg.replace(/\[+(?:\.\.\.)?([^\]]+)\]+/g, '$1'))

const joinPath = (parent: string, child: string) => (child.startsWith('/') ? child : `${parent.replace(/\/$/, '')}/${child}`.replace(/\/$/, '') || '/')

class Routes {
  readonly notes: AdapterNote[] = []
  private list: Route[] = []
  add(r: Omit<Route, 'details'> & { details?: string[] }) {
    const same = this.list.find((x) => x.path === r.path)
    if (same) same.details.push(...(r.details ?? []))
    else this.list.push({ ...r, details: [...(r.details ?? [])] })
  }
  remove(by: { path?: string; name?: string }) {
    this.list = this.list.filter((r) => !(by.path !== undefined ? r.path === by.path : r.name === by.name))
  }
  clear() {
    this.list = []
  }
  find = (pred: (r: Route) => boolean) => this.list.find(pred)
  note(source: string, message: string) {
    this.notes.push({ source, message })
  }
  items(): InventoryItem[] {
    return this.list.map((r) => ({ id: `route:${r.path}`, kind: 'route', source: r.source, ...(r.details.length ? { label: [...new Set(r.details)].join('; ') } : {}) }))
  }
}

/** Scripts in a file: the whole file, or each `<script>` block of a .vue file with the line it starts on. */
function scripts(rel: string, text: string): { sf: TS.SourceFile; line0: number }[] {
  if (!rel.endsWith('.vue')) return [{ sf: parseFile(rel, text), line0: 0 }]
  return [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => {
    const lang = /\blang=["']tsx?["']/.test(m[1]!) ? ts.ScriptKind.TS : ts.ScriptKind.JS
    const line0 = text.slice(0, m.index! + m[0].indexOf('>') + 1).split('\n').length - 1
    return { sf: ts.createSourceFile(rel, m[2]!, ts.ScriptTarget.Latest, true, lang), line0 }
  })
}

const parseFile = (rel: string, text: string) =>
  ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.JS)

type At = (n: TS.Node) => string

function walk(node: TS.Node, fn: (n: TS.Node) => void) {
  fn(node)
  node.forEachChild((c) => walk(c, fn))
}

function unwrap(e: TS.Expression): TS.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression
  return e
}

const literal = (e: TS.Expression | undefined): string | undefined => {
  if (!e) return undefined
  const u = unwrap(e)
  return ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u) ? u.text : undefined
}

const keyName = (n: TS.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : undefined)

/** The value of property `name` in an object literal (a method counts as its own function). */
function prop(obj: TS.ObjectLiteralExpression, name: string): TS.Expression | TS.MethodDeclaration | undefined {
  for (const p of obj.properties) {
    if (!p.name || keyName(p.name) !== name) continue
    if (ts.isPropertyAssignment(p)) return unwrap(p.initializer)
    if (ts.isMethodDeclaration(p)) return p
    if (ts.isShorthandPropertyAssignment(p)) return p.name
  }
  return undefined
}

type Fn = TS.ArrowFunction | TS.FunctionExpression | TS.MethodDeclaration
const isFn = (n: TS.Node | undefined): n is Fn => !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n))
const firstParam = (f: Fn) => (f.parameters[0] && ts.isIdentifier(f.parameters[0].name) ? f.parameters[0].name.text : undefined)

/** Calls to `name(...)` anywhere in the file. */
function calls(sf: TS.SourceFile, name: string): TS.CallExpression[] {
  const out: TS.CallExpression[] = []
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) out.push(n)
  })
  return out
}

/** The config object of nuxt.config: `defineNuxtConfig({...})`, `export default {...}` or `module.exports = {...}`. */
function configObject(sf: TS.SourceFile): TS.ObjectLiteralExpression | undefined {
  const call = calls(sf, 'defineNuxtConfig')[0]?.arguments[0]
  if (call && ts.isObjectLiteralExpression(unwrap(call))) return unwrap(call) as TS.ObjectLiteralExpression
  let found: TS.ObjectLiteralExpression | undefined
  walk(sf, (n) => {
    if (found) return
    const value = ts.isExportAssignment(n)
      ? n.expression
      : ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getText(sf) === 'module.exports'
        ? n.right
        : undefined
    if (value && ts.isObjectLiteralExpression(unwrap(value))) found = unwrap(value) as TS.ObjectLiteralExpression
  })
  return found
}

/** A route record literal (`{ path, alias, children }`): its routes, or a note when the path is not a literal. */
function record(obj: TS.Expression, parent: string, at: At, routes: Routes, origin: string, file?: string) {
  const o = unwrap(obj)
  if (!ts.isObjectLiteralExpression(o)) return routes.note(at(obj), `${origin}: a route that is not an object literal is skipped; ${FIX}`)
  const pathExpr = prop(o, 'path')
  const path = pathExpr && !ts.isMethodDeclaration(pathExpr) ? literal(pathExpr) : undefined
  if (path === undefined) return routes.note(at(o), `${origin}: a route whose path is not a literal is skipped; ${FIX}`)
  const full = joinPath(parent, path)
  const nameExpr = prop(o, 'name')
  const name = nameExpr && !ts.isMethodDeclaration(nameExpr) ? literal(nameExpr) : undefined
  const fileExpr = prop(o, 'file')
  const target = file ?? (fileExpr && !ts.isMethodDeclaration(fileExpr) ? literal(fileExpr) : undefined)
  routes.add({ path: full, source: at(o), ...(name ? { name } : {}), details: [`added by ${origin}`, ...(target ? [`file ${target}`] : [])] })
  aliases(prop(o, 'alias'), full, parent, at, routes)
  const children = prop(o, 'children')
  if (children && !ts.isMethodDeclaration(children)) {
    if (ts.isArrayLiteralExpression(children)) for (const c of children.elements) record(c, full, at, routes, origin)
    else routes.note(at(children), `${origin}: children of ${full} are not an array literal and are skipped; ${FIX}`)
  }
}

function aliases(alias: TS.Expression | TS.MethodDeclaration | undefined, of: string, parent: string, at: At, routes: Routes) {
  if (!alias || ts.isMethodDeclaration(alias)) return
  const list = ts.isArrayLiteralExpression(alias) ? [...alias.elements] : [alias]
  for (const a of list) {
    const p = literal(a)
    if (p === undefined) routes.note(at(a), `an alias of ${of} is not a literal and is skipped; ${FIX}`)
    else routes.add({ path: joinPath(parent, p), source: at(a), details: [`alias of ${of}`] })
  }
}

/** pages:extend (Nuxt 3) or router.extendRoutes (Nuxt 2): literal push/unshift add pages, splice(findIndex(...)) removes. */
function extendHook(fn: Fn, at: At, routes: Routes, origin: string) {
  const list = firstParam(fn)
  if (!list || !fn.body) return
  walk(fn.body, (n) => {
    if (!ts.isCallExpression(n)) return
    const callee = n.expression
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === list) {
      const method = callee.name.text
      if (method === 'push' || method === 'unshift') for (const a of n.arguments) record(a, '/', at, routes, origin)
      else if (method === 'splice') {
        const by = removalTarget(n.arguments[0], list)
        if (by) routes.remove(by)
        else routes.note(at(n), `${origin}: a removal that is not statically clear is ignored; remove the page from coverage if it is gone`)
      } else if (method === 'pop' || method === 'shift') routes.note(at(n), `${origin}: ${list}.${method}() is not followed; check the routes by hand`)
    } else if (n.arguments.some((a) => ts.isIdentifier(a) && a.text === list) && !ts.isPropertyAccessExpression(callee))
      routes.note(at(n), `${origin}: ${list} is passed to ${callee.getText()}(), whose changes are not read; check the routes it adds or removes and ${FIX}`)
  })
}

/** `list.findIndex(p => p.path === '/x')` (or `.name`) as the first argument of splice. */
function removalTarget(arg: TS.Expression | undefined, list: string): { path?: string; name?: string } | undefined {
  if (!arg) return undefined
  const call = unwrap(arg)
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return undefined
  if (call.expression.name.text !== 'findIndex' || call.expression.expression.getText() !== list) return undefined
  const pred = call.arguments[0]
  if (!pred || !ts.isArrowFunction(pred) || !ts.isBinaryExpression(pred.body)) return undefined
  const b = pred.body
  if (![ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(b.operatorToken.kind)) return undefined
  const [access, value] = ts.isPropertyAccessExpression(b.left) ? [b.left, b.right] : ts.isPropertyAccessExpression(b.right) ? [b.right, b.left] : []
  const v = literal(value)
  if (!access || v === undefined) return undefined
  return access.name.text === 'path' ? { path: v } : access.name.text === 'name' ? { name: v } : undefined
}

/** `routes: (_routes) => [...]`: literal entries; without `..._routes` the file routes are replaced. */
function routerOptions(root: string, routes: Routes) {
  const rel = ROUTER_OPTIONS.find((f) => existsSync(join(root, f)))
  if (!rel) return
  const sf = parseFile(rel, read(root, rel))
  const at: At = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
  let opts: TS.ObjectLiteralExpression | undefined
  walk(sf, (n) => {
    if (!opts && ts.isExportAssignment(n) && ts.isObjectLiteralExpression(unwrap(n.expression))) opts = unwrap(n.expression) as TS.ObjectLiteralExpression
  })
  const fn = opts && prop(opts, 'routes')
  if (!isFn(fn)) {
    if (fn) routes.note(at(fn), `routes is not a function literal and is not read; ${FIX}`)
    return
  }
  let result: TS.Expression | undefined
  if (fn.body && !ts.isBlock(fn.body)) result = unwrap(fn.body)
  else if (fn.body) for (const s of fn.body.statements) if (ts.isReturnStatement(s) && s.expression) result = unwrap(s.expression)
  if (!result || !ts.isArrayLiteralExpression(result)) return routes.note(at(fn), `routes does not return an array literal and is not read; ${FIX}`)
  const param = firstParam(fn)
  const keeps = result.elements.some((e) => ts.isSpreadElement(e) && ts.isIdentifier(e.expression) && e.expression.text === param)
  if (!keeps) routes.clear()
  for (const e of result.elements) {
    if (ts.isSpreadElement(e)) {
      if (!(ts.isIdentifier(e.expression) && e.expression.text === param)) routes.note(at(e), `a spread in routes is not read; ${FIX}`)
    } else record(e, '/', at, routes, 'router.options')
  }
}

/** @nuxtjs/i18n options: the top-level `i18n` key or the options of `['@nuxtjs/i18n', {...}]` in modules. */
function i18nOptions(cfg: TS.ObjectLiteralExpression): TS.ObjectLiteralExpression | undefined {
  const top = prop(cfg, 'i18n')
  if (top && ts.isObjectLiteralExpression(top)) return top
  const modules = prop(cfg, 'modules')
  if (!modules || !ts.isArrayLiteralExpression(modules)) return undefined
  for (const m of modules.elements) {
    if (ts.isArrayLiteralExpression(m) && literal(m.elements[0]) === '@nuxtjs/i18n' && m.elements[1] && ts.isObjectLiteralExpression(unwrap(m.elements[1])))
      return unwrap(m.elements[1]) as TS.ObjectLiteralExpression
  }
  return undefined
}

/** Per-locale paths (`{ en: '/about-us', fr: '/a-propos' }`) as alternates of `route`. */
function localePaths(obj: TS.Expression, route: Route, at: At, routes: Routes) {
  const o = unwrap(obj)
  if (!ts.isObjectLiteralExpression(o)) return routes.note(at(obj), `i18n paths for ${route.path} are not an object literal and are skipped`)
  for (const p of o.properties) {
    const locale = p.name && keyName(p.name)
    if (!ts.isPropertyAssignment(p) || !locale) continue
    if (unwrap(p.initializer).kind === ts.SyntaxKind.FalseKeyword) continue
    const path = literal(p.initializer)
    if (path === undefined) routes.note(at(p), `i18n path for ${route.path} (${locale}) is not a literal and is skipped`)
    else route.details.push(`i18n ${locale}: ${path}`)
  }
}

function nuxtConfig(root: string, routes: Routes, major: 2 | 3) {
  const rel = CONFIGS.find((f) => existsSync(join(root, f)))
  if (!rel) return
  const sf = parseFile(rel, read(root, rel))
  const at: At = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
  const cfg = configObject(sf)
  if (!cfg) return
  const hooks = prop(cfg, 'hooks')
  if (hooks && ts.isObjectLiteralExpression(hooks)) {
    const fn = prop(hooks, 'pages:extend')
    if (isFn(fn)) extendHook(fn, at, routes, 'pages:extend')
    else if (fn) routes.note(at(fn), `pages:extend is not a function literal and is not read; ${FIX}`)
  }
  const router = prop(cfg, 'router')
  if (major === 2 && router && ts.isObjectLiteralExpression(router)) {
    const fn = prop(router, 'extendRoutes')
    if (isFn(fn)) extendHook(fn, at, routes, 'router.extendRoutes')
  }
  const i18n = i18nOptions(cfg)
  const pages = i18n && prop(i18n, 'pages')
  if (pages && ts.isObjectLiteralExpression(pages)) {
    for (const p of pages.properties) {
      const key = p.name && keyName(p.name)
      if (!ts.isPropertyAssignment(p) || !key) continue
      const route = routes.find((r) => r.key === key || r.name === key || r.key === `${key}/index`)
      if (route) localePaths(p.initializer, route, at, routes)
      else routes.note(at(p), `i18n pages key "${key}" matches no page`)
    }
  } else if (pages) routes.note(at(pages), `i18n pages is not an object literal and is not read`)
}

/** Every route of a Nuxt project with its source, plus notes for what could not be read statically. */
export function nuxtRoutes(root: string, scope: Scope): { items: InventoryItem[]; notes: AdapterNote[] } {
  const routes = new Routes()
  const major = nuxtMajor(root)
  const pages = PAGES_DIRS.find((d) => existsSync(join(root, d)))
  if (pages) {
    const all = files(root, scope, [`${pages}/**/*.vue`])
    const keys = new Set(all.map((rel) => rel.slice(pages.length + 1).replace(/\.vue$/, '')))
    for (const rel of all) {
      const key = rel.slice(pages.length + 1).replace(/\.vue$/, '')
      const segs = key.split('/').filter((s) => !isGroup(s))
      const tail = segs.at(-1) === 'index' ? segs.slice(0, -1) : segs
      const path = `/${tail.map((s) => pathSegment(s, major)).join('/')}`
      const name = tail.map((s) => nameSegment(s, major)).join('-') || 'index'
      // nested: `parent.vue` next to `parent/` renders this page inside it
      const parentKey = key.split('/').slice(0, -1).join('/')
      const parent = parentKey && keys.has(parentKey) ? `/${parentKey.split('/').filter((s) => !isGroup(s)).map((s) => pathSegment(s, major)).join('/')}` : undefined
      const route: Route = { path, source: rel, name, key, details: parent && path !== parent ? [`nested in ${parent}`] : [] }
      pageMeta(root, rel, route, parent ?? '/', routes)
    }
  }
  nuxtConfig(root, routes, major)
  routerOptions(root, routes)
  return { items: routes.items(), notes: routes.notes }
}

/** A page file's route after definePageMeta (path, name, alias) and defineI18nRoute (per-locale paths). */
function pageMeta(root: string, rel: string, route: Route, parent: string, routes: Routes) {
  const text = read(root, rel)
  const metas: { call: TS.CallExpression; at: At }[] = []
  const i18n: { call: TS.CallExpression; at: At }[] = []
  if (/definePageMeta|defineI18nRoute/.test(text)) {
    for (const { sf, line0 } of scripts(rel, text)) {
      const at: At = (n) => `${rel}:${line0 + sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
      for (const call of calls(sf, 'definePageMeta')) metas.push({ call, at })
      for (const call of calls(sf, 'defineI18nRoute')) i18n.push({ call, at })
    }
  }
  const after: (() => void)[] = []
  for (const { call, at } of metas) {
    const arg = call.arguments[0] && unwrap(call.arguments[0])
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue
    const path = prop(arg, 'path')
    if (path && !ts.isMethodDeclaration(path)) {
      const p = literal(path)
      if (p === undefined) routes.note(at(path), `definePageMeta path is not a literal, so the file path ${route.path} is used; if the real path differs, ${FIX}`)
      else Object.assign(route, { path: joinPath(parent, p), source: at(path) })
    }
    const name = prop(arg, 'name')
    const n = name && !ts.isMethodDeclaration(name) ? literal(name) : undefined
    if (n) route.name = n
    after.push(() => aliases(prop(arg, 'alias'), route.path, parent, at, routes))
  }
  for (const { call, at } of i18n) {
    const arg = call.arguments[0] && unwrap(call.arguments[0])
    const paths = arg && ts.isObjectLiteralExpression(arg) ? prop(arg, 'paths') : undefined
    if (paths && !ts.isMethodDeclaration(paths)) localePaths(paths, route, at, routes)
  }
  routes.add(route)
  for (const f of after) f()
}
