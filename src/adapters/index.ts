import type { z } from 'zod'
import { AdapterConfig } from '../config.ts'
import { EVERYWHERE, ItemList, dataReader, files, read, type Scope } from './common.ts'
import { nextjsAdapter, nuxtAdapter, reactSpaAdapter } from './frameworks.ts'
import { genericAdapter, jsonI18nAdapter } from './generic.ts'
import type { Adapter, InventoryItem } from './types.ts'

export type { Adapter, InventoryItem, ItemKind } from './types.ts'
export type { Scope } from './common.ts'

function baseAdapter(cfg: AdapterConfig, projectRoot: string, scope: Scope): Adapter {
  switch (cfg.type) {
    case 'generic':
      return genericAdapter(cfg, projectRoot, scope)
    case 'json-i18n':
      return jsonI18nAdapter(cfg, projectRoot, scope)
    case 'nextjs':
      return nextjsAdapter(cfg, projectRoot, scope)
    case 'nuxt':
      return nuxtAdapter(cfg, projectRoot, scope)
    case 'react-spa':
      return reactSpaAdapter(cfg, projectRoot, scope)
    case 'none':
      return { items: () => [], uiStrings: () => new Map(), data: dataReader(projectRoot, cfg.data) }
  }
}

const COMPONENT_FILES = ['**/*.{tsx,jsx,ts,js,vue,svelte}']

/** The file that defines component `name`: a file named after it, else a function/class/const declaration. */
function findComponent(projectRoot: string, name: string, all: () => string[]): string | undefined {
  const byName = all().find((f) => f.replace(/^.*\//, '').replace(/\.\w+$/, '') === name)
  if (byName) return byName
  const decl = new RegExp(`\\b(?:function|class|const|let|var)\\s+${name.replace(/\$/g, '\\$')}\\b`)
  return all().find((f) => !f.endsWith('.vue') && decl.test(read(projectRoot, f)))
}

/** Configured in-page sections as `section:<id>` items; a component section exists only while the component does. */
function sectionItems(cfg: AdapterConfig, projectRoot: string, scope: Scope): InventoryItem[] {
  const list = new ItemList()
  let cached: string[] | undefined
  const all = () => (cached ??= files(projectRoot, scope, COMPONENT_FILES))
  for (const s of cfg.sections) {
    const on = s.route ? ` (on ${s.route})` : ''
    if (s.component) {
      const source = findComponent(projectRoot, s.component, all)
      if (source) list.add('section', s.id, { label: `${s.label ?? s.component}${on}`, source })
    } else list.add('section', s.id, { label: `${s.label ?? s.selector!}${on}` })
  }
  return list.list()
}

/** Takes a parsed adapter config or its raw form (defaults are applied here). Files outside `scope` are never read. */
export function createAdapter(input: z.input<typeof AdapterConfig>, projectRoot: string, scope: Scope = EVERYWHERE): Adapter {
  const cfg = AdapterConfig.parse(input)
  const base = baseAdapter(cfg, projectRoot, scope)
  if (!cfg.sections.length) return base
  return {
    ...base,
    items() {
      const list = new ItemList()
      for (const i of [...base.items(), ...sectionItems(cfg, projectRoot, scope)]) {
        const { id, kind, ...extra } = i
        list.add(kind, id.slice(kind.length + 1), extra)
      }
      return list.list()
    },
  }
}
