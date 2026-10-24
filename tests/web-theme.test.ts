// The default web theme: brand top bar, book sidebar with audience filter and groups, page header, "on this page",
// callouts, step walkthrough with zoom, clip player. Checked in Chromium at desktop and phone width, with axe.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'
import { PNG_1PX, cleanFixture, solidPng } from './helpers/fixture.ts'

const require = createRequire(import.meta.url)
const read = (f: string) => readFileSync(f, 'utf8')

const CLIP = `
clips:
  new-class-video:
    url: /classes.html
    caption: { th: "สร้างห้องเรียนใหม่", en: "Create a class" }
    segments:
      - { caption: { th: "กดปุ่มสร้าง", en: "Press create" } }
`

async function themed() {
  const root = await cleanFixture()
  const m = join(root, 'manual')
  const cfg = join(m, 'manual.config.yaml')
  writeFileSync(
    cfg,
    `${read(cfg).replace('media: screenshots', 'media: steps+video')}web:
  brand: { name: { th: ห้องเรียนออนไลน์, en: Online Class }, logo: logo.png, colors: { brand: "#123a6b", accent: "#e8890c" } }
  backLink: { label: { th: กลับหน้าระบบ, en: Back to the app }, url: "https://app.example.com/" }
  audiences: { teacher: { th: ครู, en: Teacher }, admin: { th: แอดมิน, en: Admin } }
  groups: { classes: { title: { th: ห้องเรียน, en: Classes }, icon: user } }
`,
  )
  writeFileSync(join(m, 'logo.png'), PNG_1PX)
  appendFileSync(join(m, 'shots.yaml'), CLIP)
  for (const lang of ['th', 'en']) {
    const page = join(m, `pages/${lang}/user-guide/02-create-class.md`)
    const tip = lang === 'th' ? '> [!TIP]\n> ตั้งชื่อห้องให้ตรงกับชั้นเรียน' : '> [!TIP]\n> Name the class after the grade'
    writeFileSync(
      page,
      read(page)
        .replace('audience: [teacher]', `audience: [teacher, admin]\ngroup: classes\nsummary: ${lang === 'th' ? 'สร้างห้องใหม่ในหนึ่งนาที' : 'A new class in a minute'}\ninfo: { ${lang === 'th' ? 'ใช้เวลา' : 'Time'}: "1 min" }`)
        .replace(/\n## (ข้อควรทราบ|Good to know)/, `\n${tip}\n\n{{clip:new-class-video}}\n\n## $1`),
    )
    for (const n of [1, 2]) writeFileSync(join(m, `media/${lang}/create-class-${n}.png`), solidPng(320, 200))
    writeFileSync(join(m, `media/${lang}/new-class-video.poster.png`), solidPng(320, 180))
    writeFileSync(join(m, `media/${lang}/new-class-video.mp4`), Buffer.alloc(16))
    writeFileSync(join(m, `media/${lang}/new-class-video.vtt`), 'WEBVTT\n')
  }
  const r = runCli(['build', 'web'], root)
  expect(r.stderr).toBe('')
  expect(r.code).toBe(0)
  return join(m, 'dist/web')
}

const axe = () => readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
async function violations(page: Page) {
  await page.addScriptTag({ content: axe() })
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }
    return (await w.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)
  })
}

describe('web theme', () => {
  it('desktop: brand bar, book sidebar, audience filter, page header, on this page, callout, walkthrough zoom, clip player, live search', async () => {
    const web = await themed()
    const file = join(web, 'user-guide/th/teacher.create-class.html')
    const html = read(file)
    // the brand tokens are worked out at build time into assets/brand.css (src/web/brand.ts)
    expect(html).toContain('<link rel="stylesheet" href="../../assets/brand.css">')
    expect(read(join(web, 'assets/brand.css'))).toContain(':root { --brand: #123a6b;')
    expect(html).toMatch(/<a class="top-btn back" href="https:\/\/app.example.com\/"/)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(pathToFileURL(file).href)
      // top bar
      expect(await page.locator('.brand').textContent()).toBe('ห้องเรียนออนไลน์')
      expect(await page.locator('.brand img').getAttribute('src')).toBe('../../assets/brand-logo.png')
      // the page head carries the brand colour, the top bar a deeper shade of it
      expect(await page.locator('.head').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(18, 58, 107)')
      expect(await page.locator('.top').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgb(18, 58, 107)')
      expect((await page.locator('.book-pill').textContent())?.trim()).toBe('คู่มือผู้ใช้')
      // sidebar: the book, chips with counts, groups, current page
      expect(await page.locator('.reading strong').textContent()).toBe('คู่มือผู้ใช้')
      expect(await page.locator('.chip').allTextContents()).toEqual(['ดูทุกงาน 2', 'ครู 2', 'แอดมิน 1'])
      expect(await page.locator('.group summary span').allTextContents()).toEqual(['วิธีใช้งาน', 'ห้องเรียน'])
      expect(await page.locator('.group a[aria-current="page"]').textContent()).toBe('สร้างห้องเรียน')
      await page.locator('.chip', { hasText: 'แอดมิน' }).click()
      expect(await page.locator('.group li:visible').count()).toBe(1)
      await page.locator('.chip', { hasText: 'ดูทุกงาน' }).click()
      expect(await page.locator('.group li:visible').count()).toBe(2)
      // page header
      expect(await page.locator('.crumbs li').allTextContents()).toEqual(['คู่มือผู้ใช้', 'ห้องเรียน', 'สร้างห้องเรียน'])
      expect(await page.locator('.summary').textContent()).toBe('สร้างห้องใหม่ในหนึ่งนาที')
      expect(await page.locator('.head .kind').textContent()).toBe('วิธีทำ')
      expect(await page.locator('[data-print]').isVisible()).toBe(true)
      // task facts: who it is for, then the page's info
      expect(await page.locator('.facts dt').allTextContents()).toEqual(['สำหรับ', 'ใช้เวลา'])
      expect(await page.locator('.facts dd.who').textContent()).toBe('ครู แอดมิน')
      // on this page
      expect(await page.locator('.toc a').count()).toBe(5)
      await page.locator('#sec-2-4').scrollIntoViewIfNeeded()
      await expect.poll(() => page.locator('.toc a.is-active').textContent()).toMatch(/ปัญหาที่อาจพบและวิธีแก้ไข|ข้อควรทราบ/)
      // callout
      expect(await page.locator('.callout--tip .callout-title').textContent()).toBe('เคล็ดลับ')
      // walkthrough: numbered steps, enlarge with previous / next and arrow keys
      expect(await page.locator('.walk .step-n').allTextContents()).toEqual(['1', '2'])
      await page.locator('.walk .zoom').first().click()
      const dlg = page.locator('dialog.lightbox')
      await expect.poll(() => dlg.isVisible()).toBe(true)
      expect(await dlg.locator('.lightbox-nav span').textContent()).toBe('1 / 2')
      await page.keyboard.press('ArrowRight')
      expect(await dlg.locator('.lightbox-nav span').textContent()).toBe('2 / 2')
      await page.keyboard.press('Escape')
      await expect.poll(() => dlg.isVisible()).toBe(false)
      // clip: cover with play button, music on/off, captions, transcript
      const clip = page.locator('figure[data-clip]')
      expect(await clip.locator('.clip-cover').isVisible()).toBe(true)
      // captions are burned into the picture: the text track is there but off, so they never show twice
      expect(await clip.locator('track').getAttribute('default')).toBeNull()
      expect(await clip.locator('[data-cc]').getAttribute('aria-pressed')).toBe('false')
      expect(await clip.locator('video').evaluate((v: HTMLVideoElement) => [...v.textTracks].map((t) => t.mode))).not.toContain('showing')
      await clip.locator('[data-cc]').click()
      expect(await clip.locator('[data-cc]').getAttribute('aria-pressed')).toBe('true')
      expect(await clip.locator('video').evaluate((v: HTMLVideoElement) => [...v.textTracks].map((t) => t.mode))).toEqual(['showing'])
      await clip.locator('[data-music]').click()
      expect(await clip.locator('[data-music]').getAttribute('aria-pressed')).toBe('false')
      expect(await clip.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true)
      await clip.locator('.clip-cover').click()
      expect(await clip.getAttribute('class')).toContain('is-playing')
      expect(await clip.locator('details.transcript summary').textContent()).toBe('ข้อความในคลิป')
      // live search under the top bar box: Ctrl+K, type, arrow, Enter
      await page.keyboard.press('Control+k')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('q')
      await page.keyboard.type('อีเมล', { delay: 20 })
      await expect.poll(() => page.locator('#search-pop li').count()).toBeGreaterThan(0)
      expect(await page.locator('#search-pop .all').getAttribute('href')).toBe(`search.html?q=${encodeURIComponent('อีเมล')}`)
      await page.keyboard.press('Enter')
      await page.waitForURL(/teacher\.sign-in\.html/)
      expect(errors).toEqual([])
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        for (const f of ['teacher.create-class.html', 'index.html']) {
          await page.goto(pathToFileURL(join(web, 'user-guide/th', f)).href)
          expect(await violations(page), `${scheme} ${f}`).toEqual([])
        }
      }
    } finally {
      await browser.close()
    }
  })

  it('phone (390px): menu opens the sidebar as a drawer, search behind an icon, nothing scrolls sideways', async () => {
    const web = await themed()
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
      await page.goto(pathToFileURL(join(web, 'user-guide/en/teacher.create-class.html')).href)
      expect(await page.locator('#site-nav').isVisible()).toBe(false)
      expect(await page.locator('.toc').isVisible()).toBe(false)
      expect(await page.locator('.toc-inline').isVisible()).toBe(true)
      await page.locator('.nav-toggle').click()
      await expect.poll(() => page.locator('#site-nav').isVisible()).toBe(true)
      expect(await page.locator('.scrim').isVisible()).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => page.locator('.nav-toggle').getAttribute('aria-expanded')).toBe('false')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(await violations(page)).toEqual([])
    } finally {
      await browser.close()
    }
  })
})
