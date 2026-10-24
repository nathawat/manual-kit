// build docx: pandoc Markdown (front matter + chapters) -> pandoc with a reference.docx.
// The neutral reference is pandoc's default patched at build time (Sarabun, A4, header/footer "หน้า X จาก Y",
// update fields on open); a project template (templates.docx) is used as-is.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { postProcessDocx } from './docx-post.ts'
import { chooseFinalizer, describeFinalizer, finalizeWithLibreOffice, finalizeWithWord, notVerified, systemProbe, type FinalizeMode } from './finalize.ts'
import { LIST_LEVEL, dropUpdateFields } from './toc.ts'
import { resolveDocxFonts, type DocxFonts } from './fonts.ts'
import { buildFrontMatter, type FrontMatter } from '../front-matter.ts'
import type { Project } from '../project.ts'
import { verifyDocx } from '../verify-docx.ts'
import { pageAnchor, renderBook, type RenderedBook } from '../render.ts'
import { outputPath, type BuildTarget } from './pdf.ts'

const PANDOC = process.env.PANDOC ?? 'pandoc'
const escMd = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, '\\$1').replace(/\n/g, ' ')
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const openxml = (xml: string) => `\n\`\`\`{=openxml}\n${xml}\n\`\`\`\n`
const PAGE_BREAK = openxml('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
const field = (instr: string, placeholder: string) =>
  openxml(
    `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${escXml(instr)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${escXml(placeholder)}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
  )
const div = (style: string, text: string) => `\n::: {custom-style="${style}"}\n${escMd(text)}\n:::\n`

function table(t: { header: string[]; rows: string[][] }): string {
  const row = (cells: string[]) => `| ${cells.map((c) => escMd(c) || ' ').join(' | ')} |`
  return `\n${row(t.header)}\n|${t.header.map(() => '---').join('|')}|\n${t.rows.map(row).join('\n')}\n`
}
/** Formats Word shows everywhere (WebP and SVG are left off the DOCX cover). */
const wordImage = (file: string) => /\.(png|jpe?g|gif)$/i.test(file)
const docxImage = (file: string, size: string) => `![](<${file}>){${size}}`
const kv = (rows: [string, string][], header: [string, string]) => table({ header, rows })

const UPDATE_HINT: Record<string, string> = {
  th: 'คลิกขวาแล้วเลือก "อัปเดตฟิลด์" เพื่อแสดงรายการ',
  en: 'Right-click and choose "Update Field" to show this list',
}

export function bookMarkdown(book: RenderedBook, fm: FrontMatter): string {
  const out: string[] = []
  const hint = UPDATE_HINT[book.lang] ?? UPDATE_HINT.en!
  if (fm.cover) {
    const c = fm.cover
    const formal = c.style === 'formal'
    const logos = formal ? c.logos.filter(wordImage).map((f, i) => docxImage(f, i ? 'height=15mm' : 'height=30mm')) : []
    if (logos.length) out.push(`\n${logos.join(' ')}\n`)
    if (c.client) out.push(div('Subtitle', c.client))
    out.push(div('Title', c.title))
    if (c.subtitle) out.push(div('Subtitle', c.subtitle))
    out.push(div('Subtitle', c.bookTitle))
    if (formal && c.image && wordImage(c.image)) out.push(`\n${docxImage(c.image, 'width=16cm')}\n`)
    out.push(kv(c.fields, ['', '']))
    if (formal && c.developer) out.push(div('Subtitle', c.developer))
    out.push(PAGE_BREAK)
  }
  const front = (title: string, body: string) => out.push(div('Front Heading', title), body, PAGE_BREAK)
  if (fm.control)
    front(fm.control.title, kv(fm.control.rows, ['', '']) + (fm.revisions ? div('Front Subheading', fm.revisions.title) + table(fm.revisions) : ''))
  else if (fm.revisions) front(fm.revisions.title, table(fm.revisions))
  if (fm.approval) front(fm.approval.title, table(fm.approval))
  if (fm.toc) front(fm.toc.title, field('TOC \\o "1-3" \\h \\z \\u', hint))
  if (fm.figures) front(fm.figures.title, field(`TOC \\h \\z \\t "Image Caption,${LIST_LEVEL}"`, hint))
  if (fm.tables) front(fm.tables.title, field(`TOC \\h \\z \\t "Table Caption,${LIST_LEVEL}"`, hint))
  if (fm.intro) {
    out.push(`\n# ${escMd(fm.intro.title)} {#intro .unnumbered}\n`)
    for (const p of fm.intro.parts) out.push(`\n## ${escMd(p.title)} {.unnumbered}\n\n${p.text}\n`)
    if (fm.intro.glossary) out.push(`\n## ${escMd(fm.intro.glossary.title)} {.unnumbered}\n`, table(fm.intro.glossary))
    out.push(PAGE_BREAK)
  }
  book.chapters.forEach((c, i) => {
    out.push(`\n# ${escMd(c.title)} {#${pageAnchor(c.id)}}\n\n${c.markdown}\n`)
    if (i < book.chapters.length - 1 || fm.appendix) out.push(PAGE_BREAK)
  })
  if (fm.appendix) {
    out.push(`\n# ${escMd(fm.appendix.title)} {#appendix .unnumbered}\n`)
    for (const p of fm.appendix.parts) out.push(`\n## ${escMd(p.title)} {.unnumbered}\n\n${p.text}\n`)
  }
  return out.join('\n')
}

const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9CED4" />`
/** Thin grey grid on every table (pandoc's default Table style has none). */
const TABLE_BORDERS = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
const LANG_TAG: Record<string, string> = { th: 'th-TH', en: 'en-US' }

/** Pandoc's default reference.docx, patched into the neutral manual-kit template for one language. */
/** Scale every w:sz (Latin) and w:szCs (Thai) written for an 11pt body to the configured body sizes. */
export function scaleSizes(xml: string, latinPt: number, thaiPt: number): string {
  return xml.replace(/<w:sz w:val="(\d+)"\s*\/>(\s*<w:szCs w:val="\d+"\s*\/>)?/g, (_, v: string) => {
    const n = Number(v)
    return `<w:sz w:val="${Math.round((n * latinPt) / 11)}" /><w:szCs w:val="${Math.round((n * thaiPt) / 11)}" />`
  })
}

export function neutralReference(fm: FrontMatter, project: Project, lang: string, fonts: DocxFonts | null): Uint8Array {
  const latinPt = fonts?.latinSize ?? 11
  const thaiPt = fonts?.size ?? 11
  const base = execFileSync(PANDOC, ['--print-default-data-file', 'reference.docx'])
  const files = unzipSync(new Uint8Array(base))
  const get = (p: string) => strFromU8(files[p]!)
  const set = (p: string, s: string) => {
    files[p] = strToU8(s)
  }
  const tag = LANG_TAG[lang] ?? lang
  const heading = (id: string, name: string, size: number, extra: string) =>
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}" /><w:basedOn w:val="Normal" /><w:next w:val="BodyText" /><w:pPr><w:keepNext />${extra}</w:pPr><w:rPr><w:b /><w:bCs /><w:color w:val="24476B" /><w:sz w:val="${size}" /><w:szCs w:val="${size}" /></w:rPr></w:style>`
  const frontStyles =
    heading('FrontHeading', 'Front Heading', 36, '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="24476B" /></w:pBdr><w:spacing w:before="0" w:after="240" />') +
    heading('FrontSubheading', 'Front Subheading', 28, '<w:spacing w:before="360" w:after="120" />')
  set(
    'word/styles.xml',
    get('word/styles.xml')
      .replace(/(<w:rPrDefault>[\s\S]*?)<w:sz w:val="24" \/>\s*<w:szCs w:val="24" \/>/, '$1<w:sz w:val="22" /><w:szCs w:val="22" />')
      .replace(/<w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA" \/>/, `<w:lang w:val="${tag}" w:eastAsia="zh-CN" w:bidi="${lang === 'th' ? 'th-TH' : 'ar-SA'}" />`)
      .replace(/\s*w:themeColor="[^"]*"/g, '')
      .replace(/\s*w:themeShade="[^"]*"/g, '')
      .replace(/w:color w:val="(0F4761|1F3763|2F5496|4F81BD|365F91)"/g, 'w:color w:val="24476B"')
      .replace(/(w:styleId="Table">[\s\S]*?<w:tblPr>)/, `$1${TABLE_BORDERS}`)
      .replace('</w:styles>', `${frontStyles}</w:styles>`),
  )
  set('word/styles.xml', scaleSizes(get('word/styles.xml'), latinPt, thaiPt))
  set('word/settings.xml', get('word/settings.xml').replace(/(<w:zoom [^>]*\/>)/, '$1<w:updateFields w:val="true" />'))

  const d = project.config.document
  const w = fm.words
  const small = '<w:rPr><w:color w:val="59636E" /><w:sz w:val="17" /><w:szCs w:val="17" /></w:rPr>'
  const run = (t: string) => `<w:r>${small}<w:t xml:space="preserve">${escXml(t)}</w:t></w:r>`
  const fld = (instr: string) =>
    `<w:r>${small}<w:fldChar w:fldCharType="begin" /></w:r><w:r>${small}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${small}<w:fldChar w:fldCharType="separate" /></w:r><w:r>${small}<w:t>1</w:t></w:r><w:r>${small}<w:fldChar w:fldCharType="end" /></w:r>`
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const tabs = '<w:tabs><w:tab w:val="right" w:pos="9638" /></w:tabs>'
  const left = [d.docNumber, `${w.version} ${d.version}`].filter(Boolean).join(' · ')
  set(
    'word/header1.xml',
    scaleSizes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr>${tabs}</w:pPr>${run(fm.documentTitle)}<w:r><w:tab /></w:r>${run(fm.cover?.bookTitle ?? '')}</w:p></w:hdr>`, latinPt, thaiPt),
  )
  set(
    'word/footer1.xml',
    scaleSizes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr>${tabs}</w:pPr>${run(left)}<w:r><w:tab /></w:r>${run(`${w.page} `)}${fld('PAGE')}${run(` ${w.of} `)}${fld('NUMPAGES')}</w:p></w:ftr>`, latinPt, thaiPt),
  )
  set(
    'word/_rels/document.xml.rels',
    get('word/_rels/document.xml.rels').replace(
      '</Relationships>',
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Id="rIdMkHeader" Target="header1.xml" /><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Id="rIdMkFooter" Target="footer1.xml" /></Relationships>',
    ),
  )
  set(
    '[Content_Types].xml',
    get('[Content_Types].xml').replace(
      '</Types>',
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml" /><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" /></Types>',
    ),
  )
  set(
    'word/document.xml',
    get('word/document.xml').replace(
      /<w:sectPr>/,
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdMkHeader" /><w:footerReference w:type="default" r:id="rIdMkFooter" /><w:pgSz w:w="11906" w:h="16838" /><w:pgMar w:top="1247" w:right="1020" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0" />${fm.cover ? '<w:titlePg />' : ''}`,
    ),
  )
  return zipSync(files)
}

export async function buildDocx(
  project: Project,
  targets: BuildTarget[],
  opts: { finalize?: FinalizeMode } = {},
): Promise<{ written: string[]; warnings: string[]; notes: string[]; progress: string[] }> {
  const mode = opts.finalize ?? project.config.docx.finalize
  const finalizer = chooseFinalizer(mode)
  const notes: string[] = [describeFinalizer(finalizer, mode, opts.finalize ? 'cli' : 'config')]
  const written: string[] = []
  /** Per-file lines that report success: the CLI prints them with --verbose only. */
  const progress: string[] = []
  const warnings = new Set<string>()
  let unfinalized = false
  const fonts = resolveDocxFonts(project)
  for (const t of targets) {
    const book = renderBook(project, { ...t, target: 'pandoc' })
    const fm = buildFrontMatter(project, book)
    const work = join(project.manualDir, project.config.outputs.dir, '.build')
    mkdirSync(work, { recursive: true })
    const mdFile = join(work, `${t.book}.${t.lang}.md`)
    writeFileSync(mdFile, bookMarkdown(book, fm))
    let reference: string
    if (project.config.templates.docx) reference = join(project.manualDir, project.config.templates.docx)
    else {
      reference = join(work, `reference.${t.lang}.docx`)
      writeFileSync(reference, neutralReference(fm, project, t.lang, fonts))
    }
    const out = outputPath(project, t, 'docx')
    mkdirSync(dirname(out), { recursive: true })
    execFileSync(
      PANDOC,
      [
        mdFile,
        '-f',
        'markdown',
        '-t',
        'docx',
        '-o',
        out,
        `--reference-doc=${reference}`,
        `--resource-path=${project.manualDir}`,
        '--number-sections',
        '-M',
        `lang=${LANG_TAG[t.lang] ?? t.lang}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const post = { fonts, embedFonts: project.config.fonts.embedFonts, thaiJustify: project.config.docx.thaiJustify }
    const files = unzipSync(new Uint8Array(readFileSync(out)))
    for (const w of postProcessDocx(files, post)) warnings.add(w)
    writeFileSync(out, zipSync(files))
    if (finalizer !== 'none') {
      const name = finalizer === 'word' ? 'Microsoft Word' : 'LibreOffice'
      const reviewPdf = join(work, `${t.book}.${t.lang}.${finalizer === 'word' ? 'word' : 'libreoffice'}.pdf`)
      const r = finalizer === 'word' ? await finalizeWithWord(out, reviewPdf) : await finalizeWithLibreOffice(out, reviewPdf, systemProbe.soffice()!)
      if (r.ok) {
        // the word processor re-saves styles and may drop embedded fonts it does not have installed: apply the rules again.
        const again = unzipSync(new Uint8Array(readFileSync(out)))
        postProcessDocx(again, post, false)
        dropUpdateFields(again)
        writeFileSync(out, zipSync(again))
        const what = 'indexes' in r ? `${r.indexes} indexes updated; ` : ''
        progress.push(`${t.book}.${t.lang}.docx finalized with ${name} (${what}lists have page numbers; ${name}'s PDF: ${join(project.config.outputs.dir, '.build', basename(reviewPdf))})`)
      } else {
        unfinalized = true
        warnings.add(`DOCX not finalized: ${name} did not finish (${r.message.slice(0, 200)}). If it shows a dialog, close it. The file keeps update-on-open fields.`)
      }
    }
    if (fonts) {
      const v = verifyDocx(unzipSync(new Uint8Array(readFileSync(out))), { thaiFont: fonts.thai.family })
      if (v.problems.length) warnings.add(`${t.book}.${t.lang}.docx: check --docx found ${v.problems.length} problem(s), first: ${v.problems[0]}`)
      else progress.push(`checked: ${t.book}.${t.lang}.docx package, relationships, schema order and Thai settings (${v.thaiRuns} Thai runs; same checks as check --docx)`)
    } else notes.push(`not verified: Thai font settings of ${t.book}.${t.lang}.docx (project reference.docx without fonts.docx: its styles are used as they are)`)
    written.push(out)
  }
  if (finalizer === 'none')
    warnings.add(
      'DOCX not finalized: the contents and figure/table lists show their entries without page numbers until Word updates the fields (Word asks when the file opens). Use --finalize word (Microsoft Word on a Mac) or --finalize libreoffice to fill them in.',
    )
  for (const n of notVerified(unfinalized ? 'none' : finalizer)) notes.push(`not verified: ${n}`)
  return { written, warnings: [...warnings], notes, progress }
}
