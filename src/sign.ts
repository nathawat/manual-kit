// sign: record what a person reviewed. new-page: start a page in every language from a kind template.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { howToLangs, howToTemplate } from './how-to.ts'
import { currentSignature, readLock, writeLock } from './lock.ts'
import { PAGE_ID, type PageMeta } from './pages.ts'
import type { Project } from './project.ts'

export class UsageError extends Error {
  override name = 'UsageError'
}

export function signPages(project: Project, ids: string[] | 'all'): { signed: string[]; changed: boolean } {
  const known = [...new Set(project.pages.map((p) => p.id))].sort()
  const want = ids === 'all' ? known : ids
  for (const id of want) if (!known.includes(id)) throw new UsageError(`unknown page "${id}"`)
  const lock = readLock(project.manualDir)
  for (const id of want) lock.pages[id] = currentSignature(project, id)
  return { signed: want, changed: writeLock(project.manualDir, lock) }
}

import { TEMPLATES } from './paths.ts'

function template(kind: PageMeta['kind'], lang: string, title?: string): string {
  if (kind === 'how-to') return howToTemplate(howToLangs(lang) ? lang : 'en', title)
  for (const l of [lang, 'en']) {
    const file = new URL(`${kind}.${l}.md`, TEMPLATES)
    if (existsSync(file)) return readFileSync(file, 'utf8')
  }
  return '\n'
}

export interface NewPageOptions {
  kind: PageMeta['kind']
  book: string
  title?: string
}

/** Creates the page in each language that does not have it yet. Returns created paths (relative to the manual folder). */
export function newPage(project: Project, id: string, opts: NewPageOptions): string[] {
  if (!PAGE_ID.test(id)) throw new UsageError(`page id "${id}" must be lower-case letters, digits, ".", "-" or "_"`)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.book)) throw new UsageError(`book "${opts.book}" must be a lower-case folder name`)
  const from = project.config.books[opts.book]?.from
  if (from) throw new UsageError(`book "${opts.book}" is made from "${from.book}" (books.${opts.book}.from) and has no pages of its own: use --book ${from.book} and set the page's audience`)
  const existing = project.pages.filter((p) => p.id === id)
  const fileName =
    existing[0]?.file.split(/[\\/]/).pop() ??
    (() => {
      const nums = project.config.languages.flatMap((lang) => {
        const dir = join(project.manualDir, 'pages', lang, opts.book)
        return existsSync(dir) ? readdirSync(dir).map((f) => Number.parseInt(f, 10)).filter((n) => Number.isFinite(n)) : []
      })
      const next = String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0')
      return `${next}-${id.split('.').pop()}.md`
    })()
  const created: string[] = []
  for (const lang of project.config.languages) {
    if (existing.some((p) => p.lang === lang)) continue
    const dir = join(project.manualDir, 'pages', lang, opts.book)
    mkdirSync(dir, { recursive: true })
    const rel = `pages/${lang}/${opts.book}/${fileName}`
    const front = [`id: ${id}`, `title: ${YAML.stringify(opts.title ?? id).trim()}`, 'audience: []', `book: ${opts.book}`, `kind: ${opts.kind}`, 'routes: []', 'covers: []', 'sources: []']
    writeFileSync(join(project.manualDir, rel), `---\n${front.join('\n')}\n---\n${template(opts.kind, lang, opts.title)}`)
    created.push(rel)
  }
  return created
}
