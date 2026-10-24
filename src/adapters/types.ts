// The one interface every project adapter implements. Adapters read code as text/AST; they never run it.

export type ItemKind = 'route' | 'role' | 'permission' | 'section' | 'flag'

/** Something in the product that the manual should cover (a screen, a role, a feature flag...). */
export interface InventoryItem {
  /** `<kind>:<name>`, e.g. `route:/teacher`, `section:teacher.students`. */
  id: string
  kind: ItemKind
  /** Human hint: a UI string key or a description. */
  label?: string
  /** File (relative to the project root) where it was found. */
  source?: string
}

export interface Adapter {
  /** Routes, roles, permissions, sections and flags, sorted by id, no duplicates. */
  items(): InventoryItem[]
  /** UI string key -> text for one language (empty map when the language is unknown). */
  uiStrings(lang: string): Map<string, string>
  /** A scalar value from the project (`ns.path.to.value`), or undefined. */
  data(key: string): string | undefined
  /** What the adapter saw but could not read statically (`source` is `file:line`), for discover to report. */
  notes?(): AdapterNote[]
}

export interface AdapterNote {
  source: string
  message: string
}
