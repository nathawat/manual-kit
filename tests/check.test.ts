import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatReport, type Finding as SrcFinding } from '../src/check.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, signAll } from './helpers/fixture.ts'

interface Finding { rule: string; severity: 'error' | 'warning'; file?: string; line?: number; message: string }
interface Report { ok: boolean; errors: number; warnings: number; findings: Finding[]; unsigned: string[] }

function check(root: string): Report & { code: number } {
  const r = runCli(['check', '--json'], root)
  if (r.stderr) throw new Error(r.stderr)
  return { ...(JSON.parse(r.stdout) as Report), code: r.code }
}
const edit = (root: string, rel: string, fn: (s: string) => string) => {
  const f = join(root, rel)
  writeFileSync(f, fn(readFileSync(f, 'utf8')))
}
const TH1 = 'manual/pages/th/user-guide/01-sign-in.md'
const EN1 = 'manual/pages/en/user-guide/01-sign-in.md'
const rules = (r: Report) => r.findings.filter((f) => f.severity === 'error').map((f) => f.rule)

describe('check', () => {
  it('passes on a complete manual (exit 0) and prints a human summary', async () => {
    const root = await cleanFixture()
    const r = check(root)
    expect(r.findings).toEqual([])
    expect(r).toMatchObject({ ok: true, code: 0 })
    const text = runCli(['check'], root)
    expect(text.code).toBe(0)
    expect(text.stdout).toMatch(/0 errors, 0 warnings/)
  })

  it('a front matter group missing from web.groups is one warning per group, with the title the web uses and the fix', async () => {
    const root = await cleanFixture()
    for (const lang of ['th', 'en'])
      for (const page of ['01-sign-in', '02-create-class']) edit(root, `manual/pages/${lang}/user-guide/${page}.md`, (s) => s.replace('kind: how-to', `kind: how-to\ngroup: ${page === '01-sign-in' ? 'getting-started' : 'classes'}`))
    appendFileSync(join(root, 'manual/manual.config.yaml'), 'web: { groups: { classes: { title: Classes } } }\n')
    await signAll(root)
    const r = check(root)
    expect(r.findings).toEqual([
      {
        rule: 'front-matter',
        severity: 'warning',
        file: 'pages/en/user-guide/01-sign-in.md',
        message: 'group "getting-started" is not in web.groups, so the web titles it "Getting started": add web.groups.getting-started with a title (and icon)',
      },
    ])
    expect(r.ok).toBe(true)
  })

  it('structure: a how-to page missing a required part, with parts out of order or with old headings is a warning naming them', async () => {
    const root = await cleanFixture()
    edit(root, EN1, (s) => s.replace('## Problems and fixes', '## Troubles'))
    // the old template: the intro is "ก่อนเริ่ม" and the problems "ปัญหาที่พบบ่อย"
    edit(root, TH1, (s) => s.replace('## การเข้าสู่ระบบคืออะไร', '## ก่อนเริ่ม').replace('## ปัญหาที่อาจพบและวิธีแก้ไข', '## ปัญหาที่พบบ่อย'))
    // optional parts may go; required ones out of order are named
    edit(root, 'manual/pages/en/user-guide/02-create-class.md', (s) => s.replace(/## Good to know[\s\S]*?(?=## Problems)/, '').replace(/(## What is a class[\s\S]*?)(## How to create a class[\s\S]*?)(## Problems)/, '$2$1$3'))
    await signAll(root)
    const r = check(root)
    expect(r.code).toBe(0)
    const s = r.findings.filter((f) => f.rule === 'structure')
    expect(s.map((f) => [f.severity, f.file])).toEqual([
      ['warning', 'pages/en/user-guide/01-sign-in.md'],
      ['warning', 'pages/en/user-guide/02-create-class.md'],
      ['warning', 'pages/th/user-guide/01-sign-in.md'],
    ])
    expect(s[0]!.message).toMatch(/missing "Problems and fixes"/)
    expect(s[0]!.message).toMatch(/a how-to has ## "What is …", "How to …", "Good to know" \(optional\), "Problems and fixes", "Related questions" \(optional\), in this order/)
    expect(s[1]!.message).toMatch(/"How to …" is out of order/)
    expect(s[1]!.message).not.toMatch(/Good to know"? is|missing "Good/)
    expect(s[2]!.message).toMatch(/missing "…คืออะไร"/)
    expect(s[2]!.message).toMatch(/missing "ปัญหาที่อาจพบและวิธีแก้ไข"/)
    expect(s[2]!.message).toMatch(/old template headings: "ก่อนเริ่ม" -> "…คืออะไร", "ปัญหาที่พบบ่อย" -> "ปัญหาที่อาจพบและวิธีแก้ไข"/)
  })

  it('front matter: a broken page is an error with exit 1', async () => {
    const root = await cleanFixture()
    writeFileSync(join(root, 'manual/pages/th/user-guide/09-x.md'), '---\ntitle: X\n---\n')
    const r = check(root)
    expect(r.code).toBe(1)
    expect(rules(r)).toContain('front-matter')
  })

  it('book: front matter book must match the folder', async () => {
    const root = await cleanFixture()
    edit(root, TH1, (s) => s.replace('book: user-guide', 'book: admin-guide'))
    expect(check(root).findings).toContainEqual(expect.objectContaining({ rule: 'book', file: 'pages/th/user-guide/01-sign-in.md' }))
  })

  it('ui: a key missing in that language, with file and line', async () => {
    const root = await cleanFixture()
    edit(root, EN1, (s) => s.replace('{{ui:login.email}}', '{{ui:login.mail}}'))
    edit(root, TH1, (s) => s.replace('{{ui:login.email}}', '{{ui:login.mail}}'))
    const r = check(root)
    expect(r.findings).toContainEqual(expect.objectContaining({ rule: 'ui', file: 'pages/en/user-guide/01-sign-in.md', line: 18 }))
  })

  it('data, link and unknown tokens', async () => {
    const root = await cleanFixture()
    for (const f of [TH1, EN1]) edit(root, f, (s) => s + '\n{{data:limits.nope}} [[no.such.page]] {{video:x}}\n')
    expect(rules(check(root))).toEqual(expect.arrayContaining(['data', 'link', 'token']))
  })

  it('twin: language versions must exist and carry the same tokens', async () => {
    const root = await cleanFixture()
    edit(root, EN1, (s) => s.replace('{{shot:login}}', ''))
    const r = check(root)
    expect(r.findings).toContainEqual(expect.objectContaining({ rule: 'twin', message: expect.stringMatching(/shot:login/) }))
    rmSync(join(root, 'manual/pages/en/user-guide/02-create-class.md'))
    expect(check(root).findings).toContainEqual(expect.objectContaining({ rule: 'twin', message: expect.stringMatching(/teacher\.create-class.*en/) }))
  })

  it('coverage: unmapped and removed items fail, manual-later only warns', async () => {
    const root = await cleanFixture()
    edit(root, 'manual/coverage.yaml', (s) => s.replace(/status: ignored/, 'status: unmapped'))
    expect(rules(check(root))).toContain('coverage')
    const root2 = await cleanFixture()
    edit(root2, 'manual/coverage.yaml', (s) => s.replace(/status: ignored/g, 'status: manual-later'))
    const r = check(root2)
    expect(r.ok).toBe(true)
    expect(r.findings.filter((f) => f.rule === 'coverage').map((f) => f.severity)).toEqual(['warning', 'warning'])
    appendFileSync(join(root2, 'manual/coverage.yaml'), '  - { id: "route:/gone", kind: route, status: removed, pages: [] }\n')
    expect(rules(check(root2))).toContain('coverage')
  })

  it('signature: unsigned pages, edited pages and changed sources fail until signed', async () => {
    const root = await cleanFixture()
    appendFileSync(join(root, 'src/limits.json'), '\n')
    let r = check(root)
    expect(r.findings).toContainEqual(expect.objectContaining({ rule: 'signature', message: expect.stringMatching(/teacher\.create-class.*src\/limits\.json/) }))
    expect(r.findings.filter((f) => f.rule === 'signature')).toHaveLength(1)
    edit(root, TH1, (s) => s + '\nเพิ่ม\n')
    r = check(root)
    expect(r.findings.filter((f) => f.rule === 'signature')).toHaveLength(2)
    await signAll(root)
    expect(check(root).ok).toBe(true)
    rmSync(join(root, 'manual/manual.lock.json'))
    expect(check(root).findings.filter((f) => f.rule === 'signature')).toHaveLength(2)
  })

  it('source: a page source that does not exist is an error', async () => {
    const root = await cleanFixture()
    for (const f of [TH1, EN1]) edit(root, f, (s) => s.replace('sources: [src/routes.ts]', 'sources: [src/nope.ts]'))
    await signAll(root)
    expect(rules(check(root))).toEqual(['source', 'source'])
  })

  it('shot: unknown ids, missing media and stale media', async () => {
    const root = await cleanFixture()
    rmSync(join(root, 'manual/media/en/login.png'))
    expect(check(root).findings).toContainEqual(expect.objectContaining({ rule: 'shot', message: expect.stringMatching(/media\/en\/login\.png/) }))
    edit(root, 'manual/shots.yaml', (s) => s.replace('url: /login.html', 'url: /login2.html'))
    expect(check(root).findings).toContainEqual(expect.objectContaining({ rule: 'shot', message: expect.stringMatching(/changed since capture/) }))
    for (const f of [TH1, EN1]) edit(root, f, (s) => s.replace('{{shot:login}}', '{{shot:nope}}'))
    expect(check(root).findings).toContainEqual(expect.objectContaining({ rule: 'shot', message: expect.stringMatching(/nope.*shots\.yaml/) }))
  })

  it('shot: media level none needs no images', async () => {
    const root = await cleanFixture()
    rmSync(join(root, 'manual/media'), { recursive: true })
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('media: screenshots', 'media: none'))
    expect(check(root).ok).toBe(true)
  })

  it('wording: superlatives and project forbidden words, with line numbers', async () => {
    const root = await cleanFixture()
    edit(root, TH1, (s) => s + '\nระบบที่ดีที่สุด\n')
    edit(root, EN1, (s) => s + '\nThe best tool. Ask Cody.\n')
    const w = check(root).findings.filter((f) => f.rule === 'wording')
    expect(w).toEqual([
      expect.objectContaining({ file: 'pages/en/user-guide/01-sign-in.md', line: 34, message: expect.stringMatching(/best/) }),
      expect.objectContaining({ file: 'pages/en/user-guide/01-sign-in.md', line: 34, message: expect.stringMatching(/Codi/) }),
      expect.objectContaining({ file: 'pages/th/user-guide/01-sign-in.md', line: 34, message: expect.stringMatching(/ดีที่สุด/) }),
    ])
  })

  it('wording: plain language warns about system words in page text, not in tokens, code, links or note box markers; wording.allow accepts some', async () => {
    const root = await cleanFixture()
    edit(root, EN1, (s) =>
      s +
        [
          '',
          'Open /documents/:id and set NEXT_PUBLIC_URL, user_name, isActive and portal:admin; the status shows WAIT.',
          'Fine: {{ui:login.title}}, `/api/x`, [home](/home), https://example.com/a_b, PDF and/or Word, ACME, a note box.',
          '```',
          'GET /documents/:id',
          '```',
          '> [!NOTE]',
          'พัฒนาระบบโดย บริษัทตัวอย่าง',
        ].join('\n'),
    )
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  allow: [ACME]'))
    const w = check(root).findings.filter((f) => f.rule === 'wording')
    expect(w.every((f) => f.severity === 'warning' && f.file === 'pages/en/user-guide/01-sign-in.md')).toBe(true)
    expect(w.map((f) => [f.line, /^"([^"]+)"/.exec(f.message)?.[1]])).toEqual([
      [34, '/documents/:id'],
      [34, 'NEXT_PUBLIC_URL'],
      [34, 'portal:admin'],
      [34, 'user_name'],
      [34, 'isActive'],
      [34, 'WAIT'],
      [40, 'พัฒนาระบบโดย'],
    ])
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  plainLanguage: false'))
    expect(check(root).findings.filter((f) => f.rule === 'wording')).toEqual([])
  })

  it('wording: a step longer than wording.stepLength (tokens counted as their label) is a warning, in pages and shots.yaml', async () => {
    const root = await cleanFixture()
    const long = 'ระบุชื่อห้องเรียนให้ตรงกับชื่อที่ใช้ในตารางสอนของโรงเรียน เพราะระบบจะนำชื่อนี้ไปแสดงในรายงานทุกฉบับ และผู้ปกครองจะเห็นชื่อนี้ในหน้าติดตามผลการเรียนทุกภาคเรียน'
    // a numbered step in "วิธี…", with a continuation line; sub-bullets and other sections are not steps
    edit(root, TH1, (s) => s.replace('กรอก {{ui:login.email}} แล้วกด {{ui:login.submit}}', `1. ระบุ {{ui:login.email}}\n2. ${long.slice(0, 60)}\n   ${long.slice(60)}\n   - ${long}\n3. คลิกปุ่ม {{ui:"เข้าสู่ระบบ"}}`).replace('- ระบบเปิดหน้าห้องเรียนหลังเข้าสู่ระบบ', `1. ${long}`))
    edit(root, 'manual/shots.yaml', (s) => s.replace('text: { th: "กด {{ui:class.new}}"', `text: { th: "กด {{ui:class.new}} ${long}"`))
    await signAll(root)
    const w = check(root).findings.filter((f) => f.rule === 'wording')
    expect(w.map((f) => [f.severity, f.file, f.line])).toEqual([
      ['warning', 'pages/th/user-guide/01-sign-in.md', 19],
      ['warning', 'shots.yaml', undefined],
    ])
    expect(w[0]!.message).toMatch(/^step is 1\d\d characters \(limit 120\): keep a step to one short action and move the explanation into the "…คืออะไร" intro or "ข้อควรทราบ"$/)
    expect(w[1]!.message).toMatch(/^shots\.yaml steps "create-class" step 1 \(th\) is 1\d\d characters/)
    // a token counts as its label: a long key with a short label is short
    edit(root, EN1, (s) => s.replace('Enter your {{ui:login.email}} and press', '1. Enter your {{ui:login.email}} and click'))
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  stepLength: { th: 0, en: 20 }'))
    const off = check(root).findings.filter((f) => f.rule === 'wording')
    expect(off.map((f) => f.message.replace(/: keep.*/, ''))).toEqual([
      'step is 35 characters (limit 20)',
      'shots.yaml steps "create-class" step 2 (en) is 34 characters (limit 20)',
    ])
  })

  it('structure: plain numbered steps while media is steps are a warning; {{steps}} in the section or "### วิธีที่ N" sub-section clears it', async () => {
    const root = await cleanFixture()
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('media: screenshots', 'media: steps'))
    edit(root, EN1, (s) => s.replace('{{shot:login}}', '{{steps:create-class}}'))
    edit(root, TH1, (s) => s.replace('กรอก {{ui:login.email}}', '### วิธีที่ 1 ด้วยอีเมล\n\n{{steps:create-class}}\n\n### วิธีที่ 2 ด้วยรหัส\n\n1. กรอก {{ui:login.email}}'))
    edit(root, EN1, (s) => s.replace('Enter your', '1. Enter your'))
    const s = check(root).findings.filter((f) => f.rule === 'structure')
    expect(s.map((f) => [f.severity, f.file, f.line])).toEqual([['warning', 'pages/th/user-guide/01-sign-in.md', 24]])
    expect(s[0]!.message).toBe('steps are a plain numbered list while media is "steps": use {{steps:id}} so every step has its own screenshot with a frame on the control')
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  stepImages: false'))
    expect(check(root).findings.filter((f) => f.rule === 'structure')).toEqual([])
  })

  it('ui: a quoted problem title that is no UI string or code message is a warning, once discovery finds messages', async () => {
    const root = await cleanFixture()
    const problems = [
      '- ปัญหา: “กรุณาระบุชื่อห้อง”',
      '  วิธีแก้ไข: ระบุชื่อห้องแล้วคลิกปุ่ม “บันทึก”',
      '- **ปัญหา:** "ห้อง ป.5/1 เต็มแล้ว"',
      '  **วิธีแก้ไข:** สร้างห้องใหม่',
      '- ปัญหา: “กรุณาเพิ่มหนังสือหลัก”',
      '  วิธีแก้ไข: แนบไฟล์',
      '- ปัญหา: ไม่เห็นปุ่ม {{ui:class.new}}',
      '  วิธีแก้ไข: ติดต่อผู้ดูแล',
    ].join('\n')
    edit(root, TH1, (s) => s.replace('ลืมรหัสผ่าน: ติดต่อผู้ดูแล', problems))
    await signAll(root)
    // no messages known yet: nothing to compare with
    expect(check(root).findings.filter((f) => f.rule === 'ui')).toEqual([])
    edit(root, 'locales/th.json', (s) => s.replace('"class": {', '"errors": { "required": "กรุณาระบุชื่อห้อง", "full": "ห้อง {name} เต็มแล้ว" },\n  "class": {'))
    const u = check(root).findings.filter((f) => f.rule === 'ui')
    expect(u).toEqual([
      {
        rule: 'ui',
        severity: 'warning',
        file: 'pages/th/user-guide/01-sign-in.md',
        line: 32,
        message: 'problem "กรุณาเพิ่มหนังสือหลัก" is not a message the system has in th (no UI string or message in the code matches): title a problem with the message exactly as the screen shows it',
      },
    ])
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  problemMessages: false'))
    expect(check(root).findings.filter((f) => f.rule === 'ui')).toEqual([])
  })

  it('wording: prose that points at the video is a warning (video is web-only); wording.videoInProse turns it off', async () => {
    const root = await cleanFixture()
    edit(root, TH1, (s) => s + '\nดูวิดีโอด้านล่างก่อนเริ่ม\n\n```\nดูวิดีโอ\n```\n')
    edit(root, EN1, (s) => s + '\nWatch the video first. The [video](https://example.com/watch the video) is fine as a link target.\n')
    await signAll(root)
    const w = check(root).findings.filter((f) => f.rule === 'wording')
    expect(w.map((f) => [f.file, f.line, /^"([^"]+)"/.exec(f.message)?.[1]])).toEqual([
      ['pages/en/user-guide/01-sign-in.md', 34, 'Watch the video'],
      ['pages/th/user-guide/01-sign-in.md', 34, 'ดูวิดีโอ'],
    ])
    expect(w[0]!.message).toMatch(/video is on the web only, so the PDF and DOCX would show a line with nothing to watch/)
    edit(root, 'manual/manual.config.yaml', (s) => s.replace('wording:', 'wording:\n  videoInProse: false'))
    expect(check(root).findings.filter((f) => f.rule === 'wording')).toEqual([])
  })

  it('coverage follows page front matter (routes and covers) without re-running inventory', async () => {
    const root = await cleanFixture()
    edit(root, 'manual/coverage.yaml', (s) => s.replace(/status: ignored/g, 'status: unmapped'))
    expect(rules(check(root))).toContain('coverage')
    edit(root, TH1, (s) => s.replace('routes: [/login]', 'routes: [/login]\ncovers: ["role:*"]'))
    await signAll(root)
    expect(check(root).findings).toEqual([])
    // a covers entry that matches nothing is an error on the page
    edit(root, TH1, (s) => s.replace('covers: ["role:*"]', 'covers: ["role:*", "perm:nothing"]'))
    await signAll(root)
    const r = check(root)
    expect(r.findings).toEqual([expect.objectContaining({ rule: 'coverage', severity: 'error', file: TH1.replace('manual/', ''), message: expect.stringMatching(/perm:nothing/) })])
  })

  it('signing: unsigned and changed pages fail by default, warn with --allow-unsigned or signing: warn, and are always listed', async () => {
    const root = await cleanFixture()
    edit(root, EN1, (s) => `${s}\nOne more line.\n`)
    rmSync(join(root, 'manual/manual.lock.json'))
    writeFileSync(join(root, 'manual/manual.lock.json'), JSON.stringify({ version: 1, pages: {} }))
    const strict = check(root)
    expect(strict.code).toBe(1)
    expect(strict.unsigned).toEqual(['teacher.create-class', 'teacher.sign-in'])
    // as errors, each page keeps its own line with the file and the command to run
    const strictText = runCli(['check'], root).stdout
    expect(strictText).toMatch(/^error\s+signature\s+pages\/th\/user-guide\/01-sign-in\.md\s+teacher\.sign-in has not been signed .*manual-kit sign teacher\.sign-in/m)
    expect(strictText).toMatch(/^error\s+signature\s+pages\/th\/user-guide\/02-create-class\.md\s+teacher\.create-class has not been signed/m)
    // as warnings, the one "not signed" line stands for them
    const loose = runCli(['check', '--allow-unsigned'], root)
    expect(loose.code).toBe(0)
    expect(loose.stdout).not.toMatch(/signature/)
    expect(loose.stdout).toMatch(/^ok: 0 errors, 2 warnings$/m)
    expect(loose.stdout).toMatch(/not signed \(2\): teacher\.create-class, teacher\.sign-in/)
    expect(loose.stdout).toMatch(/only a person signs/)
    edit(root, 'manual/manual.config.yaml', (s) => `${s}signing: warn\n`)
    const warned = check(root)
    expect(warned.code).toBe(0)
    expect(warned.findings.filter((f) => f.rule === 'signature').every((f) => f.severity === 'warning')).toBe(true)
    expect(warned.unsigned).toHaveLength(2)
  })
})


describe('check text report', () => {
  const plain = (term: string) => `"${term}" looks like an all-caps code: say it the way the reader sees it on screen (or add it to wording.allow)`
  const report = (findings: SrcFinding[], unsigned: string[] = []) => {
    const errors = findings.filter((f) => f.severity === 'error').length
    return formatReport({ ok: errors === 0, errors, warnings: findings.length - errors, findings, unsigned })
  }

  it('one line per repeated finding, with every file and line, errors first', () => {
    const text = report([
      { rule: 'wording', severity: 'warning', file: 'pages/th/a.md', line: 3, message: plain('API') },
      { rule: 'wording', severity: 'warning', file: 'pages/th/a.md', line: 9, message: plain('API') },
      { rule: 'wording', severity: 'warning', file: 'pages/th/b.md', line: 4, message: plain('API') },
      { rule: 'wording', severity: 'warning', file: 'pages/th/b.md', line: 4, message: plain('CSS') },
      { rule: 'ui', severity: 'error', file: 'pages/th/b.md', line: 7, message: 'unknown UI key "x"' },
      { rule: 'ui', severity: 'error', file: 'pages/th/c.md', line: 2, message: 'unknown UI key "x"' },
    ])
    expect(text.split('\n')).toEqual([
      'error    ui           pages/th/b.md:7 pages/th/c.md:2  unknown UI key "x"',
      `warning  wording      pages/th/a.md:3,9 pages/th/b.md:4  ${plain('API')}`,
      `warning  wording      pages/th/b.md:4  ${plain('CSS')}`,
      'failed: 2 errors, 4 warnings',
    ])
  })

  it('a finding with no file keeps its message', () => {
    expect(report([{ rule: 'book', severity: 'error', message: 'no books' }]).split('\n')[0]).toBe('error    book         no books')
  })

  it('signature warnings are left to the "not signed" line; signature errors stay one line per page', () => {
    const sig = (severity: 'error' | 'warning', id: string): SrcFinding => ({ rule: 'signature', severity, file: `pages/th/${id}.md`, message: `${id} has not been signed` })
    expect(report([sig('warning', 'a'), sig('warning', 'b')], ['a', 'b']).split('\n')).toEqual([
      'not signed (2): a, b (only a person signs, after reading the page)',
      'ok: 0 errors, 2 warnings',
    ])
    expect(report([sig('error', 'a'), sig('error', 'b')], ['a', 'b']).split('\n').slice(0, 2)).toEqual([
      'error    signature    pages/th/a.md  a has not been signed',
      'error    signature    pages/th/b.md  b has not been signed',
    ])
  })
})
