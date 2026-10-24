// Help-center defaults of `build web`: FAQ page from every page's common problems, video gallery, task cards.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import { markdownToHtml } from '../src/render.ts'
import { clipsIn, firstShot, isProblemHeading, problemsIn, symptomType } from '../src/web/helpcenter.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, solidPng } from './helpers/fixture.ts'

const require = createRequire(import.meta.url)
const read = (f: string) => readFileSync(f, 'utf8')
const html = (md: string) => markdownToHtml(md, 1).html

const PROBLEMS_TH = `## ปัญหาที่พบบ่อย

- **ระบบแจ้งว่า กรุณาระบุชื่อห้อง** กรอกชื่อห้องก่อนกดบันทึก
- **ไม่เห็นปุ่ม สร้างห้อง**: บัญชีของคุณยังไม่มีสิทธิ์ครู

**ค้นหาห้องเรียนไม่เจอ** ห้องที่ปิดแล้วไม่อยู่ในรายการ

| สิ่งที่เห็น | สาเหตุ | วิธีแก้ |
|---|---|---|
| \`Session expired\` | ไม่ได้ใช้งานนาน | เข้าสู่ระบบใหม่ |
| หน้าจอค้าง | เน็ตช้า | รอสักครู่ |
`

describe('common problems', () => {
  it('reads bold-symptom items and 3-column table rows under the heading, in page order, and nothing elsewhere', () => {
    const page = `## ขั้นตอน\n\n**ไม่ใช่ปัญหา** ข้อความในขั้นตอน\n\n${PROBLEMS_TH}\n## หน้าที่เกี่ยวข้อง\n\n**ไม่ใช่ปัญหา** อีกข้อ\n`
    const got = problemsIn(html(page))
    expect(got.map((p) => p.symptom)).toEqual(['ระบบแจ้งว่า กรุณาระบุชื่อห้อง', 'ไม่เห็นปุ่ม สร้างห้อง', 'ค้นหาห้องเรียนไม่เจอ', '<code>Session expired</code>', 'หน้าจอค้าง'])
    expect(got[1]).toEqual({ symptom: 'ไม่เห็นปุ่ม สร้างห้อง', fix: 'บัญชีของคุณยังไม่มีสิทธิ์ครู', anchor: 'sec-1-2' })
    expect(got[3]).toMatchObject({ cause: 'ไม่ได้ใช้งานนาน', fix: 'เข้าสู่ระบบใหม่' })
    expect(problemsIn(html('## Common problems\n\n- **Save is greyed out** fill in the name first\n'))).toEqual([{ symptom: 'Save is greyed out', fix: 'fill in the name first', anchor: 'sec-1-1' }])
    // a page without problems, or one saying there are none, gives nothing; the problems page itself gives all its tables
    expect(problemsIn(html('## ปัญหาที่พบบ่อย\n\nไม่มีปัญหาที่พบบ่อย\n'))).toEqual([])
    expect(problemsIn(html('## ติดตั้ง\n\n| อาการ | สาเหตุ | วิธีแก้ |\n|---|---|---|\n| ช้า | ติดตั้งครั้งแรก | รอ |\n'), true)).toHaveLength(1)
  })

  it('reads the template\'s "ปัญหา: / วิธีแก้ไข:" pairs under the new heading, labels plain or bold, in both languages', () => {
    const th = [
      '## ปัญหาที่อาจพบและวิธีแก้ไข',
      '',
      '- ปัญหา: “กรุณาเพิ่มหนังสือหลัก”',
      '  วิธีแก้ไข: แนบไฟล์หนังสือหลัก แล้วคลิกปุ่ม “บันทึก” อีกครั้ง',
      '- **ปัญหา:** "ไม่พบเลขที่หนังสือ"',
      '  **วิธีแก้ไข:** ตรวจเลขที่หนังสือ',
      '- ปัญหา: ยังไม่มีวิธีแก้',
      '',
      '## คำถามที่เกี่ยวข้อง',
      '',
      '- ปัญหา: “ไม่ใช่ปัญหา”',
      '  วิธีแก้ไข: อยู่นอกหัวข้อ',
    ].join('\n')
    expect(problemsIn(html(th))).toEqual([
      { symptom: '“กรุณาเพิ่มหนังสือหลัก”', fix: 'แนบไฟล์หนังสือหลัก แล้วคลิกปุ่ม “บันทึก” อีกครั้ง', anchor: 'sec-1-1' },
      { symptom: '&quot;ไม่พบเลขที่หนังสือ&quot;', fix: 'ตรวจเลขที่หนังสือ', anchor: 'sec-1-1' },
    ])
    expect(problemsIn(html('## Problems and fixes\n\nProblem: "Please add the main document"\nFix: attach it, then click “Save”.\n'))).toEqual([
      { symptom: '&quot;Please add the main document&quot;', fix: 'attach it, then click “Save”.', anchor: 'sec-1-1' },
    ])
    // a quoted message is a message
    expect(symptomType('“กรุณาเพิ่มหนังสือหลัก”')).toBe('message')
    expect(symptomType('&quot;Please add the main document&quot;')).toBe('message')
  })

  it('knows both problems headings, new and old, in both languages', () => {
    for (const h of ['ปัญหาที่อาจพบและวิธีแก้ไข', 'Problems and fixes', 'ปัญหาที่พบบ่อย', 'Common problems', '<span>problems AND fixes</span>']) expect(isProblemHeading(h)).toBe(true)
    expect(isProblemHeading('ข้อควรทราบ')).toBe(false)
  })

  it('classifies symptoms by Thai and English keywords, first match wins', () => {
    expect(symptomType('ระบบแจ้งว่า ไม่พบเล่มทะเบียน')).toBe('message')
    expect(symptomType('<code>ffmpeg not found</code>')).toBe('message')
    expect(symptomType('The app says the session expired')).toBe('message')
    expect(symptomType('ไม่เห็นปุ่มตอบกลับ')).toBe('missing')
    expect(symptomType('<code>/manual</code> ไม่ขึ้น')).toBe('missing')
    expect(symptomType("I can't see the Save button")).toBe('missing')
    expect(symptomType('หาหนังสือที่ส่งไปไม่เจอ')).toBe('notfound')
    expect(symptomType('Search shows no results')).toBe('notfound')
    expect(symptomType('ใช้ครั้งแรกช้า')).toBe('other')
  })

  it('reads clips and the first screenshot from rendered pages', () => {
    const fig = `<figure data-clip="demo" class="figure clip" id="fig-1-1"><div class="clip-frame"><video><source src="../../media/th/demo.mp4" type="video/mp4"><track kind="captions" src="../../media/th/demo.vtt"></video><button type="button" class="clip-cover" aria-label="เล่นคลิป: แนะนำ"><img src="../../media/th/demo.poster.png" alt=""><span class="len">1:30</span></button></div></figure>`
    expect(clipsIn(`<p>x</p>${fig}`)).toEqual([{ id: 'demo', title: 'แนะนำ', thumb: '../../media/th/demo.poster.png', video: '../../media/th/demo.mp4', vtt: '../../media/th/demo.vtt', len: '1:30' }])
    expect(firstShot(`${fig}<figure class="figure" id="fig-1-2"><img src="../../media/th/a.png"></figure>`)).toBe('../../media/th/a.png')
    expect(firstShot(fig)).toBeUndefined()
  })
})

describe('help center in build web', () => {
  it('the hidden attribute beats any display rule in the theme', () => {
    expect(read(new URL('../assets/web/site.css', import.meta.url).pathname)).toMatch(/\[hidden\] \{ display: none !important; \}/)
  })

  it('builds a FAQ page, gallery and task cards that work in a browser', async () => {
    const root = await cleanFixture()
    const m = join(root, 'manual')
    const cfg = join(m, 'manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('media: screenshots', 'media: steps+video'))
    appendFileSync(join(m, 'shots.yaml'), `\nclips:\n  new-class-video:\n    url: /classes.html\n    caption: { th: "สร้างห้องเรียนใหม่", en: "Create a class" }\n    segments:\n      - { caption: { th: "กดปุ่มสร้าง", en: "Press create" } }\n`)
    const th = join(m, 'pages/th/user-guide/02-create-class.md')
    // the old "ปัญหาที่พบบ่อย" heading still feeds the FAQ
    writeFileSync(th, read(th).replace('## ปัญหาที่อาจพบและวิธีแก้ไข\n\nไม่มีปัญหาที่พบบ่อย\n', PROBLEMS_TH).replace('## ข้อควรทราบ', '{{clip:new-class-video}}\n\n## ข้อควรทราบ'))
    for (const lang of ['th', 'en']) {
      for (const n of [1, 2]) writeFileSync(join(m, `media/${lang}/create-class-${n}.png`), solidPng(320, 200))
      // a ready-made clip has no silent loop: the poster is the thumbnail
      writeFileSync(join(m, `media/${lang}/new-class-video.poster.png`), solidPng(320, 180))
      writeFileSync(join(m, `media/${lang}/new-class-video.mp4`), Buffer.alloc(16))
      writeFileSync(join(m, `media/${lang}/new-class-video.vtt`), 'WEBVTT\n')
    }
    const r = runCli(['build', 'web'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const web = join(m, 'dist/web')
    const home = read(join(web, 'user-guide/th/index.html'))
    expect(home).toMatch(/<a class="faq-banner" href="faq.html"><span class="fb-count">5<\/span>/)
    expect(home).toMatch(/<a class="tcard" href="teacher.create-class.html"><span class="tthumb"><img src="..\/..\/media\/th\/create-class-1.png"/)
    expect(home).toMatch(/<button type="button" class="vthumb" data-video="..\/..\/media\/th\/new-class-video.mp4" [^>]*data-href="teacher.create-class.html"[^>]*><img src="..\/..\/media\/th\/new-class-video.poster.png"/)
    expect(home).toContain('<a class="vtitle" href="teacher.create-class.html">สร้างห้องเรียนใหม่</a>')
    const rootHtml = read(join(web, 'index.html'))
    expect(rootHtml).toContain('<a class="faq-banner" href="user-guide/th/faq.html">')
    expect(rootHtml).toMatch(/data-video="media\/th\/new-class-video.mp4"[^>]*data-href="user-guide\/th\/teacher.create-class.html"/)
    expect(read(join(web, 'user-guide/th/teacher.sign-in.html'))).toMatch(/<a class="top-btn top-btn--ghost top-faq" href="faq.html">/)
    // English pages have no problems: no FAQ page or link there, and the language switch on the FAQ goes home
    expect(read(join(web, 'user-guide/en/index.html'))).not.toContain('faq')
    expect(read(join(web, 'user-guide/th/faq.html'))).toContain('href="../en/index.html"')
    expect(read(join(web, 'user-guide/th/search-index.js'))).toContain('"faq.html#faq-1"')

    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      const faq = pathToFileURL(join(web, 'user-guide/th/faq.html')).href
      await page.goto(faq)
      const shown = () => page.locator('.faq-card:visible').count()
      expect(await shown()).toBe(5)
      expect(await page.locator('.faq-types .chip').allTextContents()).toEqual(['ทุกอาการ', 'ข้อความแจ้งเตือน 2', 'ไม่เห็นปุ่มหรือเมนู 1', 'หาหนังสือหรือข้อมูลไม่เจอ 1', 'อื่น ๆ 1'])
      expect(await page.locator('.faq-a').first().isVisible()).toBe(false)
      // text search filters the cards and never drives the top bar search
      await page.locator('#faq-q').pressSequentially('ห้อง', { delay: 10 })
      await expect.poll(shown).toBe(3)
      expect(await page.locator('.faq-count').textContent()).toBe('3 ปัญหา')
      expect(await page.locator('#search-pop').isVisible()).toBe(false)
      await page.locator('#faq-q').fill('ไม่มีคำนี้')
      await expect.poll(shown).toBe(0)
      expect(await page.locator('.faq-empty').isVisible()).toBe(true)
      await page.locator('#faq-q').fill('')
      await page.locator('.faq-types .chip[data-type="message"]').click()
      await expect.poll(shown).toBe(2)
      await page.locator('.faq-book[data-book="user-guide"]').click()
      await expect.poll(shown).toBe(2)
      // a card opens with the cause, fix and a link to the page's section
      const card = page.locator('#faq-4')
      await page.locator('.faq-types .chip[data-type=""]').click()
      await card.locator('.faq-toggle').click()
      expect(await card.locator('.faq-a').textContent()).toContain('สาเหตุ ไม่ได้ใช้งานนาน')
      expect(await card.getAttribute('class')).toContain('open')
      expect(await card.locator('.faq-src').getAttribute('href')).toMatch(/^teacher.create-class.html#sec-2-\d$/)
      expect(await card.locator('.faq-toggle').textContent()).toBe('ซ่อนวิธีแก้')
      // a deep link opens its card even when a filter hid it; an empty hash is fine
      await page.locator('.faq-types .chip[data-type="other"]').click()
      await page.goto(`${faq}#faq-1`)
      await expect.poll(() => page.locator('#faq-1 .faq-a').isVisible()).toBe(true)
      await page.goto(`${faq}#`)
      // axe on the FAQ page
      await page.addScriptTag({ content: read(require.resolve('axe-core/axe.min.js')) })
      const violations = await page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (d: Document, o: unknown) => Promise<{ violations: { id: string }[] }> } }
        return (await w.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => v.id)
      })
      expect(violations).toEqual([])

      // gallery: the thumbnail plays in a dialog with captions and a link to the steps; the title opens the page
      await page.goto(pathToFileURL(join(web, 'user-guide/th/index.html')).href)
      await page.locator('.vthumb').click()
      const dialog = page.locator('dialog.vplayer')
      expect(await dialog.evaluate((d: HTMLDialogElement) => d.open)).toBe(true)
      expect(await dialog.locator('video track').getAttribute('src')).toBe('../../media/th/new-class-video.vtt')
      expect(await dialog.locator('[data-steps]').textContent()).toBe('อ่านวิธีทำทีละขั้น ›')
      await dialog.locator('[data-steps]').click()
      await expect.poll(() => page.url()).toMatch(/user-guide\/th\/teacher.create-class.html$/)
      await page.goto(pathToFileURL(join(web, 'index.html')).href)
      await page.locator('.vtitle').click()
      await expect.poll(() => page.url()).toMatch(/user-guide\/th\/teacher.create-class.html$/)
      expect(errors).toEqual([])
    } finally {
      await browser.close()
    }
  })
})
