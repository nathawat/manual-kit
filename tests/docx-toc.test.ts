import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { postProcessDocx } from '../src/build/docx-post.ts'
import { chooseFinalizer } from '../src/build/finalize.ts'
import { resolveDocxFonts } from '../src/build/fonts.ts'
import { openProject } from '../src/project.ts'
import { verifyDocx } from '../src/verify-docx.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'

const text = (b: Uint8Array) => new TextDecoder().decode(b)

async function build(args: string[] = ['--finalize', 'none']) {
  const root = await cleanFixture()
  const r = runCli(['build', 'docx', '--lang', 'th', ...args], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  const zip = unzipSync(readFileSync(join(root, 'manual/dist/user-guide.th.docx')))
  return { r, zip, doc: text(zip['word/document.xml']!), settings: text(zip['word/settings.xml']!), styles: text(zip['word/styles.xml']!) }
}

/** The paragraphs between a TOC field's separate and end marks. */
function fieldResult(doc: string, instr: RegExp): string {
  const i = doc.search(instr)
  expect(i).toBeGreaterThan(0)
  const sep = doc.indexOf('w:fldCharType="separate"', i)
  const end = doc.indexOf('w:fldCharType="end"', sep)
  return doc.slice(sep, end)
}
const visible = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')

describe('lists in the DOCX are visible without updating fields', () => {
  it('pre-fills the contents with every heading, linked to its bookmark', async () => {
    const { doc, styles } = await build()
    const toc = fieldResult(doc, /TOC \\o &quot;1-3&quot;|TOC \\o "1-3"/)
    expect(visible(toc)).toMatch(/บทนำ\|.*1 เข้าสู่ระบบ\|.*2 สร้างห้องเรียน/)
    expect(toc).toMatch(/<w:hyperlink w:anchor="page-teacher_sign-in"/)
    expect(toc).toMatch(/<w:pStyle w:val="TOC1"\/>/)
    for (const id of ['TOC1', 'TOC2', 'TOC3', 'TOC9']) expect(styles).toContain(`w:styleId="${id}"`)
  })

  it('pre-fills the list of figures from the image captions', async () => {
    const { doc } = await build()
    expect(visible(fieldResult(doc, /Image Caption/))).toContain('ภาพที่ 1-1 หน้า เข้าสู่ระบบ')
  })

  it('figure and table lists use their own non-bold TOC level, so Word does not format them like chapters', async () => {
    const { doc, styles } = await build()
    expect(doc).toMatch(/TOC \\h \\z \\t &quot;Image Caption,9&quot;|TOC \\h \\z \\t "Image Caption,9"/)
    const at = doc.search(/Image Caption/)
    const figs = doc.slice(doc.lastIndexOf('<w:p>', at), doc.indexOf('w:fldCharType="end"', at))
    expect(figs).toMatch(/<w:pStyle w:val="TOC9"\/>/)
    expect(figs).not.toMatch(/w:val="TOC1"/)
    const toc9 = /<w:style [^>]*w:styleId="TOC9"[\s\S]*?<\/w:style>/.exec(styles)?.[0] ?? ''
    expect(toc9).toContain('<w:name w:val="toc 9"/>')
    expect(toc9).not.toMatch(/<w:b\/>|<w:bCs\/>/)
    expect(toc9).toMatch(/<w:ind w:left="0"\/>/)
  })

  it('does not mark fields dirty (Word would prompt on open) and keeps updateFields as the fallback when not finalized', async () => {
    const { doc, settings, r, zip } = await build()
    expect(doc).not.toContain('w:dirty')
    expect(settings).toMatch(/<w:updateFields w:val="true"\/>/)
    expect(r.stdout).toMatch(/not finalized/i)
    expect(verifyDocx(zip, { thaiFont: 'Sarabun' }).problems).toEqual([])
  })

  it('rejects an unknown finalize mode', async () => {
    const root = await cleanFixture()
    expect(runCli(['build', 'docx', '--finalize', 'pages'], root).code).not.toBe(0)
  })
})

describe('chooseFinalizer', () => {
  const probe = (word: boolean, soffice: boolean, platform = 'darwin') => ({ platform, hasWord: () => word, soffice: () => (soffice ? '/x/soffice' : null) })
  it('auto is LibreOffice when installed, else nothing; never Microsoft Word (it has hung), even when installed', () => {
    expect(chooseFinalizer('auto', probe(true, true))).toBe('libreoffice')
    expect(chooseFinalizer('auto', probe(false, true))).toBe('libreoffice')
    expect(chooseFinalizer('auto', probe(false, false))).toBe('none')
    expect(chooseFinalizer('auto', probe(true, false))).toBe('none')
    expect(chooseFinalizer('auto', probe(true, false, 'linux'))).toBe('none')
    expect(chooseFinalizer('word', probe(true, false))).toBe('word')
    expect(chooseFinalizer('none', probe(true, true))).toBe('none')
    expect(chooseFinalizer('libreoffice', probe(true, true))).toBe('libreoffice')
  })
  it('an explicit finalizer that is not installed is an error', () => {
    expect(() => chooseFinalizer('word', probe(false, false))).toThrow(/Microsoft Word/)
    expect(() => chooseFinalizer('libreoffice', probe(true, false))).toThrow(/LibreOffice \(soffice\)/)
  })
})

describe('a file re-saved by a word processor', () => {
  it('post-processing drops content types for parts that are gone and puts run/paragraph properties back in schema order', async () => {
    const { zip } = await build()
    const types = text(zip['[Content_Types].xml']!).replace('</Types>', '<Override PartName="/word/fonts/font9.odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/></Types>')
    zip['[Content_Types].xml'] = new TextEncoder().encode(types)
    const doc = text(zip['word/document.xml']!).replace(/<w:rPr><w:rStyle ([^>]*)\/>/, '<w:rPr><w:webHidden/><w:rStyle $1/>')
    expect(doc).toContain('<w:webHidden/><w:rStyle')
    zip['word/document.xml'] = new TextEncoder().encode(doc)
    expect(verifyDocx(zip).problems.length).toBeGreaterThan(0)
    postProcessDocx(zip, { fonts: resolveDocxFonts(await openProject(join(await cleanFixture(), 'manual'))), embedFonts: true, thaiJustify: false }, false)
    expect(verifyDocx(zip, { thaiFont: 'Sarabun' }).problems).toEqual([])
  })
})

describe('finalize with LibreOffice (fake soffice: the wiring, not LibreOffice itself)', () => {
  const fake = (python: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-lo-'))
    writeFileSync(join(dir, 'soffice'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    // called as: python finalize.py <soffice> <in.docx> <out.docx> <out.pdf> <profile dir>
    writeFileSync(join(dir, 'python'), `#!/bin/sh\n${python}\n`, { mode: 0o755 })
    return { MANUAL_KIT_SOFFICE: join(dir, 'soffice'), MANUAL_KIT_SOFFICE_PYTHON: join(dir, 'python') }
  }
  it('takes the DOCX LibreOffice saved, re-applies the Thai rules and says what LibreOffice does not prove', async () => {
    const root = await cleanFixture()
    const env = fake('cp "$3" "$4" && printf "%%PDF-1.7" > "$5" && echo indexes=3')
    const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'libreoffice', '--verbose'], root, env)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/^finalize: libreoffice \(--finalize libreoffice; soffice .*soffice\)/m)
    expect(r.stdout).toMatch(/finalized with LibreOffice \(3 indexes updated/)
    expect(r.stdout).toMatch(/not verified: .*Microsoft Word/)
    const zip = unzipSync(readFileSync(join(root, 'manual/dist/user-guide.th.docx')))
    expect(verifyDocx(zip, { thaiFont: 'Sarabun' }).problems).toEqual([])
    expect(text(zip['word/settings.xml']!)).not.toContain('updateFields')
  })
  it('a LibreOffice failure is a warning and the DOCX stays as pandoc built it', async () => {
    const root = await cleanFixture()
    const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'libreoffice'], root, fake('echo boom >&2; exit 1'))
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/warning: DOCX not finalized: LibreOffice did not finish \(boom/)
    expect(text(unzipSync(readFileSync(join(root, 'manual/dist/user-guide.th.docx')))['word/settings.xml']!)).toContain('updateFields')
  })
  it('with no word processor, build lists what it could not verify, and with --verbose what it checked', async () => {
    const { r } = await build()
    expect(r.stdout).toMatch(/^finalize: none \(--finalize none\)/m)
    expect(r.stdout).not.toMatch(/checked: /)
    expect(r.stdout).toMatch(/not verified: page numbers in the contents/)
    expect(r.stdout).toMatch(/not verified: page breaks/)
    expect(r.stdout).toMatch(/^warning: DOCX not finalized/m)
    expect(r.stdout).toMatch(/^docx: wrote 1 file in manual\/dist \(/m)
    const verbose = await build(['--finalize', 'none', '--verbose'])
    expect(verbose.r.stdout).toMatch(/checked: .*Thai/)
    expect(verbose.r.stdout).toMatch(/^wrote manual\/dist\/user-guide\.th\.docx$/m)
  })
})

describe.skipIf(!process.env.MK_TEST_WORD)('finalize with Microsoft Word (MK_TEST_WORD=1, macOS)', () => {
  it('Word fills the lists with page numbers; the result still passes the Thai checks with Sarabun embedded', async () => {
    const { doc, settings, zip, r } = await build(['--finalize', 'word'])
    expect(r.stdout).toMatch(/finalized with Microsoft Word/)
    expect(visible(fieldResult(doc, /TOC \\o/))).toMatch(/เข้าสู่ระบบ\|\d+/)
    expect(settings).not.toContain('updateFields')
    const v = verifyDocx(zip, { thaiFont: 'Sarabun' })
    expect(v.problems).toEqual([])
    expect(v.embeddedFonts).toContain('Sarabun')
  }, 300_000)
})
