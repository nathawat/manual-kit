// generic: everything comes from globs + regexes in the config. json-i18n: strings from i18n JSON files.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterConfig } from '../config.ts'
import { ItemList, dataReader, extract, files, flatten, inScope, read, regex, type Scope } from './common.ts'
import type { Adapter } from './types.ts'

type Generic = Extract<AdapterConfig, { type: 'generic' }>
type JsonI18n = Extract<AdapterConfig, { type: 'json-i18n' }>
type Spec = { files: string[]; pattern: string; flags?: string | undefined }

export function regexItems(projectRoot: string, scope: Scope, cfg: { routes?: Spec | undefined; roles?: Spec | undefined; flags?: Spec | undefined }) {
  const list = new ItemList()
  for (const kind of ['routes', 'roles', 'flags'] as const) {
    const spec = cfg[kind]
    if (!spec) continue
    const itemKind = kind === 'routes' ? 'route' : kind === 'roles' ? 'role' : 'flag'
    for (const { value, source } of extract(projectRoot, scope, spec)) list.add(itemKind, value, { source })
  }
  return list.list()
}

export function genericAdapter(cfg: Generic, projectRoot: string, scope: Scope): Adapter {
  const cache = new Map<string, Map<string, string>>()
  return {
    items: () => regexItems(projectRoot, scope, cfg),
    uiStrings(lang) {
      const spec = cfg.strings[lang]
      if (!spec) return new Map()
      if (!cache.has(lang)) {
        const map = new Map<string, string>()
        const re = regex(spec.pattern, spec.flags)
        for (const rel of files(projectRoot, scope, spec.files)) {
          for (const m of read(projectRoot, rel).matchAll(re)) {
            const two = m[2] !== undefined && m.groups === undefined
            const value = m.groups?.value ?? (two ? m[2] : m[1]) ?? m[0]
            const key = m.groups?.key ?? (two ? m[1] : value)
            if (key !== undefined && value !== undefined) map.set(key, value)
          }
        }
        cache.set(lang, map)
      }
      return cache.get(lang)!
    },
    data: dataReader(projectRoot, cfg.data),
  }
}

export function jsonI18nAdapter(cfg: JsonI18n, projectRoot: string, scope: Scope): Adapter {
  const cache = new Map<string, Map<string, string>>()
  return {
    items: () => regexItems(projectRoot, scope, cfg),
    uiStrings(lang) {
      const rel = cfg.files[lang]
      if (rel === undefined || !inScope(scope, rel)) return new Map()
      if (!cache.has(lang)) {
        const file = join(projectRoot, rel)
        cache.set(lang, existsSync(file) ? flatten(JSON.parse(readFileSync(file, 'utf8'))) : new Map())
      }
      return cache.get(lang)!
    },
    data: dataReader(projectRoot, cfg.data),
  }
}
