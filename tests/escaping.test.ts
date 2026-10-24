import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'
import { toVtt } from '../src/encode.ts'
import { openProject } from '../src/project.ts'
import { markdownToHtml, renderBook } from '../src/render.ts'
import { runCli } from './helpers/cli.ts'
import { docxParts, xmlText } from './helpers/docx.ts'
import { PNG_1PX, cleanFixture } from './helpers/fixture.ts'

// a quoted UI label (its quotes are token syntax, never shown), quotes, an ampersand and angle brackets in the text
const STEP = 'กด {{ui:"บันทึก"}} ถ้าชื่อมี "A & B" หรือ <b>x</b> ก็ได้'
const SEEN = 'กด บันทึก ถ้าชื่อมี "A & B" หรือ <b>x</b> ก็ได้'
const CAPTION = 'ห้อง "ป.5/1" & <ห้องใหม่>'

/** Visible text of an HTML fragment: tags dropped, entities decoded once (what a browser shows). */
const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

async function fixture(media: 'steps' | 'steps+video') {
  const root = await cleanFixture()
  const manual = join(root, 'manual')
  const cfg = join(manual, 'manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', `media: ${media}`))
  const shotsFile = join(manual, 'shots.yaml')
  const shots = YAML.parse(readFileSync(shotsFile, 'utf8'))
  shots.shots.login.caption.th = CAPTION
  shots.steps['create-class'].steps[0].text.th = STEP
  shots.clips = { 'class-video': { url: '/classes.html', caption: CAPTION, segments: [{ caption: STEP, highlight: '#save' }] } }
  writeFileSync(shotsFile, YAML.stringify(shots))
  writeFileSync(join(manual, 'pages/th/user-guide/02-create-class.md'), `${readFileSync(join(manual, 'pages/th/user-guide/02-create-class.md'), 'utf8')}\n{{clip:class-video}}\n`)
  for (const n of [1, 2]) writeFileSync(join(manual, `media/th/create-class-${n}.png`), PNG_1PX)
  return root
}

describe('quotes, ampersands and angle brackets in step texts and captions', () => {
  it('web: the step text, step image caption, clip caption and transcript show the text once escaped', async () => {
    const root = await fixture('steps+video')
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'th', book: 'user-guide', target: 'web' })
    const html = book.chapters.map((c) => markdownToHtml(c.markdown, c.number).html).join('\n')
    expect(html).not.toMatch(/&amp;(quot|amp|lt|gt);/)
    const step = /<p class="step-text">([\s\S]*?)<\/p>/.exec(html)![1]!
    expect(visible(step)).toBe(`1${SEEN}`)
    expect(step).toContain('<strong>บันทึก</strong>')
    expect(html).not.toContain('<b>x</b>')
    const said = /<details class="transcript">[\s\S]*?<li>([\s\S]*?)<\/li>/.exec(html)![1]!
    expect(visible(said)).toBe(SEEN)
    // the web shows the caption without the figure number (DESIGN.md)
    expect(html).toContain(`<figcaption>${CAPTION.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</figcaption>`)
  })

  it('PDF: the numbered step list and captions show the text as written', async () => {
    const root = await fixture('steps')
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'th', book: 'user-guide', target: 'html' })
    const html = book.chapters.map((c) => markdownToHtml(c.markdown, c.number).html).join('\n')
    expect(html).not.toMatch(/&amp;(quot|amp|lt|gt);/)
    expect(html).not.toContain('<b>x</b>')
    const li = /<ol>\s*<li>([\s\S]*?)<figure/.exec(html)![1]!
    expect(visible(li).trim()).toBe(SEEN)
    expect(visible(html)).toContain(`ภาพที่ 1-1 ${CAPTION}`)
  })

  it('DOCX: the step text and captions show the text as written', async () => {
    const root = await fixture('steps')
    const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)
    expect(r.code).toBe(0)
    const text = xmlText(docxParts(join(root, 'manual/dist/user-guide.th.docx'))['word/document.xml']!)
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/[“”]/g, '"') // pandoc's typographic quotes
    expect(text).toContain(SEEN)
    expect(text).toContain(`ภาพที่ 1-1 ${CAPTION}`)
    expect(text).not.toMatch(/&(quot|amp|lt|gt);/)
  })

  it('WebVTT: a caption with < and & is escaped so the player shows it as written', () => {
    expect(toVtt([{ caption: 'A & B <b>x</b>', start: 0, end: 1000 }])).toContain('\nA &amp; B &lt;b&gt;x&lt;/b&gt;\n')
  })
})
