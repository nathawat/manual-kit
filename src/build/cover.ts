// The PDF cover, and local files in print CSS made into data URIs (Paged.js re-reads the styles and loses the base,
// so a relative url() would load nothing).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { Cover } from '../front-matter.ts'
import { heroSvg } from '../web/art.ts'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export const dataUri = (file: string) =>
  `data:${MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`

/**
 * Every url() that names a local file becomes a data URI. A path is looked up next to the CSS file first, then in the
 * manual folder (the PDF page's base, which older project CSS was written against). Anything else is left alone.
 */
export function inlineCssUrls(css: string, cssFile: string, manualDir: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/g, (m, _q: string, ref: string) => {
    if (/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(ref)) return m
    const path = ref.split(/[?#]/)[0]!
    const file = [join(dirname(cssFile), path), join(manualDir, path)].find((f) => existsSync(f))
    return file ? `url("${dataUri(file)}")` : m
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const img = (cls: string, file: string) => `<img class="${cls}" src="${dataUri(file)}" alt="">`

function neutral(c: Cover): string {
  return `<section class="cover" data-book="${esc(c.book)}">
${c.client ? `<div class="cover-client">${esc(c.client)}</div>` : ''}
<h1 class="cover-title">${esc(c.title)}</h1>
${c.subtitle ? `<div class="cover-subtitle">${esc(c.subtitle)}</div>` : ''}
<div class="cover-book">${esc(c.bookTitle)}</div>
<table class="cover-fields"><tbody>${c.fields.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
</section>`
}

/**
 * The default cover (DESIGN.md): a thin band in the product's colour with the accent rule, the organisation and its
 * logos centred, a large title and the book at the left, the illustration at the right (document.coverImage, else the
 * theme's drawing), the document fields along the bottom and a quiet footer line.
 */
function formal(c: Cover): string {
  const [seal, logo] = c.logos
  const org = c.client || c.system
  // the developer named alone (no "developed by"), then the book
  const foot = [c.developer, c.bookTitle].filter(Boolean)
  return `<section class="cover cover--formal" data-book="${esc(c.book)}">
<div class="cover-band"></div>
${org || seal || logo ? `<header class="cover-org">${seal ? img('cover-seal', seal) : ''}${logo ? img('cover-logo', logo) : ''}<div>${c.client ? `<div class="cover-client">${esc(c.client)}</div>` : ''}${c.system ? `<div class="cover-system">${esc(c.system)}</div>` : ''}</div></header>` : ''}
<div class="cover-body">
<h1 class="cover-title">${esc(c.title)}</h1>
<div class="cover-text">
<div class="cover-book">${c.icon ? img('cover-book-icon', c.icon) : ''}<span>${esc(c.bookTitle)}</span></div>
${c.subtitle ? `<p class="cover-subtitle">${esc(c.subtitle)}</p>` : ''}
</div>
<div class="cover-image">${c.image ? img('', c.image) : heroSvg('cover-art')}</div>
</div>
${c.fields.length ? `<dl class="cover-fields">${c.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
<footer class="cover-foot">${foot.map((t) => `<span>${esc(t)}</span>`).join('')}</footer>
</section>`
}

export const coverHtml = (c: Cover) => (c.style === 'formal' ? formal(c) : neutral(c))
