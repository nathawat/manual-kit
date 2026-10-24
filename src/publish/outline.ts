// publish outline: the built manual as documents in an Outline wiki (https://www.getoutline.com/developers).
// One document per book (contents + PDF/DOCX downloads) with one child document per page; images, clips and the
// PDF/DOCX are uploaded as attachments. manual/outline.json maps books and pages to document ids and files (by content
// hash) to attachments, so publishing again updates what changed and creates nothing twice. The API key comes only
// from the environment (OUTLINE_API_KEY) and is never written or printed.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { localize } from '../config.ts'
import { buildTargets, outputPath } from '../build/pdf.ts'
import type { Project } from '../project.ts'
import { pageAnchor, renderBook } from '../render.ts'
import { UsageError } from '../sign.ts'

export const OUTLINE_MAP = 'outline.json'
export const TOKEN_ENV = 'OUTLINE_API_KEY'

interface DocEntry {
  id: string
  url: string
  /** Hash of the title and text last sent. */
  hash: string
}
export interface OutlineMap {
  baseUrl: string
  collection: { id: string; urlId?: string }
  parent?: string
  documents: Record<string, DocEntry>
  /** sha256 of the file -> the attachment made from it. */
  attachments: Record<string, { name: string; url: string }>
}

export interface PublishOptions {
  collection?: string
  parent?: string
  book?: string
  lang?: string
  dryRun?: boolean
  /** Default: process.env.OUTLINE_API_KEY. */
  token?: string
  log?: (line: string) => void
}

const TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const WORDS = {
  th: { download: 'ดาวน์โหลด', contents: 'สารบัญ', pdf: 'PDF', docx: 'Word (DOCX)', info: 'ข้อมูลเอกสาร', number: 'เลขที่เอกสาร', version: 'ฉบับที่', date: 'วันที่' },
  en: { download: 'Download', contents: 'Contents', pdf: 'PDF', docx: 'Word (DOCX)', info: 'Document information', number: 'Document number', version: 'Version', date: 'Date' },
}
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const short = (s: string) => sha(s).slice(0, 16)

/** One document to publish: its text still holds file paths (relative to the manual folder) and page anchors. */
interface Planned {
  key: string
  kind: 'book' | 'page'
  label: string
  title: string
  /** Key of the parent document, or undefined for a book (placed under --parent or the collection). */
  parent?: string
  index: number
  markdown: string
  /** Files the text links to, relative to the manual folder. */
  files: string[]
}

function plan(project: Project, opts: PublishOptions): Planned[] {
  const { config, primary } = project
  const out: Planned[] = []
  // a role book (books.<id>.from) repeats its source's pages: the wiki gets the source book only
  const targets = buildTargets(project, opts).filter((t) => !config.books[t.book]?.from)
  if (!targets.length) throw new Error(`book "${opts.book}" is made from another book (books.${opts.book}.from): publish that book instead`)
  for (const t of targets) {
    const book = renderBook(project, { ...t, target: 'outline' })
    const W = t.lang === 'th' ? WORDS.th : WORDS.en
    const bookKey = `${t.book}/${t.lang}`
    const docTitle = localize(config.document.title, t.lang, primary)
    const pages = book.chapters.map((c, i): Planned => {
      const files = [...new Set([...c.markdown.matchAll(/\]\((media\/[^)\s]+)\)/g)].map((m) => m[1]!))]
      return { key: `${bookKey}/${c.id}`, kind: 'page', label: c.id, title: `${c.number}. ${c.title}`, parent: bookKey, index: i, markdown: c.markdown, files }
    })
    const downloads = (['pdf', 'docx'] as const)
      .map((ext) => ({ ext, rel: relative(project.manualDir, outputPath(project, t, ext)) }))
      .filter((d) => existsSync(join(project.manualDir, d.rel)))
    const doc = config.document
    const info = [
      [W.number, doc.docNumber && localize(doc.docNumber, t.lang, primary)],
      [W.version, doc.version],
      [W.date, doc.date],
    ].filter((r) => r[1])
    const md = [
      doc.purpose ? localize(doc.purpose, t.lang, primary) : '',
      info.length ? `## ${W.info}\n\n| | |\n|---|---|\n${info.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}` : '',
      downloads.length ? `**${W.download}:** ${downloads.map((d) => `[${d.ext === 'pdf' ? W.pdf : W.docx}](${d.rel})`).join(' · ')}` : '',
      `## ${W.contents}\n\n${pages.map((p) => `- [${p.title}](#${pageAnchor(p.label)})`).join('\n')}`,
    ].filter(Boolean)
    const override = config.books[t.book]?.outline?.title
    const title = override ? localize(override, t.lang, primary) : docTitle === book.title ? book.title : `${docTitle}: ${book.title}`
    out.push({ key: bookKey, kind: 'book', label: bookKey, title, index: 0, markdown: md.join('\n\n'), files: downloads.map((d) => d.rel) }, ...pages)
  }
  return out
}

/** The text sent to Outline: file paths -> attachment URLs, page anchors -> document URLs (pending ones marked). */
function finalText(p: Planned, all: Planned[], map: OutlineMap, fileHash: Map<string, string>): string {
  let text = p.markdown
  for (const f of p.files) {
    const att = map.attachments[fileHash.get(f)!]
    text = text.split(`](${f})`).join(`](${att ? att.url : `pending:${f}`})`)
  }
  const own = p.kind === 'book' ? p.key : p.parent!
  const lang = own.split('/')[1]!
  // #page-<anchor> is a page of this book; #page-<anchor>@<book> one of another book, which may not be in this run
  return text.replace(/\]\(#page-([^)\s@]+)(?:@([^)\s]+))?\)/g, (whole, anchor: string, book: string | undefined) => {
    const prefix = book ? `${book}/${lang}` : own
    const key =
      all.find((q) => q.kind === 'page' && q.parent === prefix && q.label.replace(/\./g, '_') === anchor)?.key ??
      Object.keys(map.documents).find((k) => k.startsWith(`${prefix}/`) && k.slice(prefix.length + 1).replace(/\./g, '_') === anchor)
    if (!key) return whole
    const doc = map.documents[key]
    return `](${doc ? doc.url : `pending:${key}`})`
  })
}

export function readOutlineMap(manualDir: string): OutlineMap | undefined {
  const f = join(manualDir, OUTLINE_MAP)
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as OutlineMap) : undefined
}

export async function publishOutline(project: Project, opts: PublishOptions): Promise<{ created: number; updated: number; uploaded: number; unchanged: number }> {
  const log = opts.log ?? ((l: string) => console.log(l))
  if (!project.config.outline.baseUrl) throw new UsageError('name the Outline wiki: outline.baseUrl in the config, such as https://wiki.example.com')
  const baseUrl = project.config.outline.baseUrl.replace(/\/+$/, '')
  const collectionArg = opts.collection ?? project.config.outline.collection
  if (!collectionArg) throw new UsageError('name the Outline collection: --collection <id or urlId> (or outline.collection in the config)')
  const token = opts.token ?? process.env[TOKEN_ENV]
  if (!opts.dryRun && !token) throw new UsageError(`set the Outline API key in the environment variable ${TOKEN_ENV} (it is never read from a file)`)
  const stored = readOutlineMap(project.manualDir)
  if (stored && stored.baseUrl !== baseUrl) throw new UsageError(`${OUTLINE_MAP} belongs to ${stored.baseUrl}, not ${baseUrl}: move it away to publish to another wiki`)
  if (stored && stored.collection.id !== collectionArg && stored.collection.urlId !== collectionArg)
    throw new UsageError(`${OUTLINE_MAP} belongs to collection ${stored.collection.id}, not ${collectionArg}: move it away to publish to another collection`)

  const api = async <T>(method: string, body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${baseUrl}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string; message?: string }
    if (!res.ok) throw new OutlineError(method, res.status, json.message ?? json.error ?? res.statusText)
    return json.data as T
  }

  const parent = opts.parent ?? project.config.outline.parent ?? stored?.parent
  let collection = stored?.collection ?? { id: collectionArg }
  if (!opts.dryRun) {
    const c = await api<{ id: string; urlId?: string }>('collections.info', { id: collectionArg })
    collection = { id: c.id, ...(c.urlId ? { urlId: c.urlId } : {}) }
  }
  const map: OutlineMap = { baseUrl, collection, ...(parent ? { parent } : {}), documents: { ...stored?.documents }, attachments: { ...stored?.attachments } }

  const docs = plan(project, opts)
  const fileHash = new Map<string, string>()
  for (const d of docs) for (const f of d.files) if (!fileHash.has(f)) fileHash.set(f, sha(readFileSync(join(project.manualDir, f))))
  log(`outline: ${baseUrl} · collection ${collectionArg}${parent ? ` · parent ${parent}` : ''}${opts.dryRun ? ' (dry run: nothing is sent)' : ''}`)

  // documents deleted in Outline since the last run are made again
  if (!opts.dryRun)
    for (const d of docs) {
      const e = map.documents[d.key]
      if (!e) continue
      try {
        await api('documents.info', { id: e.id })
      } catch (err) {
        if (!(err instanceof OutlineError) || err.status !== 404) throw err
        delete map.documents[d.key]
      }
    }

  const counts = { created: 0, updated: 0, uploaded: 0, unchanged: 0 }
  const row = (action: string, d: Planned) => log(`  ${action.padEnd(9)} ${d.kind.padEnd(4)}  ${d.label}  "${d.title}"`)
  try {
    // 1. documents that do not exist yet (books before their pages), so every link and attachment has a home
    const fresh = new Set<string>()
    for (const d of docs) {
      if (map.documents[d.key]) continue
      fresh.add(d.key)
      if (opts.dryRun) continue
      const parentId = d.parent ? map.documents[d.parent]!.id : parent
      const created = await api<{ id: string; url: string }>('documents.create', {
        title: d.title,
        text: '',
        collectionId: collection.id,
        ...(parentId ? { parentDocumentId: parentId } : {}),
        publish: true,
      })
      map.documents[d.key] = { id: created.id, url: created.url, hash: '' }
      if (d.kind === 'page') await api('documents.move', { id: created.id, collectionId: collection.id, parentDocumentId: parentId, index: d.index })
    }
    // 2. files, once each
    const owner = new Map<string, Planned>()
    for (const d of docs) for (const f of d.files) if (!owner.has(f)) owner.set(f, d)
    for (const [f, d] of owner) {
      const hash = fileHash.get(f)!
      if (map.attachments[hash]) continue
      const size = readFileSync(join(project.manualDir, f)).length
      log(`  upload    ${f} (${(size / 1024).toFixed(0)} KB)`)
      counts.uploaded += 1
      if (opts.dryRun) continue
      map.attachments[hash] = await upload(api, baseUrl, token!, join(project.manualDir, f), map.documents[d.key]!.id)
    }
    // 3. text: send what changed
    for (const d of docs) {
      const text = finalText(d, docs, map, fileHash)
      const hash = short(`${d.title}\n${text}`)
      const e = map.documents[d.key]
      if (e && e.hash === hash) {
        counts.unchanged += 1
        row('unchanged', d)
        continue
      }
      if (fresh.has(d.key)) counts.created += 1
      else counts.updated += 1
      row(fresh.has(d.key) ? 'create' : 'update', d)
      if (opts.dryRun) continue
      await api('documents.update', { id: e!.id, title: d.title, text, publish: true })
      e!.hash = hash
    }
  } finally {
    if (!opts.dryRun) writeFileSync(join(project.manualDir, OUTLINE_MAP), `${JSON.stringify(sortKeys(map), null, 2)}\n`)
  }
  log(`${opts.dryRun ? 'would create' : 'created'} ${counts.created}, ${opts.dryRun ? 'update' : 'updated'} ${counts.updated}, upload${opts.dryRun ? '' : 'ed'} ${counts.uploaded} files, unchanged ${counts.unchanged}`)
  if (!opts.dryRun) log(`book documents: ${docs.filter((d) => d.kind === 'book').map((d) => `${baseUrl}${map.documents[d.key]!.url}`).join(' ')}`)
  return counts
}

class OutlineError extends UsageError {
  readonly status: number
  constructor(method: string, status: number, message: string) {
    super(`Outline ${method}: ${status} ${message}`)
    this.status = status
  }
}

/** attachments.create, then the file to the upload address; the API key goes only to the wiki's own host. */
async function upload(api: <T>(m: string, b: Record<string, unknown>) => Promise<T>, baseUrl: string, token: string, file: string, documentId: string) {
  const bytes = readFileSync(file)
  const name = basename(file)
  const contentType = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const r = await api<{ uploadUrl: string; form: Record<string, string>; attachment: { url: string } }>('attachments.create', {
    name,
    contentType,
    size: bytes.length,
    documentId,
    preset: 'documentAttachment',
  })
  const target = new URL(r.uploadUrl, `${baseUrl}/`)
  const form = new FormData()
  for (const [k, v] of Object.entries(r.form ?? {})) form.append(k, v)
  form.append('file', new Blob([bytes], { type: contentType }), name)
  const sameHost = target.origin === new URL(baseUrl).origin
  const res = await fetch(target, { method: 'POST', body: form, headers: sameHost ? { authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new UsageError(`Outline upload of ${name}: ${res.status} ${res.statusText}`)
  return { name, url: r.attachment.url }
}

function sortKeys(map: OutlineMap): OutlineMap {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
  return { ...map, documents: sorted(map.documents), attachments: sorted(map.attachments) }
}
