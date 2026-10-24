import { appendFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openProject } from '../src/project.ts'
import { markdownToHtml, renderBook } from '../src/render.ts'
import { PNG_1PX, cleanFixture } from './helpers/fixture.ts'

describe('renderBook', () => {
  it('replaces tokens with real UI text, data, numbered figures and links (Thai)', async () => {
    const root = await cleanFixture()
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'th', book: 'user-guide', target: 'html' })
    expect(book.title).toBe('คู่มือผู้ใช้')
    expect(book.chapters.map((c) => [c.number, c.id, c.title])).toEqual([
      [1, 'teacher.sign-in', 'เข้าสู่ระบบ'],
      [2, 'teacher.create-class', 'สร้างห้องเรียน'],
    ])
    const [one, two] = book.chapters
    expect(one!.markdown).toContain('กรอก **อีเมล** แล้วกด **เข้าสู่ระบบ**')
    expect(one!.markdown).toContain('<figure class="figure" id="fig-1-1"><img src="media/th/login.png" alt="หน้า เข้าสู่ระบบ"><figcaption>ภาพที่ 1-1 หน้า เข้าสู่ระบบ</figcaption></figure>')
    expect(one!.markdown).toContain('[สร้างห้องเรียน](#page-teacher_create-class)')
    expect(two!.markdown).toContain('ห้องหนึ่งมีนักเรียนได้ 40 คน')
    expect(two!.markdown).toContain('{{ui:not.a.token.inside.code}}')
    // steps without step images (media: screenshots) are a numbered list of instructions
    expect(two!.markdown).toContain('1. กด **สร้างห้องเรียน**\n2. พิมพ์**ชื่อห้องเรียน** แล้วกด **บันทึก**')
    expect(book.figures).toEqual([{ id: 'fig-1-1', label: 'ภาพที่ 1-1', caption: 'หน้า เข้าสู่ระบบ', chapter: 1 }])
  })

  it('renders English labels and pandoc figures for DOCX', async () => {
    const root = await cleanFixture()
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'en', book: 'user-guide', target: 'pandoc' })
    expect(book.chapters[0]!.markdown).toContain('![Figure 1-1 The Sign in page](media/en/login.png){#fig-1-1 width=0.02cm height=0.02cm}')
    expect(book.chapters[0]!.markdown).toContain('Enter your **Email** and press **Sign in**.')
  })

  it('numbers captioned tables and shows step images when media is steps', async () => {
    const root = await cleanFixture()
    appendFileSync(join(root, 'manual/pages/th/user-guide/02-create-class.md'), '\n| ช่อง | ความหมาย |\n|---|---|\n| ชื่อ | ชื่อห้อง |\n\n: ช่องในฟอร์ม\n')
    for (const n of [1, 2]) writeFileSync(join(root, `manual/media/th/create-class-${n}.png`), PNG_1PX)
    const project = await openProject(join(root, 'manual'))
    project.config.media = 'steps'
    const html = renderBook(project, { lang: 'th', book: 'user-guide', target: 'html' })
    expect(html.tables).toEqual([{ id: 'tab-2-1', label: 'ตารางที่ 2-1', caption: 'ช่องในฟอร์ม', chapter: 2 }])
    expect(html.chapters[1]!.markdown).toContain('<p class="table-caption" id="tab-2-1">ตารางที่ 2-1 ช่องในฟอร์ม</p>')
    expect(html.chapters[1]!.markdown).toMatch(/1\. กด \*\*สร้างห้องเรียน\*\*\n\n {3}<figure class="figure step" id="fig-2-1"><img src="media\/th\/create-class-1\.png"/)
    const pandoc = renderBook(project, { lang: 'th', book: 'user-guide', target: 'pandoc' })
    expect(pandoc.chapters[1]!.markdown).toContain(': ตารางที่ 2-1 ช่องในฟอร์ม')
  })

  it('marks a missing image instead of dropping it, and drops shots when media is none', async () => {
    const root = await cleanFixture()
    rmSync(join(root, 'manual/media/th/login.png'))
    const project = await openProject(join(root, 'manual'))
    expect(renderBook(project, { lang: 'th', book: 'user-guide', target: 'html' }).chapters[0]!.markdown).toContain('class="figure missing"')
    project.config.media = 'none'
    const none = renderBook(project, { lang: 'th', book: 'user-guide', target: 'html' })
    expect(none.chapters[0]!.markdown).not.toContain('figure')
    expect(none.figures).toEqual([])
  })

  it('snapshot of the Thai book', async () => {
    const root = await cleanFixture()
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'th', book: 'user-guide', target: 'pandoc' })
    expect(book.chapters.map((c) => c.markdown).join('\n\n----\n\n')).toMatchSnapshot()
  })
})

describe('markdownToHtml', () => {
  it('numbers nothing itself but gives section headings stable ids per chapter', () => {
    const { html, headings } = markdownToHtml('## ก่อนเริ่ม\n\nข้อความ\n\n## ขั้นตอน\n', 3)
    expect(html).toContain('<h2 id="sec-3-1">ก่อนเริ่ม</h2>')
    expect(headings).toEqual([
      { id: 'sec-3-1', level: 2, text: 'ก่อนเริ่ม' },
      { id: 'sec-3-2', level: 2, text: 'ขั้นตอน' },
    ])
  })
})
