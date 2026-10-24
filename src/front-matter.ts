// The formal parts around the content: cover, document control, revision history, approval, lists, intro,
// appendix. Built as plain data here; the PDF and DOCX builders lay it out.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { localize, type Localized } from './config.ts'
import type { Project } from './project.ts'
import type { Caption, RenderedBook } from './render.ts'

const WORDS = {
  th: {
    docNumber: 'เลขที่เอกสาร',
    docTitle: 'ชื่อเอกสาร',
    version: 'เวอร์ชัน',
    date: 'วันที่',
    classification: 'ระดับชั้นความลับ',
    client: 'ลูกค้า',
    project: 'โครงการ',
    preparedBy: 'จัดทำโดย',
    control: 'ข้อมูลเอกสาร',
    revisions: 'ประวัติการแก้ไข',
    author: 'ผู้แก้ไข',
    changes: 'รายละเอียด',
    approval: 'การอนุมัติเอกสาร',
    name: 'ชื่อ',
    role: 'ตำแหน่ง',
    signature: 'ลายมือชื่อ',
    toc: 'สารบัญ',
    figures: 'สารบัญภาพ',
    tables: 'สารบัญตาราง',
    intro: 'บทนำ',
    purpose: 'วัตถุประสงค์',
    scope: 'ขอบเขต',
    audience: 'กลุ่มผู้ใช้',
    glossary: 'คำศัพท์',
    term: 'คำศัพท์',
    definition: 'ความหมาย',
    appendix: 'ภาคผนวก',
    contact: 'ติดต่อ',
    page: 'หน้า',
    of: 'จาก',
  },
  en: {
    docNumber: 'Document number',
    docTitle: 'Document title',
    version: 'Version',
    date: 'Date',
    classification: 'Classification',
    client: 'Client',
    project: 'Project',
    preparedBy: 'Prepared by',
    control: 'Document information',
    revisions: 'Revision history',
    author: 'Author',
    changes: 'Changes',
    approval: 'Approval',
    name: 'Name',
    role: 'Role',
    signature: 'Signature',
    toc: 'Contents',
    figures: 'List of figures',
    tables: 'List of tables',
    intro: 'Introduction',
    purpose: 'Purpose',
    scope: 'Scope',
    audience: 'Audience',
    glossary: 'Glossary',
    term: 'Term',
    definition: 'Definition',
    appendix: 'Appendix',
    contact: 'Contact',
    page: 'Page',
    of: 'of',
  },
}
export type Words = (typeof WORDS)['en']
export const wordsFor = (lang: string): Words => (lang === 'th' ? WORDS.th : WORDS.en)

export interface TableBlock {
  title: string
  header: string[]
  rows: string[][]
}

/** Image paths are absolute and exist. */
export interface Cover {
  style: 'formal' | 'neutral'
  book: string
  title: string
  subtitle: string
  bookTitle: string
  client: string
  /** The system's name, under the client in the formal cover's band. */
  system: string
  /** Company name alone, never with a "developed by" prefix. */
  developer: string
  /** Seal first, system logo second. */
  logos: string[]
  image: string | null
  icon: string | null
  /** Label/value pairs below the title (client excluded: it has its own place). */
  fields: [string, string][]
}

export interface FrontMatter {
  lang: string
  words: Words
  /** Running header text and PDF metadata title. */
  documentTitle: string
  cover: Cover | null
  control: { title: string; rows: [string, string][] } | null
  revisions: TableBlock | null
  approval: TableBlock | null
  toc: { title: string } | null
  figures: { title: string; items: Caption[] } | null
  tables: { title: string; items: Caption[] } | null
  intro: { title: string; parts: { title: string; text: string }[]; glossary: TableBlock | null } | null
  appendix: { title: string; parts: { title: string; text: string }[] } | null
}

/** Annotated/lightweight tags of the project as revisions (version without a leading "v"). */
function gitRevisions(projectRoot: string): { version: string; date: string; changes: string }[] {
  try {
    const out = execFileSync('git', ['-C', projectRoot, 'for-each-ref', '--sort=creatordate', '--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)', 'refs/tags'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [tag = '', date = '', subject = ''] = l.split('\t')
        return { version: tag.replace(/^v(?=\d)/, ''), date, changes: subject }
      })
  } catch {
    return []
  }
}

export function buildFrontMatter(project: Project, book: RenderedBook): FrontMatter {
  const { config, primary } = project
  const { lang } = book
  const d = config.document
  const s = config.sections
  const w = wordsFor(lang)
  const loc = (v: Localized | undefined) => localize(v, lang, primary)
  const title = loc(d.title)

  const fields: [string, string][] = (
    [
      [w.client, loc(d.client)],
      [w.project, loc(d.project)],
      [w.docNumber, d.docNumber ?? ''],
      [w.version, d.version],
      [w.date, d.date ?? ''],
      [w.classification, loc(d.classification)],
      [w.preparedBy, loc(d.preparedBy)],
    ] as [string, string][]
  ).filter(([, v]) => v)

  const revisionRows = (() => {
    const fromConfig = d.revisions.map((r) => ({ version: r.version, date: r.date, author: loc(r.author), changes: loc(r.changes) }))
    const known = new Set(fromConfig.map((r) => r.version))
    const fromGit = d.revisionsFromGitTags ? gitRevisions(project.projectRoot).filter((r) => !known.has(r.version)).map((r) => ({ ...r, author: '' })) : []
    return [...fromGit, ...fromConfig]
      .sort((a, b) => a.date.localeCompare(b.date) || a.version.localeCompare(b.version, undefined, { numeric: true }))
      .map((r) => [r.version, r.date, r.author, r.changes])
  })()

  const introParts = (
    [
      [w.purpose, loc(d.purpose)],
      [w.scope, loc(d.scope)],
      [w.audience, loc(d.audience)],
    ] as const
  )
    .filter(([, text]) => text)
    .map(([t, text]) => ({ title: t, text }))
  const glossary = d.glossary.length ? { title: w.glossary, header: [w.term, w.definition], rows: d.glossary.map((g) => [loc(g.term), loc(g.definition)]) } : null
  const appendixParts = d.contact ? [{ title: w.contact, text: loc(d.contact) }] : []

  const image = (key: string, rel: string | undefined) => {
    if (!rel) return null
    const file = join(project.manualDir, rel)
    if (!existsSync(file)) throw new Error(`${key}: ${rel} not found in ${project.manualDir}`)
    return file
  }
  const cover = (): Cover => ({
    style: config.templates.cover,
    book: book.book,
    title,
    subtitle: loc(d.subtitle),
    bookTitle: book.title,
    client: loc(d.client),
    system: loc(d.project),
    developer: loc(d.developer) || loc(d.preparedBy),
    logos: d.logos.map((l, i) => image(`document.logos[${i}]`, l)!),
    image: image('document.coverImage', d.coverImage),
    icon: image(`books.${book.book}.icon`, config.books[book.book]?.icon),
    fields: fields.filter(([k]) => k !== w.client),
  })

  return {
    lang,
    words: w,
    documentTitle: title,
    cover: s.cover ? cover() : null,
    control: s.control ? { title: w.control, rows: [[w.docTitle, `${title} — ${book.title}`] as [string, string], ...fields] } : null,
    revisions: s.revisions && revisionRows.length ? { title: w.revisions, header: [w.version, w.date, w.author, w.changes], rows: revisionRows } : null,
    approval: s.approval && d.approvers.length ? { title: w.approval, header: [w.name, w.role, w.signature, w.date], rows: d.approvers.map((a) => [loc(a.name), loc(a.role), '', '']) } : null,
    toc: s.toc ? { title: w.toc } : null,
    figures: s.figures && book.figures.length ? { title: w.figures, items: book.figures } : null,
    tables: s.tables && book.tables.length ? { title: w.tables, items: book.tables } : null,
    intro: s.intro && (introParts.length || glossary) ? { title: w.intro, parts: introParts, glossary } : null,
    appendix: s.appendix && appendixParts.length ? { title: w.appendix, parts: appendixParts } : null,
  }
}
