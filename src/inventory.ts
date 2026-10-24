// inventory: adapter items -> coverage.yaml (merge, idempotent).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inScope } from './adapters/common.ts'
import type { InventoryItem } from './adapters/index.ts'
import { autoPages, COVERAGE_FILE, effectiveStatus, matchesAny, readCoverage, serializeCoverage, type CoverageItem } from './coverage.ts'
import type { Project } from './project.ts'

export interface InventoryResult {
  items: CoverageItem[]
  added: string[]
  removed: string[]
  changed: boolean
}

export function mergeCoverage(existing: CoverageItem[], found: InventoryItem[], auto: Map<string, string[]>): Omit<InventoryResult, 'changed'> {
  const byId = new Map(existing.map((i) => [i.id, i]))
  const foundIds = new Set(found.map((f) => f.id))
  const added: string[] = []
  const removed: string[] = []
  const out: CoverageItem[] = []
  for (const f of found) {
    const old = byId.get(f.id)
    if (!old) added.push(f.id)
    const base: CoverageItem = {
      ...old,
      id: f.id,
      kind: f.kind,
      label: f.label,
      source: f.source,
      pages: old?.pages ?? [],
      auto: auto.get(f.id) ?? [],
      status: old?.status === 'removed' ? 'unmapped' : (old?.status ?? 'unmapped'),
    }
    out.push({ ...base, status: effectiveStatus(base, base.auto) })
  }
  for (const old of existing) {
    if (foundIds.has(old.id)) continue
    if (old.status !== 'removed') removed.push(old.id)
    out.push({ ...old, auto: auto.get(old.id) ?? [], status: 'removed' })
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { items: out, added, removed }
}

export function runInventory(project: Project): InventoryResult {
  const { include, exclude } = project.config.coverage
  const found = project.adapter.items().filter((i) => matchesAny(i.id, include) && !matchesAny(i.id, exclude))
  // an item found only in a file now outside `discover` was not removed from the product: it leaves coverage.yaml
  const foundIds = new Set(found.map((f) => f.id))
  const existing = readCoverage(project.manualDir).filter((i) => !i.source || foundIds.has(i.id) || inScope(project.config.discover, i.source))
  const ids = [...new Set([...found.map((f) => f.id), ...existing.map((i) => i.id)])]
  const { map } = autoPages(project.pages, project.primary, ids)
  const result = mergeCoverage(existing, found, map)
  const file = join(project.manualDir, COVERAGE_FILE)
  const text = serializeCoverage(result.items)
  const changed = !existsSync(file) || readFileSync(file, 'utf8') !== text
  if (changed) writeFileSync(file, text)
  return { ...result, changed }
}
