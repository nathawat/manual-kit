// Render: pages of one book in one language -> chapters of Markdown with every token resolved.
// Targets: `html` (markdown-it -> print HTML for PDF), `web` (the site), `pandoc` (pandoc Markdown -> DOCX) and
// `outline` (Markdown for an Outline wiki: plain images, notices, clips as poster + MP4 link).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import MarkdownIt from 'markdown-it'
import { localize } from './config.ts'
import { imageSize } from './media/size.ts'
import { findUi, mapTokens, type Page, type Token } from './pages.ts'
import { bookPages, type Project } from './project.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { clipFiles, clipTimeline, hasClips, hasSteps, loadShots, shotPath, stepPath, type ClipSpec } from './shots.ts'
import { icon } from './web/icons.ts'
import { qrPng, qrSvg } from './web/qr.ts'
import { isAbsoluteHttp, pageFile, webUrl } from './web/urls.ts'

/** html = print HTML (PDF), web = the web site (step galleries), pandoc = DOCX, outline = an Outline wiki document. */
export type Target = 'html' | 'web' | 'pandoc' | 'outline'

/** HTML/DOCX anchor of a page; dots would break CSS selectors (`#a.b`), so they become underscores. */
export const pageAnchor = (id: string) => `page-${id.replace(/\./g, '_')}`

export interface Caption {
  /** Anchor id, e.g. fig-2-1 / tab-2-1. */
  id: string
  /** "ภาพที่ 2-1" / "Figure 2-1". */
  label: string
  caption: string
  chapter: number
}

export interface Chapter {
  id: string
  number: number
  title: string
  markdown: string
  page: Page
}

export interface RenderedBook {
  lang: string
  book: string
  title: string
  chapters: Chapter[]
  figures: Caption[]
  tables: Caption[]
}

const LABELS = {
  th: {
    figure: 'ภาพที่', table: 'ตารางที่', missing: 'ยังไม่มีภาพ', clip: 'คลิป', scan: 'สแกนเพื่อดูคลิป', transcript: 'ข้อความในคลิป',
    play: 'เล่นคลิป', music: 'เพลงประกอบ', captions: 'คำบรรยาย', zoom: 'ขยายภาพ',
    tip: 'เคล็ดลับ', note: 'หมายเหตุ', warning: 'ข้อควรระวัง', see: 'ดู', done: 'เรียบร้อย',
  },
  en: {
    figure: 'Figure', table: 'Table', missing: 'image not captured yet', clip: 'Clip', scan: 'Scan to watch the clip', transcript: 'What the clip says',
    play: 'Play the clip', music: 'Music', captions: 'Captions', zoom: 'Enlarge',
    tip: 'Tip', note: 'Note', warning: 'Warning', see: 'see', done: 'Done',
  },
} as const
type Labels = (typeof LABELS)['en'] | (typeof LABELS)['th']
export const labelsFor = (lang: string): Labels => (lang === 'th' ? LABELS.th : LABELS.en)

/** Stands in for a line that resolved to nothing and is removed (a NUL never occurs in page text). */
const DROP = '\0drop\0'
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const escMd = (s: string) => s.replace(/([\\`*_[\]<>#|&])/g, '\\$1')
/** UI strings may hold markup (`<b>`) and line breaks; the manual shows the visible text. */
const plainUi = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** A short text (caption, step) with its {{ui:}} and {{data:}} tokens resolved, as plain text. */
export function plainText(project: Project, lang: string, text: string): string {
  const ui = project.adapter.uiStrings(lang)
  return mapTokens(text, (t, raw) => (t.kind === 'ui' ? plainUi(findUi(ui, t.arg) ?? t.arg) : t.kind === 'data' ? (project.adapter.data(t.arg) ?? raw) : raw))
}

/** Text area of the generated DOCX (A4 less margins) and the figure heights of the PDF (pdf.css). */
const DOCX_TEXT_WIDTH_CM = 17.2
const MAX_FIGURE_CM = { figure: 15, step: 11 }

/**
 * Pandoc size attributes: the picture at 96 dpi, no wider than the text and no taller than the PDF's figure height,
 * proportions kept. Without them pandoc fits only the width, and a tall screenshot runs off the page in Word.
 */
function docxSize(file: string, cls: string): string {
  const size = imageSize(file)
  if (!size) return ''
  const maxH = cls === 'step' ? MAX_FIGURE_CM.step : MAX_FIGURE_CM.figure
  const natural = { w: (size.width / 96) * 2.54, h: (size.height / 96) * 2.54 }
  const scale = Math.min(1, DOCX_TEXT_WIDTH_CM / natural.w, maxH / natural.h)
  const cm = (v: number) => `${(Math.floor(v * scale * 100) / 100).toFixed(2)}cm`
  return ` width=${cm(natural.w)} height=${cm(natural.h)}`
}

export interface RenderOptions {
  lang: string
  book: string
  target: Target
}

export function renderBook(project: Project, opts: RenderOptions): RenderedBook {
  const { lang, book, target } = opts
  const { config, primary } = project
  const L = labelsFor(lang)
  const shots = loadShots(project.manualDir)
  const ui = project.adapter.uiStrings(lang)
  const pages = bookPages(project, book, lang)
  const titles = new Map(pages.map((p) => [p.id, p.meta.title]))
  /** Pages in this language outside this book, for [[links]] across books (a role book's other pages are here too). */
  const elsewhere = new Map(project.pages.filter((p) => p.lang === lang && !titles.has(p.id)).map((p) => [p.id, p]))
  const bookTitle = (id: string) => (config.books[id] ? localize(config.books[id].title, lang, primary) : id)
  const figures: Caption[] = []
  const tables: Caption[] = []

  /** Tokens allowed inside short texts (captions, step texts): ui and data. */
  const inline = (text: string, style: 'md' | 'plain' | 'html') => {
    const lit = style === 'html' ? escHtml : style === 'md' ? escMd : (s: string) => s
    // tokens are resolved on the text as written (a quoted label holds quotes), then only the text between them is
    // escaped, once; resolved tokens stand in as \0n\0 meanwhile
    const resolved: string[] = []
    const marked = mapTokens(text, (t, raw) => {
      let out = lit(raw)
      if (t.kind === 'ui') {
        const s = plainUi(findUi(ui, t.arg) ?? t.arg)
        out = style === 'md' ? `**${escMd(s)}**` : style === 'html' ? `<strong>${escHtml(s)}</strong>` : s
      } else if (t.kind === 'data') {
        const v = project.adapter.data(t.arg)
        if (v !== undefined) out = lit(v)
      }
      resolved.push(out)
      return `\0${resolved.length - 1}\0`
    })
    return lit(marked).replace(/\0(\d+)\0/g, (_, i: string) => resolved[Number(i)]!)
  }

  const chapters = pages.map((page, idx): Chapter => {
    const n = idx + 1
    let fig = 0
    const figure = (rel: string, caption: string, cls = '', alt = caption, extra = ''): string => {
      fig += 1
      const id = `fig-${n}-${fig}`
      const label = `${L.figure} ${n}-${fig}`
      figures.push({ id, label, caption, chapter: n })
      const exists = existsSync(join(project.manualDir, rel))
      if (target === 'outline')
        return exists ? `![${escMd(`${label} ${caption}`)}](${rel})` : `> **${escMd(label)}** ${escMd(caption)} (${escMd(L.missing)}: ${escMd(rel)})`
      if (target !== 'pandoc') {
        const img = exists ? `<img src="${escHtml(rel)}" alt="${escHtml(alt)}">` : `<div class="missing-box">${escHtml(L.missing)}: ${escHtml(rel)}</div>`
        // the web names a picture by its caption alone; figure numbers belong to the PDF and DOCX (DESIGN.md)
        const shown = target === 'web' ? escHtml(caption) : `${escHtml(label)} ${escHtml(caption)}`
        return `<figure class="figure${cls ? ` ${cls}` : ''}${exists ? '' : ' missing'}" id="${id}">${img}<figcaption>${shown}</figcaption>${extra}</figure>`
      }
      return exists ? `![${escMd(`${label} ${caption}`)}](${rel}){#${id}${docxSize(join(project.manualDir, rel), cls)}}` : `> **${escMd(label)}** ${escMd(caption)} (${escMd(L.missing)}: ${escMd(rel)})`
    }

    const resolve = (t: Token, raw: string, line: string): string => {
      const out = resolveToken(t, raw)
      // a clip that leaves nothing takes its line with it, so no blank line splits the list or paragraph around it
      if (t.kind === 'clip' && !out && line.trim() === raw) return DROP
      if (t.kind !== 'shot' && t.kind !== 'steps' && t.kind !== 'clip') return out
      // a block written alone on an indented line belongs to the list item above it: every line of it gets that indent
      const indent = line.trim() === raw ? /^\s*/.exec(line)![0] : ''
      if (indent) return out.replace(/\n(?=[^\n])/g, `\n${indent}`)
      // a steps list on its own must not run on from (or into) the page's numbered list next to it: an HTML comment
      // ends a list for markdown-it and pandoc; Outline drops HTML, so there the other delimiter (1) starts a new list
      if (t.kind === 'steps' && target !== 'web' && out !== raw)
        return target === 'outline' ? `\n${out.replace(/^(\d+)\. /gm, '$1) ')}\n` : `\n<!-- -->\n\n${out}\n\n<!-- -->\n`
      return out
    }

    /** A walkthrough shown as a clip: its title (or its page's title) is the caption, the transcript its captions file. */
    const walkthroughFigure = (id: string): Pick<ClipSpec, 'caption' | 'alt' | 'segments'> | undefined => {
      const w = shots.walkthroughs[id]
      if (!w) return undefined
      const target = project.pages.find((p) => p.id === w.page && p.lang === lang)
      return { caption: w.title ?? target?.meta.title ?? id, segments: [] }
    }

    const resolveToken = (t: Token, raw: string): string => {
      switch (t.kind) {
        case 'ui':
        case 'data':
          return inline(raw, 'md')
        case 'link': {
          const title = titles.get(t.arg)
          if (title) return `[${escMd(title)}](#${pageAnchor(t.arg)})`
          const other = elsewhere.get(t.arg)
          if (!other) return raw
          // another book: the web links to its page, Outline to its document (#anchor@book, resolved at publish),
          // paper names it
          const text = escMd(`${bookTitle(other.book)}: ${other.meta.title}`)
          if (target === 'web') return `[${text}](../../${other.book}/${lang}/${pageFile(other.id)})`
          if (target === 'outline') return `[${text}](#${pageAnchor(other.id)}@${other.book})`
          return `${escMd(L.see)} ${text}`
        }
        case 'shot': {
          const spec = shots.shots[t.arg]
          if (!spec || config.media === 'none') return ''
          const caption = inline(localize(spec.caption, lang, primary), 'plain')
          return `\n${figure(shotPath(lang, t.arg), caption, '', spec.alt ? inline(localize(spec.alt, lang, primary), 'plain') : caption)}\n`
        }
        case 'steps': {
          const spec = shots.steps[t.arg]
          if (!spec) return raw
          const withImages = hasSteps(config.media)
          const steps = spec.steps.map((st) => ({ st, text: localize(st.text, lang, primary), details: (st.details ?? []).map((d) => localize(d, lang, primary)) }))
          if (withImages && target === 'web') {
            // the page's own numbered steps: number, instruction, its sub-bullets, its image (one HTML block, no blank lines)
            const items = steps.map(({ st, text, details }, i) => {
              const plain = inline(text, 'plain')
              const alt = st.alt ? inline(localize(st.alt, lang, primary), 'plain') : plain
              const sub = details.length ? `<ul class="step-details">${details.map((d) => `<li>${inline(d, 'html')}</li>`).join('')}</ul>` : ''
              return `<li class="step" id="step-${escHtml(t.arg)}-${i + 1}"><p class="step-text"><span class="step-n" aria-hidden="true">${i + 1}</span><span>${inline(text, 'html')}</span></p>${sub}${figure(stepPath(lang, t.arg, i + 1), plain, 'step', alt)}</li>`
            })
            return `\n<div class="walk" data-walk="${escHtml(t.arg)}" data-zoom="${escHtml(L.zoom)}">\n<ol class="steps">\n${items.join('\n')}\n</ol>\n</div>\n`
          }
          return steps
            .map(({ text, details }, i) => {
              const marker = `${i + 1}. `
              // the item's content lines up with its text, so "10. " items keep their sub-bullets and image too
              const pad = ' '.repeat(marker.length)
              const sub = details.map((d) => `${pad}- ${inline(d, 'md')}`).join('\n')
              const line = `${marker}${inline(text, 'md')}`
              if (!withImages) return sub ? `${line}\n${sub}` : line
              return `${line}\n\n${sub ? `${sub}\n\n` : ''}${pad}${figure(stepPath(lang, t.arg, i + 1), inline(text, 'plain'), 'step')}\n`
            })
            .join('\n')
        }
        case 'clip': {
          const spec = shots.clips[t.arg] ?? walkthroughFigure(t.arg)
          if (!spec || !hasClips(config.media)) return ''
          // video is web-only unless the paper outputs ask for its poster
          if ((target === 'html' || target === 'pandoc') && config.document.clips === 'none') return ''
          const caption = inline(localize(spec.caption, lang, primary), 'plain')
          const alt = spec.alt ? inline(localize(spec.alt, lang, primary), 'plain') : caption
          const f = clipFiles(lang, t.arg)
          if (target === 'web') {
            // the video itself; the poster image goes through figure() so it is numbered and listed
            const cues = spec.segments.length ? spec.segments.map((sg) => inline(localize(sg.caption, lang, primary), 'html')) : vttCues(join(project.manualDir, f.vtt)).map(escHtml)
            const said = cues.map((c) => `<li>${c}</li>`).join('')
            const transcript = `<details class="transcript"><summary>${escHtml(L.transcript)}</summary><ol>${said}</ol></details>`
            // a player: the silent loop (or poster) under a play button, music on/off, transcript. Captions are burned into the
            // picture by encode, so the text track is there for screen readers and search but off until the reader turns it on.
            const video = `<video id="clip-${escHtml(t.arg)}" controls preload="none" playsinline poster="${escHtml(f.poster)}" aria-label="${escHtml(alt)}"><source src="${escHtml(f.mp4)}" type="video/mp4"><track kind="captions" src="${escHtml(f.vtt)}" srclang="${escHtml(lang)}" label="${escHtml(L.captions)}"></video>`
            const loop = existsSync(join(project.manualDir, f.webp)) ? f.webp : f.poster
            const secs = clipSeconds(join(project.manualDir, clipTimeline(lang, t.arg)))
            const len = secs ? `<span class="len">${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}</span>` : ''
            const cover = `<button type="button" class="clip-cover" aria-label="${escHtml(L.play)}: ${escHtml(caption)}"><img src="${escHtml(loop)}" data-poster="${escHtml(f.poster)}" alt=""><span class="play">${icon('play')}</span>${len}</button>`
            const bar = `<div class="clip-bar"><button type="button" class="btn" data-music aria-pressed="true">${icon('music')}${escHtml(L.music)}</button><button type="button" class="btn" data-cc aria-pressed="false">${icon('captions')}${escHtml(L.captions)}</button></div>`
            return `\n${figure(f.poster, caption, 'clip', alt, `${bar}${transcript}`)
              .replace(/<img [^>]*>/, `<div class="clip-frame">${video}${cover}</div>`)
              .replace(/<figure /, `<figure data-clip="${escHtml(t.arg)}" `)}\n`
          }
          // a wiki: the poster and a link to the video file (uploaded with the page)
          if (target === 'outline') return `\n${figure(f.poster, caption, 'clip', alt)}\n\n[▶ ${escMd(`${L.play}: ${caption}`)} (MP4)](${f.mp4})\n`
          // paper: the poster, and a QR code to the clip on the web when the site's address is known
          // the page's own book: a role book has no site of its own
          const url = webUrl(config.web.baseUrl, page.book, lang, `${pageFile(page.id)}#clip-${t.arg}`)
          if (!isAbsoluteHttp(url)) return `\n${figure(f.poster, caption, 'clip', alt)}\n`
          if (target === 'html') {
            const qr = `<div class="clip-qr"><img src="data:image/svg+xml;base64,${Buffer.from(qrSvg(url)).toString('base64')}" alt="QR"><span>${escHtml(L.scan)}<br>${escHtml(url)}</span></div>`
            return `\n${figure(f.poster, caption, 'clip', alt, qr)}\n`
          }
          const qrRel = `${config.outputs.dir}/.build/qr/${lang}-${t.arg}.png`
          mkdirSync(join(project.manualDir, config.outputs.dir, '.build', 'qr'), { recursive: true })
          writeFileSync(join(project.manualDir, qrRel), qrPng(url))
          return `\n${figure(f.poster, caption, 'clip', alt)}\n\n![](${qrRel}){width=2.5cm} ${escMd(L.scan)}: <${url}>\n`
        }
        case 'unknown':
          return raw
      }
    }

    const resolved = mapTokens(page.body, resolve)
      .split('\n')
      .filter((l) => l !== DROP)
      .join('\n')
    const body = numberTables(callouts(problemPairs(resolved, target), L, target), n, L.table, target, tables)
    return { id: page.id, number: n, title: page.meta.title, markdown: body.trim(), page }
  })

  return { lang, book, title: bookTitle(book), chapters, figures, tables }
}

/** The text of each cue in a WebVTT file (entities decoded), or none when there is no file. */
function vttCues(file: string): string[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((l) => l.includes('-->')))
    .map((lines) => lines.slice(lines.findIndex((l) => l.includes('-->')) + 1).join(' ').trim())
    .filter(Boolean)
    .map((t) => t.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
}

/** Length of a captured clip in seconds (from its timeline), or 0. */
function clipSeconds(file: string): number {
  if (!existsSync(file)) return 0
  try {
    const t = JSON.parse(readFileSync(file, 'utf8')) as { frames?: { ms: number }[] }
    return (t.frames ?? []).reduce((a, f) => a + f.ms, 0) / 1000
  } catch {
    return 0
  }
}

const PROBLEM_LINE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\*\*)?(?:ปัญหา|Problem)\s*(?:\*\*)?\s*[:：]/
const FIX_LINE = /^\s+(?:\*\*)?(?:วิธีแก้ไข|วิธีแก้|Fix)\s*(?:\*\*)?\s*[:：]/

/**
 * The template's problem item, "- ปัญหา: …" with "วิธีแก้ไข: …" on the next (indented) line, is one paragraph in
 * Markdown and would read as one run-on line. A hard line break (backslash, which markdown-it and pandoc both read)
 * keeps the problem and the fix on two lines. Outline gets the text as written.
 */
export function problemPairs(markdown: string, target: Target): string {
  if (target === 'outline') return markdown
  const lines = markdown.split('\n')
  return lines.map((l, i) => (PROBLEM_LINE.test(l) && FIX_LINE.test(lines[i + 1] ?? '') && !/\\$/.test(l.trimEnd()) ? `${l.trimEnd()}\\` : l)).join('\n')
}

const CALLOUT_KINDS: Record<string, 'tip' | 'note' | 'warning'> = { tip: 'tip', note: 'note', important: 'note', warning: 'warning', caution: 'warning' }

/**
 * `> [!TIP]` / `[!NOTE]` / `[!WARNING]` (also IMPORTANT, CAUTION) blockquotes: a titled box on the web and in the PDF,
 * a blockquote starting with the bold title in DOCX.
 */
export function callouts(markdown: string, L: Pick<Labels, 'tip' | 'note' | 'warning'>, target: Target): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const m = fence ? null : /^>\s*\[!(\w+)\]\s*(.*)$/.exec(line)
    const kind = m ? CALLOUT_KINDS[m[1]!.toLowerCase()] : undefined
    if (!m || !kind) {
      out.push(line)
      continue
    }
    const inner = m[2] ? [m[2]] : []
    while (i + 1 < lines.length && /^>/.test(lines[i + 1]!)) inner.push(lines[++i]!.replace(/^>\s?/, ''))
    const title = L[kind]
    if (target === 'pandoc') out.push(`> **${title}:** ${inner.join('\n> ')}`)
    // Outline notices: :::tip / :::info / :::warning
    else if (target === 'outline') out.push(`:::${kind === 'note' ? 'info' : kind}`, `**${title}:** ${inner.join('\n')}`, ':::')
    else out.push(`<div class="callout callout--${kind}" role="note"><p class="callout-title">${escHtml(title)}</p>`, '', ...inner, '', '</div>')
  }
  return out.join('\n')
}

/** A `: caption` line right after a table numbers that table ("ตารางที่ n-m"). */
function numberTables(md: string, chapter: number, word: string, target: Target, out: Caption[]): string {
  const lines = md.split('\n')
  let fence = false
  let m = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const cap = /^: (.+)$/.exec(line)
    if (!cap) continue
    let j = i - 1
    while (j >= 0 && lines[j]!.trim() === '') j--
    if (j < 0 || !lines[j]!.trimStart().startsWith('|')) continue
    m += 1
    const id = `tab-${chapter}-${m}`
    const label = `${word} ${chapter}-${m}`
    out.push({ id, label, caption: cap[1]!, chapter })
    if (target === 'pandoc') {
      lines[i] = `: ${label} ${cap[1]} {#${id}}`
    } else if (target === 'outline') {
      let start = j
      while (start > 0 && lines[start - 1]!.trimStart().startsWith('|')) start--
      lines[i] = ''
      lines.splice(start, 0, `**${escMd(label)}** ${escMd(cap[1]!)}`, '')
      i += 2
    } else {
      let start = j
      while (start > 0 && lines[start - 1]!.trimStart().startsWith('|')) start--
      lines[i] = ''
      lines.splice(start, 0, `<p class="table-caption" id="${id}">${target === 'web' ? '' : `${escHtml(label)} `}${escHtml(cap[1]!)}</p>`, '')
      i += 2
    }
  }
  return lines.join('\n')
}

export interface Heading {
  id: string
  level: number
  text: string
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })

/** Markdown -> HTML for one chapter; h2/h3 get ids `sec-<chapter>-<k>[-<j>]` for the table of contents. */
export function markdownToHtml(markdown: string, chapter: number): { html: string; headings: Heading[] } {
  const tokens = md.parse(markdown, {})
  const headings: Heading[] = []
  let h2 = 0
  let h3 = 0
  tokens.forEach((t, i) => {
    if (t.type !== 'heading_open' || (t.tag !== 'h2' && t.tag !== 'h3')) return
    if (t.tag === 'h2') {
      h2 += 1
      h3 = 0
    } else h3 += 1
    const id = t.tag === 'h2' ? `sec-${chapter}-${h2}` : `sec-${chapter}-${h2}-${h3}`
    t.attrSet('id', id)
    headings.push({ id, level: t.tag === 'h2' ? 2 : 3, text: tokens[i + 1]?.content ?? '' })
  })
  return { html: md.renderer.render(tokens, md.options, {}), headings }
}
