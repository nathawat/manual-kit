// Pre-fill the contents / figure / table list fields so they are readable the moment the file opens.
// Word replaces the result when it updates the field (finalize, or the reader accepting updateFields), so
// the pre-filled entries carry heading text and links but no page numbers: page numbers only exist after
// Word lays the document out, and guessed numbers would be wrong.
import type { Unzipped } from 'fflate'
import { PPR_ORDER, W, all, child, children, ensureChild, parsePart, writePart, type XDocument, type XElement } from './ooxml.ts'

const wAttr = (el: XElement | null, name: string) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || '' : '')

interface Entry {
  level: 1 | 2 | 3
  text: string
  anchor?: string
}

function paragraphText(p: XElement): string {
  let s = ''
  const walk = (el: XElement) => {
    for (const c of children(el)) {
      if (c.namespaceURI !== W) continue
      if (c.localName === 't') s += c.textContent ?? ''
      else if (c.localName === 'tab') s += ' '
      else if (c.localName !== 'rPr' && c.localName !== 'pPr' && c.localName !== 'instrText') walk(c)
    }
  }
  walk(p)
  return s.replace(/\s+/g, ' ').trim()
}

/** pandoc puts a heading's bookmark inside the paragraph or just before it. */
function bookmarkOf(p: XElement): string {
  const inside = all(p, 'bookmarkStart')[0]
  if (inside) return wAttr(inside, 'name')
  for (let n = p.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType !== 1) continue
    const el = n as XElement
    if (el.localName !== 'bookmarkStart') break
    const name = wAttr(el, 'name')
    if (name && !name.startsWith('_')) return name
  }
  return ''
}

const styleOf = (p: XElement) => {
  const pPr = child(p, 'pPr')
  return wAttr(pPr && child(pPr, 'pStyle'), 'val')
}

function collect(doc: XDocument) {
  const headings: Entry[] = []
  const figures: Entry[] = []
  const tables: Entry[] = []
  for (const p of all(doc, 'p')) {
    const style = styleOf(p)
    const h = /^Heading([1-3])$/.exec(style)
    if (h) {
      const anchor = bookmarkOf(p)
      headings.push({ level: Number(h[1]) as 1 | 2 | 3, text: paragraphText(p), ...(anchor ? { anchor } : {}) })
    } else if (style === 'ImageCaption') figures.push({ level: 1, text: paragraphText(p) })
    else if (style === 'TableCaption') tables.push({ level: 1, text: paragraphText(p) })
  }
  return { headings: headings.filter((e) => e.text), figures, tables }
}

function entryContent(doc: XDocument, p: XElement, e: Entry, style: string) {
  const pPr = ensureChild(p, 'pPr', ['pPr', 'r', 'hyperlink'])
  ensureChild(pPr, 'pStyle', PPR_ORDER).setAttributeNS(W, 'w:val', style)
  const r = doc.createElementNS(W, 'w:r')
  const t = doc.createElementNS(W, 'w:t')
  t.setAttribute('xml:space', 'preserve')
  t.textContent = e.text
  r.appendChild(t)
  if (e.anchor) {
    const link = doc.createElementNS(W, 'w:hyperlink')
    link.setAttributeNS(W, 'w:anchor', e.anchor)
    link.setAttributeNS(W, 'w:history', '1')
    link.appendChild(r)
    return link
  }
  return r
}

/** Replace the placeholder result of each TOC field with entries. */
function fill(doc: XDocument, instrPara: XElement, entries: Entry[], styleFor: (e: Entry) => string) {
  if (!entries.length) return
  const runs = children(instrPara).filter((c) => c.localName === 'r')
  const fld = (r: XElement) => wAttr(child(r, 'fldChar'), 'fldCharType')
  const sepIdx = runs.findIndex((r) => fld(r) === 'separate')
  const endIdx = runs.findIndex((r) => fld(r) === 'end')
  if (sepIdx < 0 || endIdx < 0) return
  for (const r of runs.slice(sepIdx + 1, endIdx)) instrPara.removeChild(r)
  const endRun = runs[endIdx]!
  instrPara.removeChild(endRun)
  const [first, ...rest] = entries
  instrPara.appendChild(entryContent(doc, instrPara, first!, styleFor(first!)))
  let last = instrPara
  for (const e of rest) {
    const p = doc.createElementNS(W, 'w:p')
    p.appendChild(entryContent(doc, p, e, styleFor(e)))
    last.parentNode!.insertBefore(p, last.nextSibling)
    last = p
  }
  last.appendChild(endRun)
}

/** TOC level (and style) of the figure and table list entries; headings use 1-3. */
export const LIST_LEVEL = 9
const LIST_STYLE = `TOC${LIST_LEVEL}`

const LIST_STYLES = (textWidth: number) =>
  [
    ['TOC1', 'toc 1', 0, '<w:b/><w:bCs/>'],
    ['TOC2', 'toc 2', 284, ''],
    ['TOC3', 'toc 3', 567, ''],
    // Figure/table lists: Word formats entries of `\\t "Image Caption,9"` with toc 9, never bold like chapters (toc 1).
    [LIST_STYLE, 'toc 9', 0, ''],
  ]
    .map(
      ([id, name, ind, rpr]) =>
        `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${textWidth}"/></w:tabs><w:spacing w:before="0" w:after="60"/><w:ind w:left="${ind}"/></w:pPr>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`,
    )

/** Pre-fill contents and figure/table lists; add TOC styles; drop w:dirty (Word asks about dirty fields on open). */
export function prefillLists(files: Unzipped, textWidth = 9752) {
  const doc = parsePart(files, 'word/document.xml')
  if (!doc) return
  const { headings, figures, tables } = collect(doc)
  for (const instr of all(doc, 'instrText')) {
    const code = instr.textContent ?? ''
    const para = instr.parentNode?.parentNode as XElement | null
    if (!para || para.localName !== 'p' || !/\bTOC\b/.test(code)) continue
    if (/\\t\s+"Image Caption/.test(code)) fill(doc, para, figures, () => LIST_STYLE)
    else if (/\\t\s+"Table Caption/.test(code)) fill(doc, para, tables, () => LIST_STYLE)
    else if (/\\o/.test(code)) fill(doc, para, headings, (e) => `TOC${e.level}`)
  }
  for (const f of all(doc, 'fldChar')) {
    f.removeAttributeNS(W, 'dirty')
    f.removeAttribute('w:dirty')
  }
  writePart(files, 'word/document.xml', doc)

  const styles = parsePart(files, 'word/styles.xml')
  if (!styles) return
  const root = styles.documentElement as unknown as XElement
  const have = new Set(all(styles, 'style').map((s) => wAttr(s, 'styleId')))
  for (const xml of LIST_STYLES(textWidth)) {
    const id = /w:styleId="([^"]+)"/.exec(xml)![1]!
    if (have.has(id)) continue
    const frag = parsePart({ x: new TextEncoder().encode(`<w:styles xmlns:w="${W}">${xml}</w:styles>`) }, 'x')!
    root.appendChild(styles.importNode(frag.documentElement!.firstChild!, true))
  }
  writePart(files, 'word/styles.xml', styles)
}

/** After a finalizer filled the fields, the reader must not be asked to update them again. */
export function dropUpdateFields(files: Unzipped) {
  const settings = parsePart(files, 'word/settings.xml')
  if (!settings) return
  for (const u of all(settings, 'updateFields')) u.parentNode!.removeChild(u)
  writePart(files, 'word/settings.xml', settings)
}
