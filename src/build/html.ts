// The print HTML for one book in one language: front matter + chapters. Paged.js lays it out for the PDF.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FrontMatter, TableBlock } from '../front-matter.ts'
import type { Project } from '../project.ts'
import { markdownToHtml, pageAnchor, type RenderedBook } from '../render.ts'
import { DEFAULT_BRAND, inkOnPaper } from '../web/brand.ts'
import { coverHtml, inlineCssUrls } from './cover.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
import { ASSETS } from '../paths.ts'

export { ASSETS }

function fontFaces(): string {
  const face = (file: string, weight: number, style: string) =>
    `@font-face { font-family: 'Sarabun'; src: url('${new URL(`fonts/${file}`, ASSETS).href}') format('truetype'); font-weight: ${weight}; font-style: ${style}; }`
  return [
    face('Sarabun-Regular.ttf', 400, 'normal'),
    face('Sarabun-Italic.ttf', 400, 'italic'),
    face('Sarabun-SemiBold.ttf', 600, 'normal'),
    face('Sarabun-Bold.ttf', 700, 'normal'),
    face('Sarabun-BoldItalic.ttf', 700, 'italic'),
  ].join('\n')
}

function table(t: TableBlock, cls: string): string {
  return `<table class="${cls}"><thead><tr>${t.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}

const tocItem = (href: string, text: string, level: 1 | 2, num = '') =>
  `<li class="l${level}"><a href="#${href}">${num ? `<span class="num">${esc(num)}</span>` : ''}<span class="t">${esc(text)}</span><span class="dots"></span></a></li>`

/** The web theme's default colours (assets/web/site.css --brand / --accent), so an unbranded cover matches the site. */
/** The default brand pair, the same as the web theme's (DESIGN.md). */
export const THEME = { brand: DEFAULT_BRAND.brand, accent: DEFAULT_BRAND.accent }

/** sec-3-1 -> 3.1 */
const secNumber = (id: string) => id.replace(/^sec-/, '').split('-').join('.')

export function bookHtml(project: Project, book: RenderedBook, fm: FrontMatter): string {
  const chapters = book.chapters.map((c) => {
    const { html, headings } = markdownToHtml(c.markdown, c.number)
    const numbered = headings.reduce((h, x) => h.replace(`<h${x.level} id="${x.id}">`, `<h${x.level} id="${x.id}"><span class="num">${secNumber(x.id)}</span>`), html)
    return { c, html: numbered, headings }
  })
  const parts: string[] = []

  if (fm.cover) parts.push(coverHtml(fm.cover))
  if (fm.control)
    parts.push(
      `<section class="front control"><h1>${esc(fm.control.title)}</h1><table class="control"><tbody>${fm.control.rows
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
        .join('')}</tbody></table>` +
        (fm.revisions ? `<h2>${esc(fm.revisions.title)}</h2>${table(fm.revisions, 'revisions')}` : '') +
        `</section>`,
    )
  else if (fm.revisions) parts.push(`<section class="front revisions"><h1>${esc(fm.revisions.title)}</h1>${table(fm.revisions, 'revisions')}</section>`)
  if (fm.approval) parts.push(`<section class="front approval"><h1>${esc(fm.approval.title)}</h1>${table(fm.approval, 'approval')}</section>`)

  if (fm.toc) {
    const items: string[] = []
    if (fm.intro) items.push(tocItem('intro', fm.intro.title, 1))
    for (const { c, headings } of chapters) {
      items.push(tocItem(pageAnchor(c.id), c.title, 1, String(c.number)))
      for (const h of headings.filter((h) => h.level === 2)) items.push(tocItem(h.id, h.text, 2, secNumber(h.id)))
    }
    if (fm.appendix) items.push(tocItem('appendix', fm.appendix.title, 1))
    parts.push(`<section class="front toc"><h1>${esc(fm.toc.title)}</h1><ol class="toc-list">${items.join('')}</ol></section>`)
  }
  if (fm.figures)
    parts.push(
      `<section class="front figures"><h1>${esc(fm.figures.title)}</h1><ol class="toc-list">${fm.figures.items.map((f) => tocItem(f.id, `${f.label} ${f.caption}`, 2)).join('')}</ol></section>`,
    )
  if (fm.tables)
    parts.push(
      `<section class="front tables"><h1>${esc(fm.tables.title)}</h1><ol class="toc-list">${fm.tables.items.map((t) => tocItem(t.id, `${t.label} ${t.caption}`, 2)).join('')}</ol></section>`,
    )
  if (fm.intro) {
    const i = fm.intro
    parts.push(
      `<section class="intro" id="intro"><h1>${esc(i.title)}</h1>${i.parts.map((p) => `<h2>${esc(p.title)}</h2>${markdownToHtml(p.text, 0).html}`).join('')}${
        i.glossary ? `<h2>${esc(i.glossary.title)}</h2>${table(i.glossary, 'glossary')}` : ''
      }</section>`,
    )
  }
  for (const { c, html } of chapters)
    parts.push(`<section class="chapter" id="${pageAnchor(c.id)}"><h1 class="chapter-title"><span class="num">${c.number}</span>${esc(c.title)}</h1>\n${html}</section>`)
  if (fm.appendix)
    parts.push(`<section class="appendix" id="appendix"><h1>${esc(fm.appendix.title)}</h1>${fm.appendix.parts.map((p) => `<h2>${esc(p.title)}</h2>${markdownToHtml(p.text, 0).html}`).join('')}</section>`)

  const d = project.config.document
  const w = fm.words
  const left = [d.docNumber, d.version ? `${w.version} ${d.version}` : ''].filter(Boolean).join(' · ')
  const pageCss = `@page {
  @top-left { content: ${cssString(fm.documentTitle)}; font-size: 8.5pt; color: #59636e; }
  @top-right { content: ${cssString(book.title)}; font-size: 8.5pt; color: #59636e; }
  @bottom-left { content: ${cssString(left)}; font-size: 8.5pt; color: #59636e; }
  @bottom-right { content: ${cssString(`${w.page} `)} counter(page) ${cssString(` ${w.of} `)} counter(pages); font-size: 8.5pt; color: #59636e; }
}`
  const cssFile = project.config.templates.pdfCss ? join(project.manualDir, project.config.templates.pdfCss) : null
  const projectCss = cssFile ? inlineCssUrls(readFileSync(cssFile, 'utf8'), cssFile, project.manualDir) : ''
  const colors = project.config.web.brand.colors
  const coverBrand = colors.brand ?? THEME.brand
  const coverAccent = colors.accent ?? THEME.accent
  const brandCss = `:root { --cover-brand: ${coverBrand}; --cover-accent: ${coverAccent}; --cover-brand-ink: ${inkOnPaper(coverBrand)}; --cover-accent-ink: ${inkOnPaper(coverAccent)}; }`
  const baseCss = readFileSync(new URL('pdf.css', ASSETS), 'utf8')

  return `<!doctype html>
<html lang="${esc(book.lang)}">
<head>
<meta charset="utf-8">
<base href="${pathToFileURL(project.manualDir).href}/">
<title>${esc(`${fm.documentTitle} — ${book.title}`)}</title>
<style>
${fontFaces()}
${baseCss}
${brandCss}
${pageCss}
${projectCss}
</style>
</head>
<body data-book="${esc(book.book)}">
${parts.join('\n')}
</body>
</html>
`
}
