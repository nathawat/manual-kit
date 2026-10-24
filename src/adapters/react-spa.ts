// react-spa: routes of a client-side React app (Vite and the like) read from the code with the TypeScript parser.
// <Route path> elements (React Router, wouter), route objects (createBrowserRouter, useRoutes) and TanStack Router
// file routes. Each route names the file and line it is defined on. Code is read, never run.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type * as TS from 'typescript'
import { files, read, type Scope } from './common.ts'
import { scriptKind, stringOf, ts } from './literals.ts'

export interface SpaRoute {
  path: string
  /** `file:line`, relative to the project root. */
  source: string
}

export interface SpaRouteOptions {
  /** Files searched for <Route> elements and route objects. */
  files: string[]
  /** TanStack Router's file-route folder, or false. */
  dir: string | false
}

export const SPA_ROUTE_FILES = ['src/**/*.{tsx,jsx,ts,js}']
export const SPA_ROUTE_DIR = 'src/routes'

const NOT_APP_CODE = /(\.(test|spec|stories)\.\w+$)|(^|\/)__tests__\//
const MENTIONS_ROUTES = /<Route\b|\bcreate(Browser|Hash|Memory)Router\b|\buseRoutes\b|\bRouteObject\b/
const ROUTER_CALLS = new Set(['createBrowserRouter', 'createHashRouter', 'createMemoryRouter', 'useRoutes'])

/** Where a route's children hang: `undefined` when the parent path is not a literal (relative children are unknown). */
interface Parent {
  path: string | undefined
  /** wouter `nest`: child paths are relative even when they start with "/". */
  nest: boolean
}
const ROOT: Parent = { path: '', nest: false }

const normalize = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`

/** The full path of `child` under `parent`, or undefined when it cannot be known from the code. */
function joinPath(parent: Parent, child: string): string | undefined {
  if (child.startsWith('/') && !parent.nest) return normalize(child)
  return parent.path === undefined ? undefined : normalize(`${parent.path}/${child}`)
}

export function spaRoutes(root: string, scope: Scope, opts: SpaRouteOptions): SpaRoute[] {
  const out: SpaRoute[] = []
  for (const rel of files(root, scope, opts.files)) {
    if (NOT_APP_CODE.test(rel)) continue
    const text = read(root, rel)
    if (MENTIONS_ROUTES.test(text)) out.push(...codeRoutes(rel, text))
  }
  if (opts.dir && existsSync(join(root, opts.dir))) out.push(...fileRoutes(root, scope, opts.dir))
  return out
}

function codeRoutes(rel: string, text: string): SpaRoute[] {
  const out: SpaRoute[] = []
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, scriptKind(rel))
  const at = (n: TS.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
  const emit = (path: string | undefined, n: TS.Node) => path !== undefined && out.push({ path, source: at(n) })

  const arrays = new Set<TS.ArrayLiteralExpression>()
  /** Array literals by the variable they initialize, and the variables handed to createBrowserRouter / useRoutes. */
  const named = new Map<string, TS.ArrayLiteralExpression>()
  const handed = new Set<string>()

  const visit = (n: TS.Node, parent: Parent): void => {
    const el = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined
    if (el && el.tagName.getText(sf) === 'Route') {
      const attr = (name: string) => el.attributes.properties.find((p): p is TS.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === name)
      const pathAttr = attr('path')
      const init = pathAttr?.initializer
      const raw = init && (ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) ? stringOf(init.expression) : undefined)
      const path = !pathAttr ? parent.path : raw === undefined ? undefined : joinPath(parent, raw)
      if (pathAttr) emit(path, pathAttr)
      else if (attr('index')) emit(joinPath(parent, ''), el)
      if (ts.isJsxElement(n)) for (const c of n.children) visit(c, { path, nest: pathAttr ? !!attr('nest') : parent.nest })
      return
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ROUTER_CALLS.has(n.expression.text)) {
      const arg = n.arguments[0] && unwrap(n.arguments[0])
      if (arg && ts.isArrayLiteralExpression(arg)) arrays.add(arg)
      else if (arg && ts.isIdentifier(arg)) handed.add(arg.text)
    }
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isIdentifier(n.name)) {
      const init = unwrap(n.initializer)
      if (ts.isArrayLiteralExpression(init)) {
        named.set(n.name.text, init)
        if (typedAsRoutes(n.type) || typedAsRoutes(satisfied(n.initializer))) arrays.add(init)
      }
    }
    n.forEachChild((c) => visit(c, parent))
  }
  visit(sf, ROOT)
  for (const name of handed) if (named.has(name)) arrays.add(named.get(name)!)

  const visitObjects = (array: TS.ArrayLiteralExpression, parent: Parent) => {
    for (const el of array.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue
      const prop = (name: string) =>
        el.properties.find((p): p is TS.PropertyAssignment => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name)
      const pathProp = prop('path')
      const raw = pathProp && stringOf(pathProp.initializer)
      const path = !pathProp ? parent.path : raw === undefined ? undefined : joinPath(parent, raw)
      if (pathProp) emit(path, pathProp)
      else if (prop('index')?.initializer.kind === ts.SyntaxKind.TrueKeyword) emit(joinPath(parent, ''), el)
      const children = prop('children') && unwrap(prop('children')!.initializer)
      if (children && ts.isArrayLiteralExpression(children)) visitObjects(children, { path, nest: false })
    }
  }
  for (const a of arrays) visitObjects(a, ROOT)
  return out
}

/** `x as T`, `x satisfies T` and `(x)` are still x. */
function unwrap(e: TS.Expression): TS.Expression {
  if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) return unwrap(e.expression)
  return e
}

/** The type in `x satisfies T` / `x as T`. */
function satisfied(e: TS.Expression): TS.TypeNode | undefined {
  if (ts.isSatisfiesExpression(e) || ts.isAsExpression(e)) return e.type
  return ts.isParenthesizedExpression(e) ? satisfied(e.expression) : undefined
}

const typedAsRoutes = (t: TS.TypeNode | undefined) => !!t && /\bRouteObject\b/.test(t.getText())

/**
 * TanStack Router file routes: folders and `.` both separate segments, `index` and `route` are their folder, `$id`
 * becomes `:id` and a lone `$` the splat `*`, `_layout` segments and `(group)` folders leave the URL, a trailing `_`
 * (`posts_`) only un-nests, `-x` files and `__root` are not routes. Only files that call createFileRoute count.
 */
function fileRoutes(root: string, scope: Scope, dir: string): SpaRoute[] {
  const out: SpaRoute[] = []
  for (const rel of files(root, scope, [`${dir}/**/*.{tsx,jsx,ts,js}`])) {
    const text = read(root, rel)
    const call = /\bcreate(?:Lazy)?FileRoute\s*\(/.exec(text)
    if (!call) continue
    const path = fileRoutePath(rel.slice(dir.length + 1))
    if (path !== undefined) out.push({ path, source: `${rel}:${text.slice(0, call.index).split('\n').length}` })
  }
  return out
}

export function fileRoutePath(file: string): string | undefined {
  const segs = file.replace(/\.(tsx|jsx|ts|js)$/, '').replace(/\.lazy$/, '').split(/[/.]/)
  if (segs.some((s) => s.startsWith('-'))) return undefined
  const last = segs.at(-1)!
  if (last === 'index' || last === 'route') segs.pop()
  else if (last.startsWith('_')) return undefined
  const url = segs
    .filter((s) => !s.startsWith('_') && !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/_$/, ''))
    .map((s) => (s === '$' ? '*' : s.replace(/^\$/, ':')))
  return normalize(url.join('/'))
}
