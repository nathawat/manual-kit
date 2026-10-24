// Everything a command needs about one manual: config, adapter, pages. Loaded once per command.
import { createAdapter, type Adapter } from './adapters/index.ts'
import { loadConfig, type LoadedConfig } from './config.ts'
import { loadPages, type Page, type PageProblem } from './pages.ts'

export interface Project extends LoadedConfig {
  adapter: Adapter
  pages: Page[]
  pageProblems: PageProblem[]
  /** Primary language (first in config). */
  primary: string
}

export async function openProject(manualDir: string): Promise<Project> {
  const loaded = await loadConfig(manualDir)
  const { pages, problems } = loadPages(loaded.manualDir)
  return {
    ...loaded,
    adapter: createAdapter(loaded.config.adapter, loaded.projectRoot, loaded.config.discover),
    pages,
    pageProblems: problems,
    primary: loaded.config.languages[0]!,
  }
}

/** The sidebar group of a page: front matter `group`, else its kind (`kind:how-to`). */
export const groupOf = (page: Page) => page.meta.group ?? `kind:${page.meta.kind}`

/**
 * A book's pages in its menu order: with config books.<id>.groups, the listed groups in that order, then the other
 * groups as they first appear; each group's pages in file order. Without it, file order.
 */
export function inMenuOrder(pages: Page[], groups: { id: string }[] | undefined): Page[] {
  if (!groups?.length) return pages
  const keys = [...groups.map((g) => g.id), ...pages.map(groupOf)]
  const rank = (p: Page) => keys.indexOf(groupOf(p))
  return pages.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
}

/** Whether a page is for one of `audience`: it names one of them, or it names none (a page for everyone). */
export const isFor = (page: Page, audience: readonly string[]) => !page.meta.audience.length || page.meta.audience.some((a) => audience.includes(a))

/**
 * The chapters of a book in a language, in menu order. A role book (books.<id>.from) has no pages of its own: it takes
 * its source book's pages, in the source's order, that are for its audience.
 */
export function bookPages(project: Project, book: string, lang: string): Page[] {
  const conf = project.config.books[book]
  if (conf?.from) {
    const { audience } = conf.from
    return bookPages(project, conf.from.book, lang).filter((p) => isFor(p, audience))
  }
  return inMenuOrder(project.pages.filter((p) => p.lang === lang && p.book === book), conf?.groups)
}

/** Configured books with no chapters in a language: build skips them, so check and build say so. */
export function emptyBooks(project: Project): { book: string; lang: string }[] {
  const out: { book: string; lang: string }[] = []
  for (const book of Object.keys(project.config.books))
    for (const lang of project.config.languages) if (!bookPages(project, book, lang).length) out.push({ book, lang })
  return out
}
