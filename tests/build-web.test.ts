import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { buildIndex, search, searchCoreScript, tokenize } from '../src/web/search.ts'
import { runCli } from './helpers/cli.ts'
import { PNG_1PX, cleanFixture } from './helpers/fixture.ts'

const read = (f: string) => readFileSync(f, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

async function built(args: string[] = []) {
  const root = await cleanFixture()
  const r = runCli(['build', 'web', ...args], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  return { root, web: join(root, 'manual/dist/web'), r }
}

describe('build without a format', () => {
  it('builds every output enabled in config outputs (pdf, docx, web)', async () => {
    const root = await cleanFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, `${read(cfg)}outputs: { pdf: false, docx: true, web: true }\ndocx: { finalize: none }\n`)
    const r = runCli(['build', '--lang', 'en'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(existsSync(join(root, 'manual/dist/user-guide.en.docx'))).toBe(true)
    expect(existsSync(join(root, 'manual/dist/user-guide.en.pdf'))).toBe(false)
    expect(existsSync(join(root, 'manual/dist/web/user-guide/en/index.html'))).toBe(true)
    // the web build links the DOCX built in the same run
    expect(read(join(root, 'manual/dist/web/user-guide/en/index.html'))).toMatch(/\.docx"/)
  })
})

describe('search core', () => {
  it('splits Thai into words with Intl.Segmenter and finds a section by a Thai word inside a longer run', () => {
    expect(tokenize('กรอกอีเมลแล้วกด Sign In')).toEqual(['กรอก', 'อีเมล', 'แล้ว', 'กด', 'sign', 'in'])
    const index = buildIndex([
      { u: 'a.html', t: 'เข้าสู่ระบบ', c: '1 เข้าสู่ระบบ', x: 'กรอกอีเมลแล้วกดปุ่ม' },
      { u: 'b.html', t: 'สร้างห้องเรียน', c: '2 สร้างห้องเรียน', x: 'ห้องหนึ่งมีนักเรียนได้ 40 คน' },
    ])
    expect(search(index, 'ห้องเรียน', tokenize).map((h) => h.doc)).toEqual([1])
    expect(search(index, 'อีเมล', tokenize).map((h) => h.doc)).toEqual([0])
    expect(search(index, 'นักเรียน 40', tokenize).map((h) => h.doc)).toEqual([1])
    expect(search(index, 'ไม่มีคำนี้', tokenize)).toEqual([])
    // prefix of a word while typing
    expect(search(index, 'นักเ', tokenize).map((h) => h.doc)).toEqual([1])
  })

  it('the browser copy is the same code', () => {
    const w: Record<string, unknown> = {}
    new Function('window', searchCoreScript())(w)
    const core = w.ManualKitSearch as { tokenize: typeof tokenize }
    expect(core.tokenize('สร้างห้องเรียน')).toEqual(tokenize('สร้างห้องเรียน'))
  })
})

describe('build web', () => {
  it('writes a static site per book and language with nav, language switch, search index, fonts and media', async () => {
    const { web, r } = await built()
    expect(r.stdout).toMatch(/^web: wrote \d+ index pages in manual\/dist\/web \(/m)
    for (const f of [
      'index.html',
      'assets/site.css',
      'assets/site.js',
      'assets/brand.css',
      'assets/fonts/IBMPlexSansThai-Regular.ttf',
      'media/th/login.png',
      'media/en/login.png',
      'user-guide/th/index.html',
      'user-guide/th/teacher.sign-in.html',
      'user-guide/th/teacher.create-class.html',
      'user-guide/th/search.html',
      'user-guide/th/search-index.js',
      'user-guide/en/index.html',
      'user-guide/en/teacher.sign-in.html',
    ])
      expect(existsSync(join(web, f)), f).toBe(true)

    const page = read(join(web, 'user-guide/th/teacher.sign-in.html'))
    expect(page).toMatch(/<html lang="th"/)
    expect(page).toContain('<meta name="color-scheme" content="light dark">')
    expect(page).toMatch(/<a class="skip-link" href="#content">/)
    expect(page).toMatch(/<main id="content" tabindex="-1">/)
    expect(page).toMatch(/<nav [^>]*aria-label="สารบัญ"/)
    expect(page).toMatch(/<a [^>]*href="teacher.sign-in.html"[^>]*aria-current="page"/)
    // language twin
    expect(page).toMatch(/<a [^>]*href="..\/en\/teacher.sign-in.html"[^>]*hreflang="en"/)
    // image from the shared media folder, alt from the shot caption, with intrinsic size
    expect(page).toMatch(/<img src="..\/..\/media\/th\/login.png" width="1" height="1" loading="lazy" decoding="async" alt="หน้า เข้าสู่ระบบ">/)
    // [[links]] go to the other page
    expect(page).toContain('href="teacher.create-class.html"')
    expect(page).toContain('กรอก <strong>อีเมล</strong>')
    // previous / next
    expect(page).toMatch(/rel="next" href="teacher.create-class.html"/)

    // the web carries no document control table: that belongs to the PDF and DOCX (DESIGN.md)
    expect(read(join(web, 'user-guide/th/index.html'))).not.toContain('ctl-h')
    const index = read(join(web, 'user-guide/th/search-index.js'))
    expect(index).toContain('"ห้องเรียน"')

    // nothing is loaded from other hosts at runtime
    for (const f of walk(web).filter((f) => /\.(html|css|js)$/.test(f))) expect(read(f), f).not.toMatch(/(src|href)="https?:|url\(['"]?https?:|@import/)
  })

  it('titles a front matter group missing from web.groups readably, not with its raw id', async () => {
    const root = await cleanFixture()
    for (const lang of ['th', 'en']) {
      const f = join(root, `manual/pages/${lang}/user-guide/01-sign-in.md`)
      writeFileSync(f, read(f).replace('kind: how-to', 'kind: how-to\ngroup: getting_started'))
    }
    expect(runCli(['build', 'web'], root).code).toBe(0)
    const html = read(join(root, 'manual/dist/web/user-guide/en/index.html'))
    const titles = [...html.matchAll(/<details class="group"[^>]*><summary>.*?<span>(.*?)<\/span>/g)].map((m) => m[1])
    expect(titles).toEqual(['Getting started', 'How-to guides'])
  })

  it('links the PDF/DOCX of the same book when they were built, and --base sets canonical URLs', async () => {
    const root = await cleanFixture()
    const dist = join(root, 'manual/dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'user-guide.th.pdf'), '%PDF-1.4 fake')
    const r = runCli(['build', 'web', '--base', 'https://docs.example.com/manual/'], root)
    expect(r.code).toBe(0)
    const home = read(join(dist, 'web/user-guide/th/index.html'))
    expect(home).toMatch(/href="user-guide.th.pdf" download/)
    expect(home).not.toContain('user-guide.th.docx')
    expect(existsSync(join(dist, 'web/user-guide/th/user-guide.th.pdf'))).toBe(true)
    expect(home).toContain('<link rel="canonical" href="https://docs.example.com/manual/user-guide/th/index.html">')
  })

  it('shows step images as an ordered gallery when media is steps', async () => {
    const root = await cleanFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('media: screenshots', 'media: steps'))
    for (const n of [1, 2]) writeFileSync(join(root, `manual/media/th/create-class-${n}.png`), PNG_1PX)
    expect(runCli(['build', 'web', '--lang', 'th'], root).code).toBe(0)
    const page = read(join(root, 'manual/dist/web/user-guide/th/teacher.create-class.html'))
    expect(page).toMatch(/<ol class="steps">\s*<li class="step" id="step-create-class-1">/)
    expect(page).toMatch(/<img src="..\/..\/media\/th\/create-class-2.png" [^>]*alt="พิมพ์ชื่อห้องเรียน แล้วกด บันทึก"/)
    expect(page).toContain('<strong>สร้างห้องเรียน</strong>')
  })

  it('works in a browser: Thai search, no horizontal scroll at 390px, no outside requests', async () => {
    const { web } = await built()
    const browser = await chromium.launch()
    try {
      const outside: string[] = []
      const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
      ctx.on('request', (req) => {
        if (!req.url().startsWith('file:')) outside.push(req.url())
      })
      const page = await ctx.newPage()
      await page.goto(`${pathToFileURL(join(web, 'user-guide/th/search.html')).href}?q=${encodeURIComponent('ห้องเรียน')}`)
      await page.waitForSelector('#search-results li')
      const results = await page.locator('#search-results li a').allTextContents()
      expect(results.join('|')).toContain('สร้างห้องเรียน')
      expect(await page.locator('#search-status').textContent()).toMatch(/\d/)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      // results follow the typing (short debounce), no Enter needed; the URL keeps the query
      await page.goto(pathToFileURL(join(web, 'user-guide/th/search.html')).href)
      // on a phone the search box opens from the magnifier button in the top bar
      expect(await page.locator('#q').isVisible()).toBe(false)
      await page.locator('.search-open').click()
      await page.locator('#q').pressSequentially('อีเมล', { delay: 20 })
      await page.waitForSelector('#search-results li')
      expect((await page.locator('#search-results li').allTextContents()).join('|')).toContain('เข้าสู่ระบบ')
      expect(page.url()).toContain(`q=${encodeURIComponent('อีเมล')}`)
      await page.locator('#q').fill('')
      await expect.poll(() => page.locator('#search-results li').count()).toBe(0)
      // the contents button opens the nav on a phone
      await page.goto(pathToFileURL(join(web, 'user-guide/th/teacher.sign-in.html')).href)
      const toggle = page.locator('.nav-toggle')
      await expect.poll(() => toggle.getAttribute('aria-expanded')).toBe('false')
      await toggle.click()
      expect(await toggle.getAttribute('aria-expanded')).toBe('true')
      expect(await page.locator('#site-nav').isVisible()).toBe(true)
      expect(outside).toEqual([])
      // automated accessibility check (axe-core, WCAG 2.2 A/AA + best practice) on every kind of page, light and dark
      const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        for (const f of ['index.html', 'teacher.sign-in.html', 'search.html?q=%E0%B8%AB%E0%B9%89%E0%B8%AD%E0%B8%87']) {
          await page.goto(`${pathToFileURL(join(web, 'user-guide/th', f.split('?')[0]!)).href}${f.includes('?') ? `?${f.split('?')[1]}` : ''}`)
          await page.addScriptTag({ content: axe })
          const violations = await page.evaluate(async () => {
            const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string }[] }> } }
            return (await w.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => v.id)
          })
          expect(violations, `${scheme} ${f}`).toEqual([])
        }
      }
    } finally {
      await browser.close()
    }
  })
})
