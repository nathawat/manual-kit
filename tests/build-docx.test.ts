import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'
import { docxParts, xmlText } from './helpers/docx.ts'
import { cleanFixture, solidPng } from './helpers/fixture.ts'

describe('build docx', () => {
  it('builds a Thai DOCX with front matter, numbered headings, captions, TOC field, header/footer and Sarabun', async () => {
    const root = await cleanFixture()
    const r = runCli(['build', 'docx', '--lang', 'th', '--finalize', 'none'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const file = join(root, 'manual/dist/user-guide.th.docx')
    expect(existsSync(file)).toBe(true)
    const parts = docxParts(file)
    const doc = parts['word/document.xml']!.replace(/&quot;/g, '"')
    const text = xmlText(doc)
    expect(text).toContain('คู่มือการใช้งานระบบห้องเรียน')
    expect(text).toContain('ข้อมูลเอกสาร')
    expect(text).toContain('การอนุมัติเอกสาร')
    expect(text).toContain('ภาพที่ 1-1 หน้า เข้าสู่ระบบ')
    expect(text).toContain('กรอก อีเมล แล้วกด เข้าสู่ระบบ')
    expect(doc).toMatch(/TOC \\o "1-3"/)
    expect(doc).toMatch(/TOC \\h \\z \\t "Image Caption,9"/)
    expect(doc).toContain('<w:footerReference')
    // chapter headings are numbered 1, 2 (intro is unnumbered)
    expect(doc).toMatch(/<w:pStyle w:val="Heading1"\s*\/>[\s\S]*?1\s*<\/w:t>[\s\S]*?เข้าสู่ระบบ/)
    expect(Object.keys(parts).some((k) => k.startsWith('word/media/'))).toBe(true)
    const footer = Object.entries(parts).find(([k]) => /word\/footer\d*\.xml/.test(k))![1]
    expect(xmlText(footer)).toContain('หน้า')
    expect(footer).toContain('NUMPAGES')
    expect(parts['word/styles.xml']).toContain('w:ascii="Sarabun"')
    expect(parts['word/styles.xml']).toContain('w:bidi="th-TH"')
    expect(parts['word/styles.xml']).toMatch(/w:styleId="Table"[^>]*>[\s\S]*?<w:tblBorders>/)
  })

  it('uses a project reference.docx as-is when configured', async () => {
    const root = await cleanFixture()
    const { execFileSync } = await import('node:child_process')
    execFileSync('pandoc', ['-o', join(root, 'manual/ref.docx'), '--print-default-data-file', 'reference.docx'])
    const { appendFileSync } = await import('node:fs')
    appendFileSync(join(root, 'manual/manual.config.yaml'), 'templates: { docx: ref.docx }\n')
    expect(runCli(['build', 'docx', '--lang', 'en', '--finalize', 'none'], root).code).toBe(0)
    const parts = docxParts(join(root, 'manual/dist/user-guide.en.docx'))
    expect(parts['word/styles.xml']).not.toContain('Sarabun')
    expect(xmlText(parts['word/document.xml']!)).toContain('Figure 1-1 The Sign in page')
  })
})

describe('image sizes in the DOCX', () => {
  it('a tall screenshot is limited to the figure height of the PDF and keeps its proportions; a wide one fits the text width', async () => {
    const root = await cleanFixture()
    writeFileSync(join(root, 'manual/media/en/login.png'), solidPng(1000, 2000))
    expect(runCli(['build', 'docx', '--lang', 'en', '--finalize', 'none'], root).code).toBe(0)
    const extent = (file: string) => {
      const m = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(docxParts(file)['word/document.xml']!)!
      return { cx: Number(m[1]), cy: Number(m[2]) }
    }
    const tall = extent(join(root, 'manual/dist/user-guide.en.docx'))
    expect(tall.cy).toBeLessThanOrEqual(15 * 360000)
    expect(tall.cy).toBeGreaterThan(14 * 360000)
    expect(tall.cx / tall.cy).toBeCloseTo(0.5, 2)
    writeFileSync(join(root, 'manual/media/en/login.png'), solidPng(1600, 900))
    expect(runCli(['build', 'docx', '--lang', 'en', '--finalize', 'none'], root).code).toBe(0)
    const wide = extent(join(root, 'manual/dist/user-guide.en.docx'))
    expect(wide.cx).toBeLessThanOrEqual(17.2 * 360000)
    expect(wide.cx).toBeGreaterThan(17 * 360000)
  })
})
