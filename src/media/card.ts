// Title cards of every video: the poster and the intro/outro around a captured clip (src/encode.ts, drawn by Chromium)
// and around a walkthrough (src/walkthrough, a section of the HyperFrames composition). Brand-coloured background,
// logos at the top, a round picture (the book icon, or a check mark on the outro), the title large, a subtitle in the
// accent colour, and a footer with the document on the left and the company that built the system on the right.
// Laid out on a 1920-pixel-wide canvas.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { localize } from '../config.ts'
import type { Project } from '../project.ts'
import { DEFAULT_BRAND, fieldInks, inkOnPaper } from '../web/brand.ts'

export interface Card {
  /** Background and subtitle colours (web.brand.colors brand and accent). */
  color: string
  accent: string
  title: string
  subtitle: string
  /** Footer: left, then right (document.developer, the company name alone). */
  foot: string[]
  /** Picture URLs: the round picture (book icon) and the logos across the top. */
  icon?: string
  logos: string[]
  /** The outro: a check mark in place of the icon. */
  done: boolean
}

/** What every card of a project shares: colours, logo files (document.logos, else the site logo) and the developer. */
export function cardBrand(project: Project, lang: string): { color: string; accent: string; logoFiles: string[]; developer: string } {
  const { config, manualDir, primary } = project
  const { colors, logo } = config.web.brand
  const logos = config.document.logos.length ? config.document.logos : logo ? [logo] : []
  return {
    color: colors.brand ?? DEFAULT_BRAND.brand,
    accent: colors.accent ?? DEFAULT_BRAND.accent,
    logoFiles: logos.map((l) => join(manualDir, l)).filter((f) => existsSync(f)),
    developer: localize(config.document.developer, lang, primary),
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Styles of `.card` sections; the fonts are the page's (Sarabun 600 and 700). */
export const CARD_CSS = `
.card { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 0 120px; color: var(--ink); text-align: center; font-family: 'Sarabun', sans-serif; }
.card .logos { position: absolute; top: 56px; left: 76px; right: 76px; display: flex; justify-content: space-between; align-items: center; }
.card .logos img { height: 110px; max-width: 520px; object-fit: contain; background: #fff; border-radius: 18px; padding: 12px; }
.card .mark { box-sizing: border-box; width: 250px; height: 250px; background: #fff; border-radius: 50%; padding: 28px; margin-bottom: 34px;
  object-fit: contain; display: grid; place-items: center; }
.card .mark svg { width: 150px; height: 150px; }
.card h1 { margin: 0; font-size: 92px; font-weight: 700; line-height: 1.25; }
.card .sub { margin: 16px 0 0; font-size: 38px; font-weight: 600; }
.card .foot { position: absolute; bottom: 56px; left: 76px; right: 76px; margin: 0; display: flex; justify-content: space-between; gap: 48px;
  font-size: 28px; font-weight: 600; color: var(--soft); }
.card .foot span:only-child { margin: 0 auto; }
`

/** A card as a section; `id` names it and prefixes its animated parts (`<id>-mark`, `<id>-title`, `<id>-sub`). */
export function cardSection(id: string, c: Card): string {
  const mark = c.done
    ? `<div class="mark" id="${id}-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${inkOnPaper(c.color)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
    : c.icon
      ? `<img class="mark" id="${id}-mark" src="${esc(c.icon)}" alt="">`
      : ''
  const logos = c.logos.length ? `<div class="logos">${c.logos.map((src) => `<img src="${esc(src)}" alt="">`).join('')}</div>` : ''
  const foot = c.foot.filter(Boolean)
  const ink = fieldInks(c.color, c.accent)
  return `<section class="card" id="${id}" style="background: ${esc(c.color)}; --ink: ${ink.ink}; --soft: ${ink.soft}">${logos}${mark}<h1 id="${id}-title">${esc(c.title)}</h1>${
    c.subtitle ? `<p class="sub" id="${id}-sub" style="color: ${ink.accent}">${esc(c.subtitle)}</p>` : ''
  }${foot.length ? `<p class="foot">${foot.map((f) => `<span>${esc(f)}</span>`).join('')}</p>` : ''}</section>`
}

/** A card alone as a page of `width` x `height` (poster, captured clip intro/outro); the 1920 canvas is zoomed to fit. */
export function cardHtml(c: Card, width: number, height: number, fonts: { semibold: string; bold: string }): string {
  const zoom = width / 1920
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Sarabun'; src: url(data:font/ttf;base64,${fonts.semibold}) format('truetype'); font-weight: 600; }
@font-face { font-family: 'Sarabun'; src: url(data:font/ttf;base64,${fonts.bold}) format('truetype'); font-weight: 700; }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
.canvas { position: relative; width: 1920px; height: ${height / zoom}px; zoom: ${zoom}; }
${CARD_CSS}
</style></head><body><div class="canvas">${cardSection('card', c)}</div></body></html>`
}
