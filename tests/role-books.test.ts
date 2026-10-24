// Role books (books.<id>.from): one task site with an "I am a..." picker, and a PDF/DOCX per role made from the same
// pages. Fixture: one source book "office" (6 pages, 3 roles, groups in app-menu order) and 3 role books.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { buildTargets } from '../src/build/pdf.ts'
import { runCheck } from '../src/check.ts'
import { ConfigSchema } from '../src/config.ts'
import { bookPages, openProject } from '../src/project.ts'
import { problemPairs, renderBook } from '../src/render.ts'
import { runCli } from './helpers/cli.ts'
import { docxParts, xmlText } from './helpers/docx.ts'
import { pdfText } from './helpers/pdf.ts'

const ROLES = fileURLToPath(new URL('./fixtures/roles', import.meta.url))
const read = (f: string) => readFileSync(f, 'utf8')

function rolesFixture(): { root: string; manual: string } {
  const root = mkdtempSync(join(tmpdir(), 'mk-roles-'))
  cpSync(ROLES, root, { recursive: true })
  return { root, manual: join(root, 'manual') }
}

const ids = async (manual: string, book: string) => bookPages(await openProject(manual), book, 'th').map((p) => p.id)

describe('role books: page selection', () => {
  it('a role book takes the source pages for its audience in the source menu order, pages for everyone included', async () => {
    const { manual } = rolesFixture()
    // file order is sign, receive, forward, draft, delegate, sign-in; the menu order is start, inbox, outbox, settings
    expect(await ids(manual, 'office')).toEqual(['office.sign-in', 'office.receive', 'office.forward', 'office.sign', 'office.draft', 'office.delegate'])
    expect(await ids(manual, 'clerk-guide')).toEqual(['office.sign-in', 'office.receive', 'office.forward'])
    expect(await ids(manual, 'signer-guide')).toEqual(['office.sign-in', 'office.sign', 'office.delegate'])
    expect(await ids(manual, 'staff-guide')).toEqual(['office.sign-in', 'office.forward', 'office.draft'])
    const project = await openProject(manual)
    expect(buildTargets(project, {}).map((t) => t.book)).toEqual(['clerk-guide', 'office', 'signer-guide', 'staff-guide'])
    // a role book renders only its pages; a link to a page it leaves out names the source book (paper)
    const book = renderBook(project, { lang: 'th', book: 'signer-guide', target: 'html' })
    expect(book.title).toBe('คู่มือผู้ลงนาม')
    expect(book.chapters.map((c) => [c.number, c.id])).toEqual([[1, 'office.sign-in'], [2, 'office.sign'], [3, 'office.delegate']])
    expect(book.chapters[0]!.markdown).toContain('ดู คู่มือระบบงานสารบรรณ: รับหนังสือเข้าระบบ')
  })

  it('a role book with several audiences takes a page once', async () => {
    const { manual } = rolesFixture()
    const cfg = join(manual, 'manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('audience: [staff] }', 'audience: [staff, clerk] }'))
    expect(await ids(manual, 'staff-guide')).toEqual(['office.sign-in', 'office.receive', 'office.forward', 'office.draft'])
  })

  it('config: the source must be another book that is not itself a role book', () => {
    const parse = (books: unknown) => ConfigSchema.safeParse({ document: { title: 'x' }, books })
    const message = (books: unknown) => {
      const r = parse(books)
      return r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    }
    expect(parse({ a: { title: 'A' }, b: { title: 'B', from: { book: 'a', audience: ['x'] } } }).success).toBe(true)
    expect(message({ b: { title: 'B', from: { book: 'a', audience: ['x'] } } })).toBe('books.b.from.book: book "a" is not in books')
    expect(message({ b: { title: 'B', from: { book: 'b', audience: ['x'] } } })).toBe('books.b.from.book: a book cannot be made from itself')
    expect(message({ a: { title: 'A' }, b: { title: 'B', from: { book: 'a', audience: ['x'] } }, c: { title: 'C', from: { book: 'b', audience: ['x'] } } })).toBe(
      'books.c.from.book: book "b" is itself made from another book',
    )
    expect(parse({ a: { title: 'A' }, b: { title: 'B', from: { book: 'a', audience: [] } } }).success).toBe(false)
    // web.audiences: a label as before, or a label with a description
    const web = ConfigSchema.parse({ document: { title: 'x' }, web: { audiences: { a: 'A', b: { th: 'บี' }, c: { label: 'C', description: { th: 'ซี' } } } } }).web
    expect(Object.keys(web.audiences)).toEqual(['a', 'b', 'c'])
  })
})

describe('role books: commands that meet a book without pages', () => {
  it('check: no warning for a role book; a page in its folder is an error; an audience no page names is a warning', async () => {
    const { manual } = rolesFixture()
    const rules = async () => runCheck(await openProject(manual), { allowUnsigned: true }).findings.filter((f) => f.rule === 'book').map((f) => `${f.severity} ${f.message}`)
    expect(await rules()).toEqual([])
    const cfg = join(manual, 'manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('audience: [signer] }', 'audience: [signer, singer] }'))
    mkdirSync(join(manual, 'pages/th/clerk-guide'))
    writeFileSync(join(manual, 'pages/th/clerk-guide/01-x.md'), '---\nid: clerk.x\ntitle: X\nbook: clerk-guide\nkind: concept\n---\nX\n')
    expect((await rules()).sort()).toEqual([
      'error book "clerk-guide" is made from "office" (books.clerk-guide.from), so it has no pages of its own: move this page to "office" and name its audience',
      'warning books.signer-guide.from.audience: no page of "office" names audience "singer"',
    ])
  })

  it('new-page refuses a role book; publish outline leaves role books out', () => {
    const { root, manual } = rolesFixture()
    const cfg = join(manual, 'manual.config.yaml')
    writeFileSync(cfg, `${readFileSync(cfg, 'utf8')}\noutline: { baseUrl: "https://wiki.example.com" }\n`)
    const np = runCli(['new-page', 'office.archive', '--kind', 'how-to', '--book', 'clerk-guide'], root)
    expect(np.code).not.toBe(0)
    expect(np.stderr).toContain('book "clerk-guide" is made from "office"')
    const plan = runCli(['publish', 'outline', '--collection', 'c', '--dry-run'], root, { OUTLINE_API_KEY: '' })
    expect(plan.stderr).toBe('')
    expect(plan.stdout).toMatch(/create\s+book\s+office\/th/)
    expect(plan.stdout).not.toMatch(/clerk-guide|signer-guide|staff-guide/)
  })
})

describe('role books: print', () => {
  it('a role book builds a PDF with its own title and only its pages; a problem and its fix are two lines', () => {
    const { root, manual } = rolesFixture()
    const r = runCli(['build', 'pdf', '--book', 'signer-guide'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const text = pdfText(join(manual, 'dist/signer-guide.th.pdf'))
    expect(text).toContain('คู่มือผู้ลงนาม')
    const chapters = [...text.matchAll(/^\s*(\d)\s{3,}(\S.*?)\s*$/gm)].map((m) => `${m[1]} ${m[2]}`)
    expect(chapters).toContain('1 เข้าสู่ระบบ')
    expect(chapters).toContain('2 ลงนามหนังสือ')
    expect(chapters).toContain('3 มอบหมายผู้ลงนามแทน')
    expect(text).not.toMatch(/ร่างหนังสือออก/)
    // the problem line ends before "วิธีแก้ไข:", which starts its own line
    expect(text).toMatch(/ปัญหา: “ไม่พบลายมือชื่อ”\s*\n\s*วิธีแก้ไข: อัปโหลดลายมือชื่อ/)
    expect(existsSync(join(manual, 'dist/office.th.pdf'))).toBe(false)
  })

  it('a role book builds a DOCX; the problem and its fix are split by a line break', () => {
    const { root, manual } = rolesFixture()
    const r = runCli(['build', 'docx', '--book', 'clerk-guide', '--finalize', 'none'], root)
    expect(r.code).toBe(0)
    const doc = docxParts(join(manual, 'dist/clerk-guide.th.docx'))['word/document.xml']!
    const text = xmlText(doc)
    expect(text).toContain('รับหนังสือเข้าระบบ')
    expect(text).toContain('ส่งต่อหนังสือ')
    expect(text).not.toContain('ลงนามหนังสือ')
    expect(doc).toMatch(/กรุณาเพิ่มหนังสือหลัก”<\/w:t><\/w:r>(?:(?!<\/w:p>)[\s\S])*<w:br\/>(?:(?!<\/w:p>)[\s\S])*วิธีแก้ไข:/)
  })

  it('problemPairs: a hard break after a problem line followed by its fix, plain or bold labels; not for Outline', () => {
    const md = ['- ปัญหา: “ก”', '  วิธีแก้ไข: ข', '- **Problem:** "c"', '  **Fix:** d', '- ปัญหา: alone', 'next'].join('\n')
    expect(problemPairs(md, 'pandoc').split('\n')).toEqual(['- ปัญหา: “ก”\\', '  วิธีแก้ไข: ข', '- **Problem:** "c"\\', '  **Fix:** d', '- ปัญหา: alone', 'next'])
    expect(problemPairs(md, 'outline')).toBe(md)
  })
})

describe('role books: the web site', () => {
  async function site() {
    const { root, manual } = rolesFixture()
    const dist = join(manual, 'dist')
    mkdirSync(dist, { recursive: true })
    for (const b of ['office', 'clerk-guide', 'signer-guide']) writeFileSync(join(dist, `${b}.th.pdf`), '%PDF-1.4 fake')
    const r = runCli(['build', 'web'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    return { root, web: join(dist, 'web') }
  }

  it('one site for the source book, none for a role book; the picker with role cards, descriptions, counts and role PDFs', async () => {
    const { root, web } = await site()
    for (const b of ['clerk-guide', 'signer-guide', 'staff-guide']) expect(existsSync(join(web, b))).toBe(false)
    expect(existsSync(join(web, 'office/th/signer-guide.th.pdf'))).toBe(true)
    const only = runCli(['build', 'web', '--book', 'clerk-guide'], root)
    expect(only.code).not.toBe(0)
    expect(only.stderr).toContain('book "clerk-guide" is made from "office"')

    const home = read(join(web, 'office/th/index.html'))
    const cards = [...home.matchAll(/<li class="rcard[^"]*" data-role="([^"]*)">/g)].map((m) => m[1])
    expect(cards).toEqual(['clerk', 'signer', 'staff', ''])
    expect(home).toMatch(/<a class="rpick" href="index.html" data-book="office" data-aud="clerk">.*<strong>เจ้าหน้าที่สารบรรณ<\/strong><\/span><small>3 หน้า<\/small><\/a><p>รับหนังสือเข้า ลงทะเบียน/)
    expect(home).toMatch(/data-aud="signer">.*?<\/a><p>[^<]+<\/p><ul class="rdl"><li><a href="signer-guide.th.pdf" download>.*<span>คู่มือผู้ลงนาม<\/span><small>PDF<\/small>/)
    // staff: a plain label, no description, no PDF built
    expect(home).toMatch(/data-aud="staff">.*?<strong>ผู้ใช้งานทั่วไป<\/strong><\/span><small>3 หน้า<\/small><\/a><\/li>/)
    expect(home).toMatch(/data-aud=""><span class="rcard-head">.*<strong>ดูทุกงาน<\/strong><\/span><small>6 หน้า<\/small>/)
    // sidebar: role chips (current role is the pressed one), the role files tagged with their roles
    const page = read(join(web, 'office/th/office.sign.html'))
    expect(page).toContain('<span class="aud-label" id="aud-label">ฉันเป็น…</span>')
    expect([...page.matchAll(/class="chip" data-aud="([^"]*)"[^>]*>([^<]+)<small>(\d+)/g)].map((m) => `${m[1]}:${m[2]!.trim()}:${m[3]}`)).toEqual([
      ':ดูทุกงาน:6',
      'clerk:เจ้าหน้าที่สารบรรณ:3',
      'signer:ผู้ลงนาม:3',
      'staff:ผู้ใช้งานทั่วไป:3',
    ])
    expect(page).toMatch(/<li data-for="signer"><a href="signer-guide.th.pdf" download>/)
    expect(page).toMatch(/<dt>สำหรับ<\/dt><dd class="who">[^<]*ผู้ลงนาม[^<]*<\/dd>/)
    // the front page links each role card to the site's home, and lists the role PDFs as printable manuals
    const root_ = read(join(web, 'index.html'))
    expect(root_).toMatch(/<a class="rpick" href="office\/th\/index.html" data-book="office" data-aud="signer">/)
    expect(root_).toMatch(/<a href="office\/th\/clerk-guide.th.pdf" download>.*คู่มือเจ้าหน้าที่สารบรรณ<\/a>/)
    // search: every page, each with its roles
    const index = read(join(web, 'office/th/search-index.js'))
    const docs = (JSON.parse(index.replace(/^window\.ManualKitIndex = |;\n$/g, '')) as { docs: { u: string; r?: string[] }[] }).docs
    expect(docs.find((d) => d.u === 'office.forward.html')?.r).toEqual(['เจ้าหน้าที่สารบรรณ', 'ผู้ใช้งานทั่วไป'])
    expect(docs.find((d) => d.u === 'office.sign-in.html')?.r).toBeUndefined()
  })

  it('in a browser: picking a role filters the sidebar and home lists, survives a reload, steers previous/next; search shows roles', async () => {
    const { web } = await site()
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      const url = (f: string) => pathToFileURL(join(web, 'office/th', f)).href
      const sidebar = () => page.locator('#site-nav .group li:visible a').allTextContents()
      await page.goto(url('office.sign.html'))
      expect(await sidebar()).toHaveLength(6)
      await page.locator('.chip', { hasText: 'ผู้ลงนาม' }).click()
      expect(await sidebar()).toEqual(['เข้าสู่ระบบ', 'ลงนามหนังสือ', 'มอบหมายผู้ลงนามแทน'])
      expect(await page.locator('.group:visible summary span').allTextContents()).toEqual(['เริ่มต้นใช้งาน', 'หนังสือออก', 'ตั้งค่า'])
      expect(await page.locator('.side-downloads li:visible').allTextContents()).toEqual(['ไฟล์ PDF', 'คู่มือผู้ลงนาม (PDF)'])
      expect(await page.locator('.pager a[rel="prev"] strong').textContent()).toBe('เข้าสู่ระบบ')
      expect(await page.locator('.pager a[rel="next"]').getAttribute('href')).toBe('office.delegate.html')
      await page.reload()
      expect(await page.locator('.chip[aria-pressed="true"]').textContent()).toMatch(/^ผู้ลงนาม/)
      expect(await sidebar()).toEqual(['เข้าสู่ระบบ', 'ลงนามหนังสือ', 'มอบหมายผู้ลงนามแทน'])
      // the home page: the picked card is marked, the lists show the role's pages; "see all tasks" clears the role
      await page.goto(url('index.html'))
      expect(await page.locator('.rcard.is-on').getAttribute('data-role')).toBe('signer')
      expect(await page.locator('.tgrid li:visible strong').allTextContents()).toEqual(['เข้าสู่ระบบ', 'ลงนามหนังสือ', 'มอบหมายผู้ลงนามแทน'])
      expect(await page.locator('section[aria-labelledby^="g-"]:visible h2').allTextContents()).toEqual(['เริ่มต้นใช้งาน', 'หนังสือออก', 'ตั้งค่า'])
      await page.locator('.rcard[data-role="clerk"] .rpick').click()
      expect(await sidebar()).toEqual(['เข้าสู่ระบบ', 'รับหนังสือเข้าระบบ', 'ส่งต่อหนังสือ'])
      await page.locator('.rcard[data-role=""] .rpick').click()
      expect(await sidebar()).toHaveLength(6)
      await page.reload()
      expect(await page.locator('.chip[aria-pressed="true"]').getAttribute('data-aud')).toBe('')
      // the front page picks the role and opens the site's home with it
      await page.goto(pathToFileURL(join(web, 'index.html')).href)
      await page.locator('.rcard[data-role="staff"] .rpick').click()
      await page.waitForURL(/office\/th\/index\.html$/)
      expect(await sidebar()).toEqual(['เข้าสู่ระบบ', 'ส่งต่อหนังสือ', 'ร่างหนังสือออก'])
      // search covers every page whatever the role, and each result names its roles
      await page.goto(`${url('search.html')}?q=${encodeURIComponent('หนังสือ')}`)
      await page.waitForSelector('#search-results li')
      const forward = page.locator('#search-results li', { has: page.locator('a', { hasText: 'ส่งต่อหนังสือ' }) }).first()
      expect(await forward.locator('.roles-of .tag').allTextContents()).toEqual(['เจ้าหน้าที่สารบรรณ', 'ผู้ใช้งานทั่วไป'])
      expect(await page.locator('#search-results li a', { hasText: 'ร่างหนังสือออก' }).count()).toBeGreaterThan(0)
      expect(errors).toEqual([])
    } finally {
      await browser.close()
    }
  })
})
