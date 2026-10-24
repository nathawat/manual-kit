// build pdf: print HTML -> Paged.js (page boxes, "page X of Y", TOC page numbers) -> Chromium page.pdf.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lazyDep, resolveDep } from '../deps.ts'
import { buildFrontMatter } from '../front-matter.ts'
import { imageSize } from '../media/size.ts'
import { bookPages, type Project } from '../project.ts'
import { renderBook } from '../render.ts'
import { bookHtml } from './html.ts'

const playwright = lazyDep<typeof import('playwright')>('playwright')
/** pagedjs does not export its polyfill path; it sits next to lib/index.cjs. */
const paged = () => join(dirname(resolveDep('pagedjs')), '..', 'dist', 'paged.polyfill.js')

export interface BuildTarget {
  lang: string
  book: string
}

/** Every (book, language) with chapters, role books (books.<id>.from) included, narrowed by the options. */
export function buildTargets(project: Project, opts: { lang?: string; book?: string }): BuildTarget[] {
  const books = [...new Set([...project.pages.map((p) => p.book), ...Object.keys(project.config.books)])].sort()
  const out: BuildTarget[] = []
  for (const book of books) {
    if (opts.book && opts.book !== book) continue
    for (const lang of project.config.languages) {
      if (opts.lang && opts.lang !== lang) continue
      if (bookPages(project, book, lang).length) out.push({ lang, book })
    }
  }
  if (!out.length) throw new Error(`nothing to build${opts.book ? ` for book "${opts.book}"` : ''}${opts.lang ? ` in "${opts.lang}"` : ''}`)
  return out
}

export const outputPath = (project: Project, t: BuildTarget, ext: 'pdf' | 'docx' | 'html') =>
  join(project.manualDir, project.config.outputs.dir, `${t.book}.${t.lang}.${ext}`)

export async function buildPdf(project: Project, targets: BuildTarget[]): Promise<string[]> {
  const browser = await playwright.chromium.launch()
  const written: string[] = []
  try {
    for (const t of targets) {
      const book = renderBook(project, { ...t, target: 'html' })
      const html = bookHtml(project, book, buildFrontMatter(project, book))
      const htmlFile = join(project.manualDir, project.config.outputs.dir, '.build', `${t.book}.${t.lang}.html`)
      mkdirSync(dirname(htmlFile), { recursive: true })
      writeFileSync(htmlFile, withImageSizes(project, html))
      const page = await browser.newPage()
      await page.addInitScript(() => {
        ;(window as unknown as { PagedConfig: unknown }).PagedConfig = { auto: false }
      })
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      await page.addScriptTag({ path: paged() })
      await page.evaluate(fitImages)
      await page.evaluate(async () => {
        await (window as unknown as { PagedPolyfill: { preview: () => Promise<unknown> } }).PagedPolyfill.preview()
      })
      const out = outputPath(project, t, 'pdf')
      await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true })
      await page.close()
      written.push(out)
    }
  } finally {
    await browser.close()
  }
  return written
}

/** data-w/data-h on every figure image, so the page layout knows its size before the copy Paged.js makes has decoded. */
function withImageSizes(project: Project, html: string): string {
  return html.replace(/<img src="(media\/[^"]+)"/g, (m, rel: string) => {
    const size = existsSync(join(project.manualDir, rel)) ? imageSize(join(project.manualDir, rel)) : null
    return size ? `${m} data-w="${size.width}" data-h="${size.height}"` : m
  })
}

/**
 * Runs in the page before Paged.js lays it out. Every figure image gets an explicit size: the width of the column and
 * the CSS max-height as limits, and, when the figure would not fit in the space left on the page but at least half of
 * it would, the space left. A tall screenshot then shrinks a little instead of moving to the next page and leaving
 * this one nearly empty. Below half, it moves on as before (on a new page it gets the whole page).
 */
function fitImages() {
  type PagedApi = { Handler: new (...a: unknown[]) => object; registerHandlers: (...h: unknown[]) => void }
  const Paged = (window as unknown as { Paged: PagedApi }).Paged
  const px = (v: string) => parseFloat(v) || 0
  class FitImages extends Paged.Handler {
    renderNode(clone: Node, source: Node) {
      if (!(clone instanceof HTMLImageElement) || !(source instanceof HTMLImageElement)) return
      const figure = clone.closest('figure.figure')
      const area = clone.closest('.pagedjs_area')
      if (!(figure instanceof HTMLElement) || !area) return
      const natW = Number(clone.dataset.w) || clone.naturalWidth
      const natH = Number(clone.dataset.h) || clone.naturalHeight
      if (!natW || !natH) return
      const css = getComputedStyle(clone)
      const border = px(css.borderTopWidth) + px(css.borderBottomWidth)
      // what comes after the image in the figure (caption, QR): measured with copies, then removed
      let after = px(getComputedStyle(figure).marginBottom) + px(getComputedStyle(figure).paddingBottom)
      for (let s = source.nextElementSibling; s; s = s.nextElementSibling) {
        const copy = s.cloneNode(true) as HTMLElement
        figure.appendChild(copy)
        const st = getComputedStyle(copy)
        after += copy.getBoundingClientRect().height + px(st.marginTop) + px(st.marginBottom)
        copy.remove()
      }
      const maxW = figure.clientWidth - border
      const maxH = css.maxHeight === 'none' ? Infinity : px(css.maxHeight) - border
      let scale = Math.min(1, maxW / natW, maxH / natH)
      // where the image starts: measured with the image hidden, because once it overflows, Paged.js's column puts it at the top of the next one
      clone.style.display = 'none'
      const top = figure.getBoundingClientRect().top + px(getComputedStyle(figure).paddingTop)
      clone.style.display = ''
      const left = area.getBoundingClientRect().bottom - top - after - border - 2
      const h = natH * scale
      if (h > left && left >= Math.max(h / 2, 110)) scale = left / natH
      Object.assign(clone.style, { width: `${Math.floor(natW * scale)}px`, height: `${Math.floor(natH * scale)}px`, maxWidth: 'none', maxHeight: 'none' })
    }
  }
  Paged.registerHandlers(FitImages)
}
