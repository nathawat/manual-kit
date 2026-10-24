import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.ts'
import { openProject } from '../src/project.ts'
import { publishOutline } from '../src/publish/outline.ts'
import { renderBook } from '../src/render.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { outlineMock } from './helpers/outline-mock.ts'

/** The fixture with a second book (admin-guide, Thai only) whose page links back to the user guide, and a link to it. */
async function twoBooks(extraConfig = '') {
  const root = await cleanFixture()
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('books:\n', 'books:\n  admin-guide: { title: { th: คู่มือผู้ดูแล, en: Admin guide } }\n') + extraConfig)
  mkdirSync(join(root, 'manual/pages/th/admin-guide'), { recursive: true })
  writeFileSync(
    join(root, 'manual/pages/th/admin-guide/01-users.md'),
    '---\nid: admin.users\ntitle: จัดการผู้ใช้\naudience: [admin]\nbook: admin-guide\nkind: concept\n---\n\nครูเข้าระบบตาม [[teacher.sign-in]]\n',
  )
  const page = join(root, 'manual/pages/th/user-guide/01-sign-in.md')
  writeFileSync(page, `${readFileSync(page, 'utf8')}\n- [[admin.users]]\n`)
  return root
}

describe('links to a page in another book', () => {
  it('check accepts them', async () => {
    const root = await twoBooks()
    const report = runCheck(await openProject(join(root, 'manual')), { allowUnsigned: true })
    expect(report.findings.filter((f) => f.rule === 'link')).toEqual([])
  })

  it('PDF and DOCX name the other book and page; the web links to the other book', async () => {
    const project = await openProject(join(await twoBooks(), 'manual'))
    const md = (target: 'html' | 'pandoc' | 'web', book = 'user-guide') => renderBook(project, { lang: 'th', book, target }).chapters[0]!.markdown
    expect(md('html')).toContain('- ดู คู่มือผู้ดูแล: จัดการผู้ใช้')
    expect(md('pandoc')).toContain('- ดู คู่มือผู้ดูแล: จัดการผู้ใช้')
    expect(md('web')).toContain('- [คู่มือผู้ดูแล: จัดการผู้ใช้](../../admin-guide/th/admin.users.html)')
    expect(md('web', 'admin-guide')).toContain('[คู่มือผู้ใช้: เข้าสู่ระบบ](../../user-guide/th/teacher.sign-in.html)')
    // links inside the book are unchanged
    expect(md('html')).toContain('[สร้างห้องเรียน](#page-teacher_create-class)')
  })

  let mock: Awaited<ReturnType<typeof outlineMock>> | undefined
  afterEach(async () => mock?.close())

  it('Outline links to the other book\'s document', async () => {
    mock = await outlineMock()
    const root = await twoBooks(`\noutline: { baseUrl: "${mock.url}", collection: Hq7RtK2xWm }\n`)
    const project = await openProject(join(root, 'manual'))
    await publishOutline(project, { lang: 'th', token: 'test-token-123', log: () => {} })
    const map = JSON.parse(readFileSync(join(root, 'manual/outline.json'), 'utf8')) as { documents: Record<string, { id: string; url: string }> }
    const text = (key: string) => mock!.docs.get(map.documents[key]!.id)!.text
    expect(text('user-guide/th/teacher.sign-in')).toContain(`[คู่มือผู้ดูแล: จัดการผู้ใช้](${map.documents['admin-guide/th/admin.users']!.url})`)
    expect(text('admin-guide/th/admin.users')).toContain(`[คู่มือผู้ใช้: เข้าสู่ระบบ](${map.documents['user-guide/th/teacher.sign-in']!.url})`)

    // publishing one book alone still finds the other book's document in outline.json
    const page = join(root, 'manual/pages/th/admin-guide/01-users.md')
    writeFileSync(page, readFileSync(page, 'utf8').replace('ครูเข้าระบบ', 'ครูทุกคนเข้าระบบ'))
    await publishOutline(await openProject(join(root, 'manual')), { lang: 'th', book: 'admin-guide', token: 'test-token-123', log: () => {} })
    expect(text('admin-guide/th/admin.users')).toContain(`[คู่มือผู้ใช้: เข้าสู่ระบบ](${map.documents['user-guide/th/teacher.sign-in']!.url})`)
  })
})
