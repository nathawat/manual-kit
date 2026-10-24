// Helpers shared by adapters: globbing, regex extraction, data files, item lists.
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, matchesGlob } from 'node:path'
import YAML from 'yaml'
import type { InventoryItem, ItemKind } from './types.ts'

/** Build output and dependency folders never hold source to read. */
const SKIP = /(^|[\\/])(node_modules|\.git|\.next|\.nuxt|\.output|\.svelte-kit|\.turbo|\.vercel)([\\/]|$)/

/** Which paths (globs relative to projectRoot) the code is read from: config `discover`. Empty include = all. */
export interface Scope {
  include: string[]
  exclude: string[]
}

export const EVERYWHERE: Scope = { include: [], exclude: [] }

/**
 * A glob names a file or any folder above it: `prototype` and `prototype/**` both cover `prototype/src/a.ts` and
 * `prototype/.env.example` (a trailing `/**` names the folder, since `**` alone skips dot files).
 */
const covered = (rel: string, globs: string[]) => {
  const parts = rel.split('/')
  const folders = globs.map((g) => g.replace(/(.)\/\*\*$/, '$1'))
  return parts.some((_, i) => folders.some((g) => matchesGlob(parts.slice(0, i + 1).join('/'), g)))
}

const excluded = (scope: Scope, rel: string) => covered(rel, scope.exclude)

export const inScope = (scope: Scope, rel: string) => (!scope.include.length || covered(rel, scope.include)) && !excluded(scope, rel)

export function files(projectRoot: string, scope: Scope, patterns: string[]): string[] {
  const found = globSync(patterns.flatMap(dotSafe), { cwd: projectRoot, exclude: (f) => SKIP.test(f) || excluded(scope, f.split('\\').join('/')) }).map((f) => f.split('\\').join('/'))
  return [...new Set(found)].filter((f) => inScope(scope, f)).sort()
}

/**
 * Node's globSync before 22.23 lets `**` match no folder only when the next part is not a dot file: `**\/.env.example`
 * found nothing. Each `**\/.x` is also asked as `.x` and `**\/*\/.x`, which every version matches.
 */
function dotSafe(pattern: string): string[] {
  const i = pattern.indexOf('**/.')
  if (i < 0) return [pattern]
  const head = pattern.slice(0, i)
  const rest = dotSafe(pattern.slice(i + 3))
  return rest.flatMap((r) => [`${head}${r}`, `${head}**/*/${r}`])
}

export const read = (projectRoot: string, rel: string) => readFileSync(join(projectRoot, rel), 'utf8')

/** A capture that contains quoted strings yields each of them; otherwise the trimmed capture. */
export function splitCapture(capture: string): string[] {
  const quoted = [...capture.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]!)
  return quoted.length ? quoted : [capture.trim()].filter(Boolean)
}

/** Every value captured by `pattern` (named group `value`, else group 1, else the whole match). */
export function extract(projectRoot: string, scope: Scope, spec: { files: string[]; pattern: string; flags?: string | undefined }): { value: string; source: string }[] {
  const out: { value: string; source: string }[] = []
  const re = regex(spec.pattern, spec.flags)
  for (const rel of files(projectRoot, scope, spec.files)) {
    for (const m of read(projectRoot, rel).matchAll(re)) {
      const cap = m.groups?.value ?? m[1] ?? m[0]
      for (const value of splitCapture(cap)) out.push({ value, source: rel })
    }
  }
  return out
}

/** A global RegExp with the configured extra flags. */
export const regex = (pattern: string, flags = '') => new RegExp(pattern, `g${flags.replace(/g/g, '')}`)

export class ItemList {
  private map = new Map<string, InventoryItem>()
  add(kind: ItemKind, name: string, extra: { label?: string; source?: string } = {}) {
    const id = `${kind}:${name}`
    if (!this.map.has(id)) this.map.set(id, { id, kind, ...extra })
  }
  list(): InventoryItem[] {
    return [...this.map.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }
}

/** `{{data:ns.a.b}}`: `ns` names a JSON/YAML file (relative to projectRoot); `a.b` walks into it. Scalars only. */
export function dataReader(projectRoot: string, dataFiles: Record<string, string>) {
  const cache = new Map<string, unknown>()
  const load = (ns: string): unknown => {
    if (cache.has(ns)) return cache.get(ns)
    const rel = dataFiles[ns]
    const file = rel === undefined ? undefined : join(projectRoot, rel)
    const value = file && existsSync(file) ? (file.endsWith('.json') ? JSON.parse(readFileSync(file, 'utf8')) : YAML.parse(readFileSync(file, 'utf8'))) : undefined
    cache.set(ns, value)
    return value
  }
  return (key: string): string | undefined => {
    const [ns, ...path] = key.split('.')
    let v: unknown = load(ns!)
    for (const p of path) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[p] : undefined
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined
  }
}

/** Flatten nested i18n JSON (`{a:{b:"x"}}` -> `a.b`). */
export function flatten(obj: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (obj === null || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else flatten(v, key, out)
  }
  return out
}
