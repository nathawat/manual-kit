// Front page of the web build (dist/web/index.html): hero with search across the books, book cards, journey strip,
// footer; parts without data are left out.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, solidPng } from './helpers/fixture.ts'

const require = createRequire(import.meta.url)
const read = (f: string) => readFileSync(f, 'utf8')

const ADMIN_PAGE = `---
id: admin.users
title: จัดการบัญชีผู้ใช้
audience: [admin]
book: admin-guide
kind: how-to
group: users
---
เพิ่มและปิดบัญชีผู้ใช้ของโรงเรียน

## ขั้นตอน

กดเพิ่มผู้ใช้ แล้วกรอกอีเมลของครู
`

const HOME = `web:
  home:
    title: "ศูนย์ช่วยเหลือ\\nระบบห้องเรียน"
    hints: [ห้อง, อีเมล]
    journey:
      - { page: teacher.sign-in, label: เข้าระบบ }
      - { page: admin.users }
  groups: { users: { title: { th: บัญชีผู้ใช้, en: Users }, icon: user } }
`

/** The fixture plus an admin book listed before the user guide, with descriptions, audiences and a cover image. */
async function site(home: boolean) {
  const root = await cleanFixture()
  const m = join(root, 'manual')
  const cfg = join(m, 'manual.config.yaml')
  let text = read(cfg).replace(
    '  user-guide: { title: { th: คู่มือผู้ใช้, en: User guide } }',
    `  admin-guide: { title: { th: คู่มือผู้ดูแล, en: Admin guide }${home ? ', audience: ผู้ดูแลระบบ, description: เพิ่มผู้ใช้และตั้งค่าโรงเรียน' : ''} }
  user-guide: { title: { th: คู่มือผู้ใช้, en: User guide }${home ? ', audience: { th: ครูทุกคน, en: Every teacher }, description: เข้าระบบและสร้างห้องเรียน' : ''} }`,
  )
  if (home) text = `${text.replace('  docNumber: DOC-001', '  docNumber: DOC-001\n  developer: บริษัท ตัวอย่าง จำกัด\n  contact: help@example.com\n  coverImage: hero.png')}${HOME}`
  writeFileSync(cfg, text)
  if (home) writeFileSync(join(m, 'hero.png'), solidPng(400, 120))
  for (const lang of ['th', 'en']) {
    mkdirSync(join(m, `pages/${lang}/admin-guide`), { recursive: true })
    writeFileSync(join(m, `pages/${lang}/admin-guide/01-users.md`), lang === 'th' ? ADMIN_PAGE : ADMIN_PAGE.replace('จัดการบัญชีผู้ใช้', 'Manage users'))
  }
  const r = runCli(['build', 'web'], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  return join(m, 'dist/web')
}

async function violations(page: Page) {
  await page.addScriptTag({ content: read(require.resolve('axe-core/axe.min.js')) })
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }
    return (await w.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)
  })
}

describe('web front page', () => {
  it('shows the hero, book cards in config order, the journey and the footer from config', async () => {
    const web = await site(true)
    const html = read(join(web, 'index.html'))
    expect(html).toContain('<h1>ศูนย์ช่วยเหลือ<br>ระบบห้องเรียน</h1>')
    expect(html).toContain('<p class="hero-org">โรงเรียนตัวอย่าง</p><p class="hero-dev">Classroom · บริษัท ตัวอย่าง จำกัด</p>')
    expect(html).toContain('<p class="hero-lede">คู่มือ 2 เล่มสำหรับผู้ใช้แต่ละหน้าที่')
    expect(html).toContain('placeholder="พิมพ์สิ่งที่อยากทำ เช่น ห้อง อีเมล"')
    expect(html).toMatch(/<img class="hero-art" src="assets\/hero.png" alt="" width="400" height="120">/)
    // cards: config order; who it is for, size and clips as facts; a row per group to its first page with its count
    expect([...html.matchAll(/<li class="bcard">[\s\S]*?<h2><a href="([^"]+)">/g)].map((m) => m[1])).toEqual(['admin-guide/th/index.html', 'user-guide/th/index.html'])
    expect(html).toContain('<div><dt>สำหรับ</dt><dd class="who">ครูทุกคน</dd></div>')
    expect(html).toContain('<p class="bcard-blurb">เพิ่มผู้ใช้และตั้งค่าโรงเรียน</p>')
    expect(html).toContain('<ul class="bgroups"><li><a href="admin-guide/th/admin.users.html"><span>บัญชีผู้ใช้</span><small>1 หน้า</small></a></li></ul>')
    expect(html).toContain('<div><dt>เนื้อหา</dt><dd>2 หน้า</dd></div>')
    expect(html).toContain('<p class="book-langs"><a href="user-guide/th/index.html" lang="th" hreflang="th" class="tag">ไทย</a><a href="user-guide/en/index.html"')
    // the journey: who from config or the book's audience, then the label from config or the page title
    expect([...html.matchAll(/<li><a href="([^"]+)"><span class="j-who">([^<]+)<\/span><span class="j-label">([^<]+)<\/span>/g)].map((m) => m.slice(1))).toEqual([
      ['user-guide/th/teacher.sign-in.html', 'ครูทุกคน', 'เข้าระบบ'],
      ['admin-guide/th/admin.users.html', 'ผู้ดูแลระบบ', 'จัดการบัญชีผู้ใช้'],
    ])
    // the footer says when the manual was updated, not its document control (DESIGN.md)
    expect(html).toContain('ติดต่อสอบถาม: help@example.com')
    expect(html).toContain('<p>คู่มือการใช้งานระบบห้องเรียน · โรงเรียนตัวอย่าง · บริษัท ตัวอย่าง จำกัด</p>')
    expect(html).not.toContain('DOC-001')
    // the root search index covers every book of the primary language, with links from the root
    const index = read(join(web, 'search-index.js'))
    expect(index).toContain('"admin-guide/th/admin.users.html"')
    expect(index).toContain('"user-guide/th/teacher.sign-in.html"')
    expect(index).not.toContain('user-guide/en/')

    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(pathToFileURL(join(web, 'index.html')).href)
      // a hint fills the hero search, results come from both books
      await page.locator('.try button[data-hint="อีเมล"]').click()
      expect(await page.locator('#hq').inputValue()).toBe('อีเมล')
      await expect.poll(() => page.locator('#hero-pop li').count()).toBeGreaterThan(0)
      const hrefs = await page.locator('#hero-pop li a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
      expect(hrefs.some((h) => h?.startsWith('admin-guide/th/'))).toBe(true)
      expect(hrefs.some((h) => h?.startsWith('user-guide/th/'))).toBe(true)
      expect(await page.locator('#hero-pop .all').getAttribute('href')).toBe(`search.html?q=${encodeURIComponent('อีเมล')}`)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/(admin|user)-guide\/th\/[\w.-]+\.html/)
      // the root results page searches every book
      await page.goto(`${pathToFileURL(join(web, 'search.html')).href}?q=${encodeURIComponent('อีเมล')}`)
      await expect.poll(() => page.locator('#search-results li').count()).toBeGreaterThan(1)
      expect(errors).toEqual([])
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(pathToFileURL(join(web, 'index.html')).href)
        expect(await violations(page), scheme).toEqual([])
      }
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto(pathToFileURL(join(web, 'index.html')).href)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      expect(await page.locator('#hq').isVisible()).toBe(true)
    } finally {
      await browser.close()
    }
  })

  it('leaves out every part a minimal config has no data for', async () => {
    const web = await site(false)
    const html = read(join(web, 'index.html'))
    expect(html).toContain('<h1>คู่มือการใช้งานระบบห้องเรียน</h1>')
    expect(html).toContain('<p class="hero-dev">Classroom</p>')
    for (const part of ['class="try"', 'img class="hero-art"', 'class="who"', 'bcard-blurb', 'journey-track', 'faq-banner', 'class="videos"', 'help@', 'ไฟล์สำหรับพิมพ์หรือส่งต่อ']) expect(html, part).not.toContain(part)
    // without document.coverImage the hero shows the theme's drawing
    expect(html).toContain('<use href="#a-hero"/>')
    expect(html).toContain('placeholder="พิมพ์สิ่งที่อยากทำ"')
    expect(html.match(/<li class="bcard/g)).toHaveLength(2)
  })

  it('names a journey page that no book has', async () => {
    const root = await cleanFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, `${read(cfg)}web:\n  home:\n    journey: [{ page: nope.page }]\n`)
    const r = runCli(['build', 'web'], root)
    expect(r.code).not.toBe(0)
    expect(r.stderr).toContain('web.home.journey[0]: page "nope.page"')
  })
})
