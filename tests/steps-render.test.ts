import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.ts'
import { ConfigSchema } from '../src/config.ts'
import { openProject } from '../src/project.ts'
import { markdownToHtml, renderBook, type Target } from '../src/render.ts'
import { StepsSpec, loadShots, specHash } from '../src/shots.ts'
import { methodCards } from '../src/web/methods.ts'
import { runCli } from './helpers/cli.ts'
import { PNG_1PX, cleanFixture } from './helpers/fixture.ts'

const read = (f: string) => readFileSync(f, 'utf8')

/** The fixture with the create-class steps given sub-bullets (a {{ui:}} token in one) and step images on disk. */
async function stepsFixture() {
  const root = await cleanFixture()
  const m = join(root, 'manual')
  const cfg = join(m, 'manual.config.yaml')
  writeFileSync(cfg, read(cfg).replace('media: screenshots', 'media: steps'))
  const shots = join(m, 'shots.yaml')
  writeFileSync(
    shots,
    read(shots).replace(
      '        actions: [{ click: "#new-class" }',
      '        details:\n          - { th: "{{ui:class.name}} (จำเป็นต้องระบุ)", en: "{{ui:class.name}} (required)" }\n          - { th: "คำอธิบาย (ถ้ามี)", en: "Description (optional)" }\n        actions: [{ click: "#new-class" }',
    ),
  )
  for (const lang of ['th', 'en']) for (const n of [1, 2]) writeFileSync(join(m, `media/${lang}/create-class-${n}.png`), PNG_1PX)
  return root
}

async function chapter(root: string, target: Target, lang = 'th') {
  const project = await openProject(join(root, 'manual'))
  return renderBook(project, { lang, book: 'user-guide', target })
}

describe('steps render as the page\'s own numbered steps', () => {
  it('web: number, text, sub-bullets, then the screenshot, with no widget head', async () => {
    const root = await stepsFixture()
    const md = (await chapter(root, 'web')).chapters[1]!.markdown
    expect(md).not.toMatch(/walk-head|walk-kicker|ทำตามทีละขั้น/)
    const step2 = /<li class="step" id="step-create-class-2">([\s\S]*?)<\/li>\n/.exec(md)![1]!
    expect(step2).toMatch(
      /^<p class="step-text"><span class="step-n" aria-hidden="true">2<\/span><span>พิมพ์<strong>ชื่อห้องเรียน<\/strong> แล้วกด <strong>บันทึก<\/strong><\/span><\/p><ul class="step-details"><li><strong>ชื่อห้องเรียน<\/strong> \(จำเป็นต้องระบุ\)<\/li><li>คำอธิบาย \(ถ้ามี\)<\/li><\/ul><figure class="figure step" id="fig-2-2"><img src="media\/th\/create-class-2.png"/,
    )
  })

  it('PDF HTML: each step a numbered item holding its sub-bullets and its numbered figure', async () => {
    const root = await stepsFixture()
    const book = await chapter(root, 'html')
    const html = markdownToHtml(book.chapters[1]!.markdown, 2).html
    expect(html).toMatch(/<li>\s*<p>พิมพ์<strong>ชื่อห้องเรียน<\/strong> แล้วกด <strong>บันทึก<\/strong><\/p>\s*<ul>\s*<li><strong>ชื่อห้องเรียน<\/strong> \(จำเป็นต้องระบุ\)<\/li>\s*<li>คำอธิบาย \(ถ้ามี\)<\/li>\s*<\/ul>\s*<figure class="figure step" id="fig-2-2"><img [^>]*><figcaption>ภาพที่ 2-2 พิมพ์ชื่อห้องเรียน แล้วกด บันทึก<\/figcaption><\/figure>\s*<\/li>/)
    expect(book.figures.map((f) => f.label)).toEqual(['ภาพที่ 1-1', 'ภาพที่ 2-1', 'ภาพที่ 2-2'])
  })

  it('DOCX (pandoc): the sub-bullets and the figure sit inside the step item', async () => {
    const root = await stepsFixture()
    const md = (await chapter(root, 'pandoc', 'en')).chapters[1]!.markdown
    expect(md).toContain('2. Type the **Class name** and press **Save**\n\n   - **Class name** (required)\n   - Description (optional)\n\n   ![Figure 2-2 Type the Class name and press Save](media/en/create-class-2.png){#fig-2-2')
    const native = execFileSync('pandoc', ['-f', 'markdown', '-t', 'native'], { input: md }).toString()
    // one ordered list of two items; the bullet list is inside it
    expect([...native.matchAll(/OrderedList/g)]).toHaveLength(1)
    expect(native.indexOf('BulletList')).toBeGreaterThan(native.indexOf('OrderedList'))
  })

  it('outline: plain Markdown items with sub-bullets and images', async () => {
    const root = await stepsFixture()
    const md = (await chapter(root, 'outline', 'en')).chapters[1]!.markdown
    expect(md).toContain('2) Type the **Class name** and press **Save**\n\n   - **Class name** (required)\n   - Description (optional)\n\n   ![Figure 2-2')
  })

  it('without step images the steps stay a tight list with their sub-bullets', async () => {
    const root = await stepsFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('media: steps', 'media: screenshots'))
    const md = (await chapter(root, 'html', 'en')).chapters[1]!.markdown
    expect(md).toContain('1. Press **Create class**\n2. Type the **Class name** and press **Save**\n   - **Class name** (required)\n   - Description (optional)')
  })

  it('a tenth step keeps its sub-bullets and figure (content lines up with "10. ")', async () => {
    const root = await stepsFixture()
    const shots = join(root, 'manual/shots.yaml')
    const doc = YAML.parse(read(shots)) as { steps: Record<string, { steps: unknown[] }> }
    doc.steps['create-class']!.steps = Array.from({ length: 10 }, (_, i) => ({ text: `Step ${i + 1}`, details: ['Field'], highlight: '#x' }))
    writeFileSync(shots, YAML.stringify(doc))
    for (let n = 1; n <= 10; n++) writeFileSync(join(root, `manual/media/en/create-class-${n}.png`), PNG_1PX)
    const md = (await chapter(root, 'html', 'en')).chapters[1]!.markdown
    const html = markdownToHtml(md, 2).html
    expect(html).toMatch(/<li>\s*<p>Step 10<\/p>\s*<ul>\s*<li>Field<\/li>\s*<\/ul>\s*<figure class="figure step" id="fig-2-10">/)
  })
})

describe('step spec fields', () => {
  it('details and highlight: false leave the spec hash as it was', () => {
    const base = { url: '/c', steps: [{ text: { th: 'กด', en: 'Press' }, highlight: '#n' }, { text: 'Type', actions: [{ click: '#n' }] }] }
    // the hash this spec had before details existed: an upgrade recaptures nothing
    expect(specHash(StepsSpec.parse(base))).toBe('bc38d0e7b94c5ab6')
    const withDetails = { ...base, steps: [{ ...base.steps[0], details: ['a', { th: 'ข', en: 'b' }] }, { ...base.steps[1], highlight: false }] }
    expect(specHash(StepsSpec.parse(withDetails))).toBe('bc38d0e7b94c5ab6')
    // what the image shows still counts
    expect(specHash(StepsSpec.parse({ ...base, steps: [base.steps[0], { ...base.steps[1], highlight: '#m' }] }))).not.toBe('bc38d0e7b94c5ab6')
  })

  it('capture --changed does not recapture a steps spec for new details', async () => {
    const root = await stepsFixture()
    const { captureJobs } = await import('../src/capture.ts')
    const project = await openProject(join(root, 'manual'))
    const shots = loadShots(project.manualDir)
    const manifest = Object.fromEntries(['th', 'en'].flatMap((l) => [[`${l}/shot/login`, specHash(shots.shots.login!)]]))
    // the manifest as written before details were added
    const before = StepsSpec.parse({ ...shots.steps['create-class']!, steps: shots.steps['create-class']!.steps.map(({ details: _d, ...s }) => s) })
    for (const l of ['th', 'en']) manifest[`${l}/steps/create-class`] = specHash(before)
    expect(captureJobs(project, shots, manifest).filter((j) => j.reason !== 'forced')).toEqual([])
  })

  it('check warns about a step without highlight, not about highlight: false, and checks UI labels in details', async () => {
    const root = await stepsFixture()
    const shots = join(root, 'manual/shots.yaml')
    appendFileSync(
      shots,
      `  extra:\n    url: /classes.html\n    steps:\n      - text: Open it\n      - text: The system shows the list\n        highlight: false\n        details: ["{{ui:class.nope}}"]\n`,
    )
    const r = runCheck(await openProject(join(root, 'manual')))
    const msgs = r.findings.map((f) => `${f.severity} ${f.message}`)
    expect(msgs).toContain('warning steps "extra" step 1 has no highlight: the reader needs the red frame on the control to act on (highlight: <selector>, or highlight: false for a step that only shows the system\'s response)')
    expect(msgs.filter((m) => m.includes('has no highlight'))).toHaveLength(1)
    expect(msgs.some((m) => m.startsWith('error') && m.includes('"class.nope"'))).toBe(true)
  })

  it('draws the highlight frame in red', () => {
    expect(read(join(import.meta.dirname, '../src/capture.ts'))).toMatch(/border: '3px solid #d1242f'/)
  })
})

/** The fixture at media steps+video with a ready-made clip shown on the create-class page, alone on a line. */
async function clipFixture(extraConfig = '') {
  const root = await cleanFixture()
  const m = join(root, 'manual')
  const cfg = join(m, 'manual.config.yaml')
  writeFileSync(cfg, `${read(cfg).replace('media: screenshots', 'media: steps+video')}web: { baseUrl: "https://docs.example.com/manual/" }\n${extraConfig}`)
  appendFileSync(join(m, 'shots.yaml'), 'clips:\n  demo:\n    video: { file: demo.mp4 }\n    caption: { th: แนะนำ, en: Intro }\n')
  for (const lang of ['th', 'en']) {
    const f = join(m, `pages/${lang}/user-guide/02-create-class.md`)
    // the clip between the page's first figure and the steps, inside a list
    writeFileSync(f, read(f).replace('{{steps:create-class}}', '- one\n{{clip:demo}}\n- two\n\n{{shot:login}}\n\n{{steps:create-class}}'))
    for (const n of [1, 2]) writeFileSync(join(m, `media/${lang}/create-class-${n}.png`), PNG_1PX)
    writeFileSync(join(m, `media/${lang}/demo.poster.png`), PNG_1PX)
  }
  return root
}

describe('clips on paper', () => {
  it('defaults to none', () => {
    expect(ConfigSchema.parse({ document: { title: 'x' } }).document.clips).toBe('none')
  })

  it.each(['html', 'pandoc'] as Target[])('%s: no poster, no QR, the line goes and figure numbers do not skip', async (target) => {
    const root = await clipFixture()
    const book = await chapter(root, target)
    const md = book.chapters[1]!.markdown
    expect(md).not.toMatch(/demo|clip|QR|สแกน/)
    expect(md).toContain('- one\n- two')
    expect(book.figures.map((f) => f.label)).toEqual(['ภาพที่ 1-1', 'ภาพที่ 2-1', 'ภาพที่ 2-2', 'ภาพที่ 2-3'])
  })

  it('poster keeps the poster figure and the QR code', async () => {
    const root = await clipFixture('')
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('  date: "2026-10-05"', '  date: "2026-10-05"\n  clips: poster'))
    const html = (await chapter(root, 'html')).chapters[1]!.markdown
    expect(html).toMatch(/<figure class="figure clip[^"]*" id="fig-2-1">[\s\S]*<div class="clip-qr">/)
    expect((await chapter(root, 'pandoc')).chapters[1]!.markdown).toContain('https://docs.example.com/manual/user-guide/th/teacher.create-class.html#clip-demo')
  })

  it('the web and Outline keep their video', async () => {
    const root = await clipFixture()
    expect((await chapter(root, 'web')).chapters[1]!.markdown).toMatch(/<video id="clip-demo"/)
    expect((await chapter(root, 'outline')).chapters[1]!.markdown).toContain('(MP4)](media/th/demo.mp4)')
  })
})

describe('method cards ("ทำได้ N วิธี")', () => {
  const page = (h2: string, h3s: string[]) => `<h2 id="sec-1-2">${h2}</h2>\n<p>intro</p>\n${h3s.map((h, i) => `<h3 id="sec-1-2-${i + 1}">${h}</h3>\n<p>x</p>\n`).join('')}<h2 id="sec-1-3">ข้อควรทราบ</h2>\n<h3 id="sec-1-3-1">a</h3><h3 id="sec-1-3-2">b</h3>`

  it('puts a card per ### way at the top of the "วิธี…" section, without the writer\'s own "วิธีที่ k:"', () => {
    const html = methodCards(page('วิธีรับหนังสือ', ['วิธีที่ 1: รับจากหน้ารายการ', 'รับจาก<strong>หน้ารายละเอียด</strong>']), 'th')
    expect(html).toContain(
      '<h2 id="sec-1-2">วิธีรับหนังสือ</h2>\n<nav class="methods" aria-labelledby="sec-1-2-ways"><p class="methods-head" id="sec-1-2-ways">ทำได้ 2 วิธี</p><ol class="methods-list"><li><a href="#sec-1-2-1"><span class="methods-n">วิธีที่ 1</span><span class="methods-title">รับจากหน้ารายการ</span></a></li><li><a href="#sec-1-2-2"><span class="methods-n">วิธีที่ 2</span><span class="methods-title">รับจากหน้ารายละเอียด</span></a></li></ol></nav>\n<p>intro</p>',
    )
    // only that section
    expect(html.match(/class="methods"/g)).toHaveLength(1)
  })

  it('reads "How to" in English, and leaves a section with one way (or none) alone', () => {
    expect(methodCards(page('How to receive a letter', ['Method 1 – From the list', 'From the details page', 'By scanning']), 'en')).toContain(
      '<p class="methods-head" id="sec-1-2-ways">3 ways to do this</p><ol class="methods-list"><li><a href="#sec-1-2-1"><span class="methods-n">Method 1</span><span class="methods-title">From the list</span>',
    )
    const one = page('วิธีรับหนังสือ', ['ทางเดียว'])
    expect(methodCards(one, 'th')).toBe(one)
    const other = page('ข้อมูลทั่วไป', ['a', 'b'])
    expect(methodCards(other, 'th')).toBe(other)
  })

  it('shows on a how-to web page only, never on paper', async () => {
    const root = await cleanFixture()
    for (const lang of ['th', 'en']) {
      const f = join(root, `manual/pages/${lang}/user-guide/02-create-class.md`)
      writeFileSync(f, read(f).replace(lang === 'th' ? '## วิธีสร้างห้องเรียน' : '## How to create a class', lang === 'th' ? '## วิธีสร้างห้องเรียน\n\n### วิธีที่ 1: จากหน้ารายการ\n\nก\n\n### วิธีที่ 2: จากเมนู\n\nข' : '## How to create a class\n\n### From the list\n\na\n\n### From the menu\n\nb'))
    }
    expect(runCli(['build', 'web', '--lang', 'th'], root).code).toBe(0)
    const web = read(join(root, 'manual/dist/web/user-guide/th/teacher.create-class.html'))
    expect(web).toMatch(/<p class="methods-head" id="sec-2-2-ways">ทำได้ 2 วิธี<\/p>.*<span class="methods-title">จากหน้ารายการ<\/span>/)
    const print = (await chapter(root, 'html')).chapters[1]!.markdown
    expect(print).not.toContain('methods')
  })
})

describe('menu order (books.<id>.groups)', () => {
  const groupPages = async (root: string) => {
    const pages: [string, string][] = [['01-sign-in.md', 'account'], ['02-create-class.md', 'classes']]
    for (const lang of ['th', 'en'])
      for (const [file, group] of pages) {
        const f = join(root, `manual/pages/${lang}/user-guide/${file}`)
        writeFileSync(f, read(f).replace('kind: how-to', `kind: how-to\ngroup: ${group}`))
      }
  }

  it('parses an ordered list of groups with localized titles and refuses a repeated id', () => {
    const books = (groups: unknown) => ConfigSchema.safeParse({ document: { title: 'x' }, books: { b: { title: 'B', groups } } })
    const ok = books([{ id: 'classes', title: { th: 'ห้องเรียน', en: 'Classes' } }, { id: 'account', title: 'Account', icon: 'user' }])
    expect(ok.success && ok.data.books.b!.groups!.map((g) => g.id)).toEqual(['classes', 'account'])
    expect(books([{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }]).success).toBe(false)
  })

  it('orders the web sidebar and the PDF/DOCX chapters the way the app\'s menu does', async () => {
    const root = await cleanFixture()
    await groupPages(root)
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, read(cfg).replace('user-guide: { title: { th: คู่มือผู้ใช้, en: User guide } }', 'user-guide:\n    title: { th: คู่มือผู้ใช้, en: User guide }\n    groups:\n      - { id: classes, title: { th: ห้องเรียน, en: Classes } }\n      - { id: account, title: { th: บัญชีผู้ใช้, en: Account } }'))
    for (const target of ['html', 'pandoc'] as Target[]) expect((await chapter(root, target)).chapters.map((c) => [c.number, c.id])).toEqual([[1, 'teacher.create-class'], [2, 'teacher.sign-in']])
    // no "not in web.groups" warning: the book titles its groups
    expect(runCheck(await openProject(join(root, 'manual'))).findings.filter((f) => f.message.includes('web.groups'))).toEqual([])
    expect(runCli(['build', 'web', '--lang', 'en'], root).code).toBe(0)
    const home = read(join(root, 'manual/dist/web/user-guide/en/index.html'))
    expect([...home.matchAll(/<details class="group"[^>]*><summary>.*?<span>(.*?)<\/span>/g)].map((m) => m[1])).toEqual(['Classes', 'Account'])
  })

  it('without it, pages keep file order', async () => {
    const root = await cleanFixture()
    await groupPages(root)
    expect((await chapter(root, 'html')).chapters.map((c) => c.id)).toEqual(['teacher.sign-in', 'teacher.create-class'])
  })
})
