import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, type Unzipped } from 'fflate'
import { describe, expect, it } from 'vitest'
import { verifyDocx } from '../src/verify-docx.ts'
import { all, child, parsePart, wAttr, type XDocument, type XElement } from '../src/build/ooxml.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'

const text = (b: Uint8Array) => new TextDecoder().decode(b)
const xml = (zip: Unzipped, part: string) => parsePart(zip, part)!
const els = (d: XDocument | XElement, name: string) => all(d, name)
const attr = (e: XElement | null | undefined, n: string) => (e ? wAttr(e, n) : null)
const kid = (e: XElement, n: string) => child(e, n) ?? undefined

async function build(extra = '') {
  const root = await cleanFixture()
  if (extra) appendFileSync(join(root, 'manual/manual.config.yaml'), extra)
  const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  const file = join(root, 'manual/dist/user-guide.th.docx')
  return { root, file, zip: unzipSync(readFileSync(file)), stdout: r.stdout }
}
/** Text of runs that contain Thai, with the run element. */
function thaiRuns(zip: Unzipped, part: string) {
  return els(xml(zip, part), 'r').filter((r) => /[฀-๿]/.test(els(r as unknown as ReturnType<typeof xml>, 't').map((t) => t.textContent).join('')))
}

describe('Thai rules in the DOCX', () => {
  it('passes the Thai verifier (every Thai run: cs font, szCs, bCs/iCs, lang bidi; themeFontLang bidi)', async () => {
    const { zip, file } = await build()
    const v = verifyDocx(zip, { thaiFont: 'Sarabun' })
    expect(v.problems).toEqual([])
    expect(v.thaiRuns).toBeGreaterThan(20)
    const cli = runCli(['check', '--docx', file, '--font', 'Sarabun'])
    expect(cli.code).toBe(0)
    expect(cli.stdout).toMatch(/passed/)
    for (const part of ['word/document.xml', 'word/header1.xml']) {
      for (const r of thaiRuns(zip, part)) {
        const rPr = kid(r, 'rPr')!
        expect(attr(kid(rPr, 'rFonts'), 'cs')).toBe('Sarabun')
        expect(attr(kid(rPr, 'lang'), 'bidi')).toBe('th-TH')
      }
    }
    const settings = xml(zip, 'word/settings.xml')
    expect(attr(els(settings, 'themeFontLang')[0], 'bidi')).toBe('th-TH')
    // bold headings are bold in Thai too; Sarabun body 11pt like the PDF
    const styles = xml(zip, 'word/styles.xml')
    for (const rPr of els(styles, 'rPr')) {
      if (kid(rPr, 'b')) expect(kid(rPr, 'bCs')).toBeDefined()
      if (kid(rPr, 'sz')) expect(attr(kid(rPr, 'szCs'), 'val')).toBe(attr(kid(rPr, 'sz'), 'val'))
    }
    const def = els(styles, 'rPrDefault')[0]!
    expect(attr(els(def, 'sz')[0], 'val')).toBe('22')
    expect(attr(els(def, 'szCs')[0], 'val')).toBe('22')
  })

  it('the verifier rejects a plain pandoc DOCX (the problems Word users see)', async () => {
    const { root } = await build()
    const raw = join(root, 'raw.docx')
    execFileSync('pandoc', [join(root, 'manual/dist/.build/user-guide.th.md'), '-o', raw, `--resource-path=${join(root, 'manual')}`])
    const v = verifyDocx(unzipSync(readFileSync(raw)), { thaiFont: 'Sarabun' })
    expect(v.problems.join('\n')).toMatch(/no w:cs/)
    expect(v.problems.join('\n')).toMatch(/themeFontLang/)
    const cli = runCli(['check', '--docx', raw, '--font', 'Sarabun'])
    expect(cli.code).toBe(1)
  })

  it('separates Latin and Thai fonts and sizes (TH fonts default to 16pt)', async () => {
    const { zip } = await build('fonts: { embedFonts: false, docx: { thai: { family: TH Sarabun New }, latin: { family: Arial }, latinSize: 14 } }\n')
    const styles = xml(zip, 'word/styles.xml')
    const def = els(styles, 'rPrDefault')[0]!
    expect(attr(els(def, 'sz')[0], 'val')).toBe('28')
    expect(attr(els(def, 'szCs')[0], 'val')).toBe('32')
    const f = els(def, 'rFonts')[0]!
    expect([attr(f, 'ascii'), attr(f, 'hAnsi'), attr(f, 'cs')]).toEqual(['Arial', 'Arial', 'TH Sarabun New'])
    for (const r of thaiRuns(zip, 'word/document.xml')) expect(attr(kid(kid(r, 'rPr')!, 'rFonts'), 'cs')).toBe('TH Sarabun New')
    const theme = text(zip['word/theme/theme1.xml']!)
    expect(theme).toContain('<a:latin typeface="Arial"/>')
    expect(theme).toContain('<a:font script="Thai" typeface="TH Sarabun New"/>')
    expect(verifyDocx(zip, { thaiFont: 'TH Sarabun New', latinFont: 'Arial' }).problems).toEqual([])
  })

  it('thaiJustify: body paragraphs use thaiDistribute and get zero-width spaces at Thai word boundaries', async () => {
    const off = await build()
    expect(text(off.zip['word/document.xml']!)).not.toContain('\u200B')
    const { zip } = await build('docx: { thaiJustify: true }\n')
    const styles = text(zip['word/styles.xml']!)
    expect(styles).toMatch(/w:styleId="BodyText"[\s\S]*?<w:jc w:val="thaiDistribute"\/>/)
    const doc = text(zip['word/document.xml']!)
    expect(doc).toMatch(/แล้ว\u200Bกด/)
    expect(doc).not.toMatch(/\u200B\u200B/)
    // headings are not justified, so they keep plain text
    expect(doc).toMatch(/<w:t[^>]*>เข้าสู่ระบบ<\/w:t>/)
    expect(verifyDocx(zip, { thaiFont: 'Sarabun' }).problems).toEqual([])
  })

  it('reports a schema-order mistake inside a run', async () => {
    const { zip } = await build()
    const doc = text(zip['word/document.xml']!).replace(/<w:rPr><w:rFonts([^>]*)\/>/, '<w:rPr><w:lang w:val="en-US"/><w:rFonts$1/>')
    const bad = { ...zip, 'word/document.xml': new TextEncoder().encode(doc) }
    expect(verifyDocx(bad, { thaiFont: 'Sarabun' }).problems.join('\n')).toMatch(/rPr: lang before rFonts/)
  })
})
