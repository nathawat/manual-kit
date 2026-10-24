import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, solidPng } from './helpers/fixture.ts'
import { pdfPages, pdfText } from './helpers/pdf.ts'

describe('build pdf', () => {
  it('builds a Thai PDF with front matter, page numbers, TOC and content', async () => {
    const root = await cleanFixture()
    const r = runCli(['build', 'pdf', '--lang', 'th'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const file = join(root, 'manual/dist/user-guide.th.pdf')
    expect(r.stdout).toMatch(/^pdf: wrote 1 file in manual\/dist \(\d+\.\ds\)$/m)
    expect(r.stdout).not.toContain('wrote manual/dist/user-guide.th.pdf')
    expect(existsSync(file)).toBe(true)
    expect(pdfPages(file)).toBeGreaterThan(3)
    const text = pdfText(file)
    expect(text).toContain('คู่มือการใช้งานระบบห้องเรียน')
    expect(text).toContain('ข้อมูลเอกสาร')
    expect(text).toContain('การอนุมัติเอกสาร')
    expect(text).toContain('สารบัญ')
    expect(text).toMatch(/หน้า \d+ จาก \d+/)
    expect(text).toContain('ภาพที่ 1-1')
    expect(text).toContain('กรอก อีเมล แล้วกด เข้าสู่ระบบ')
    // the TOC carries real page numbers for the chapters
    expect(text).toMatch(/1\s+เข้าสู่ระบบ\s*\.*\s*\d+/)
  })

  it('builds every configured language and applies a project pdf.css', async () => {
    const root = await cleanFixture()
    writeFileSync(join(root, 'manual/project.css'), '@page { @bottom-left { content: "PROJECT-CSS"; } }')
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, `${(await import('node:fs')).readFileSync(cfg, 'utf8')}templates: { pdfCss: project.css }\n`)
    const r = runCli(['build', 'pdf'], root)
    expect(r.code).toBe(0)
    expect(pdfText(join(root, 'manual/dist/user-guide.en.pdf'))).toContain('PROJECT-CSS')
    expect(existsSync(join(root, 'manual/dist/user-guide.th.pdf'))).toBe(true)
  })
})

describe('tall images in the PDF', () => {
  it('a tall screenshot shrinks to the space left on the page instead of leaving the page nearly empty', async () => {
    const root = await cleanFixture()
    const page = join(root, 'manual/pages/en/user-guide/01-sign-in.md')
    const filler = Array.from({ length: 13 }, (_, i) => `Filler paragraph ${i + 1} that takes one line on the page.`).join('\n\n')
    // only the steps before the figure, so the filler alone decides where the page breaks
    const steps = readFileSync(page, 'utf8').replace(/(\n---\n)[\s\S]*?## How to sign in\n\n/, '$1')
    writeFileSync(page, steps.replace('Enter your', `${filler}\n\nLASTLINE Enter your`))
    writeFileSync(join(root, 'manual/media/en/login.png'), solidPng(1000, 2000))
    const r = runCli(['build', 'pdf', '--lang', 'en'], root)
    expect(r.stderr).toBe('')
    const pages = pdfText(join(root, 'manual/dist/user-guide.en.pdf')).split('\f')
    const at = pages.findIndex((p) => p.includes('LASTLINE'))
    expect(pages[at]).toContain('Figure 1-1')
    // with too little room left it still moves to the next page rather than becoming a thumbnail
    const more = Array.from({ length: 12 }, (_, i) => `More filler ${i + 1} that takes one line.`).join('\n\n')
    writeFileSync(page, readFileSync(page, 'utf8').replace('LASTLINE', `${more}\n\nLASTLINE`))
    expect(runCli(['build', 'pdf', '--lang', 'en'], root).code).toBe(0)
    const again = pdfText(join(root, 'manual/dist/user-guide.en.pdf')).split('\f')
    const at2 = again.findIndex((p) => p.includes('LASTLINE'))
    expect(again[at2]).not.toContain('Figure 1-1')
    expect(again[at2 + 1]).toContain('Figure 1-1')
  })
})
