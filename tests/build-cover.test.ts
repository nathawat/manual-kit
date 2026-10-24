import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'
import { docxParts, xmlText } from './helpers/docx.ts'
import { cleanFixture, solidPng } from './helpers/fixture.ts'
import { pdfText } from './helpers/pdf.ts'

/** The fixture with cover art, a developer and project CSS that names images by path. */
async function brandedFixture(extra = '') {
  const root = await cleanFixture()
  const manual = join(root, 'manual')
  mkdirSync(join(manual, 'art'), { recursive: true })
  for (const [name, w, h] of [['seal.png', 200, 240], ['logo.png', 400, 100], ['hero.png', 800, 240], ['icon.png', 40, 40], ['band.png', 120, 100], ['foot.png', 100, 120]] as const)
    writeFileSync(join(manual, 'art', name), solidPng(w, h))
  // one url() relative to the CSS file, one relative to the manual folder
  writeFileSync(join(manual, 'art/print.css'), `section.cover .cover-band { background: url("band.png") 0 0 / 30mm 30mm no-repeat; }\nsection.cover .cover-foot { background: url('art/foot.png') 0 0 / 30mm 30mm no-repeat; }\n`)
  const cfg = join(manual, 'manual.config.yaml')
  const text = readFileSync(cfg, 'utf8')
    .replace('  project: Classroom\n', `  project: Classroom\n  developer: { th: บริษัท ตัวอย่าง จำกัด, en: Example Company }\n  logos: [art/seal.png, art/logo.png]\n  coverImage: art/hero.png\n`)
    .replace('user-guide: { title: { th: คู่มือผู้ใช้, en: User guide } }', 'user-guide: { title: { th: คู่มือผู้ใช้, en: User guide }, icon: art/icon.png }')
  writeFileSync(cfg, `${text}templates: { pdfCss: art/print.css${extra} }\n`)
  return root
}

const coverHtml = (root: string, lang = 'th') => readFileSync(join(root, `manual/dist/.build/user-guide.${lang}.html`), 'utf8')
const pageOneImages = (pdf: string) =>
  execFileSync('pdfimages', ['-list', '-f', '1', '-l', '1', pdf], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim()).length

describe('formal cover', () => {
  it('is the default: logos, illustration and book icon on page 1, the developer named alone', async () => {
    const root = await brandedFixture()
    const r = runCli(['build', 'pdf', '--lang', 'th'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const pdf = join(root, 'manual/dist/user-guide.th.pdf')
    const page1 = pdfText(pdf).split('\f')[0]!
    expect(page1).toContain('โรงเรียนตัวอย่าง')
    expect(page1).toContain('คู่มือการใช้งานระบบห้องเรียน')
    expect(page1).toContain('คู่มือผู้ใช้')
    // the footer line starts with the developer's name, without a "developed by" prefix
    expect(page1).toMatch(/^\s*บริษัท ตัวอย่าง จำกัด(\s|$)/m)
    expect(page1).not.toMatch(/พัฒนา(ระบบ)?โดย/)
    // seal, system logo, illustration, book icon, and the two images project CSS names
    expect(pageOneImages(pdf)).toBe(6)
    const html = coverHtml(root)
    expect(html).toContain('<body data-book="user-guide">')
    expect(html).toMatch(/<section class="cover cover--formal" data-book="user-guide">/)
    expect(html).not.toMatch(/url\(["']?(art\/)?(band|foot)\.png/)
    // project CSS comes after the built-in styles, so it wins at equal specificity
    expect(html.indexOf('section.cover .cover-band { background: url("data:')).toBeGreaterThan(html.indexOf('section.cover--formal {'))
  })

  it('uses the web theme colours unless the brand sets its own', async () => {
    const root = await brandedFixture()
    expect(runCli(['build', 'pdf', '--lang', 'en'], root).code).toBe(0)
    expect(coverHtml(root, 'en')).toContain('--cover-brand: #183b5e; --cover-accent: #d9480f;')
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, `${readFileSync(cfg, 'utf8')}web: { brand: { colors: { brand: "#123456", accent: "#abcdef" } } }\n`)
    expect(runCli(['build', 'pdf', '--lang', 'en'], root).code).toBe(0)
    expect(coverHtml(root, 'en')).toContain('--cover-brand: #123456; --cover-accent: #abcdef;')
  })

  it('templates.cover: neutral keeps the plain text cover', async () => {
    const root = await brandedFixture(', cover: neutral')
    expect(runCli(['build', 'pdf', '--lang', 'en'], root).code).toBe(0)
    const html = coverHtml(root, 'en')
    expect(html).not.toContain('class="cover cover--formal"')
    expect(html).toContain('<section class="cover" data-book="user-guide">')
    expect(pdfText(join(root, 'manual/dist/user-guide.en.pdf')).split('\f')[0]).toContain('Classroom system manual')
  })

  it('a missing cover image fails the build and names the key', async () => {
    const root = await brandedFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('art/logo.png', 'art/nope.png'))
    const r = runCli(['build', 'pdf', '--lang', 'en'], root)
    expect(r.code).not.toBe(0)
    expect(r.stderr).toContain('document.logos[1]: art/nope.png not found')
  })

  it('the DOCX cover has the logos, the illustration and the developer', async () => {
    const root = await brandedFixture()
    expect(runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root).code).toBe(0)
    const parts = docxParts(join(root, 'manual/dist/user-guide.th.docx'))
    const doc = parts['word/document.xml']!
    const cover = doc.slice(0, doc.indexOf('w:type="page"'))
    expect(cover.match(/<pic:pic\b/g)?.length).toBe(3)
    expect(xmlText(cover)).toContain('บริษัท ตัวอย่าง จำกัด')
    expect(xmlText(cover)).not.toMatch(/พัฒนา(ระบบ)?โดย/)
  })
})
