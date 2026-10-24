import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/adapters/index.ts'
import { findUi, scanTokens } from '../src/pages.ts'
import { openProject } from '../src/project.ts'
import { renderBook } from '../src/render.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, signAll } from './helpers/fixture.ts'

describe('quoted UI labels {{ui:"..."}}', () => {
  it('a quoted token may hold spaces and slashes', () => {
    expect(scanTokens('กด {{ui:"สมัครเรียน / เข้าสู่ระบบ"}} แล้ว {{ui:a.b}}')).toEqual([
      { kind: 'ui', arg: 'สมัครเรียน / เข้าสู่ระบบ', line: 1, quoted: true },
      { kind: 'ui', arg: 'a.b', line: 1 },
    ])
  })

  it('finds a label by key, else by its exact text', () => {
    const m = new Map([['login.submit', 'เข้าสู่ระบบ']])
    expect(findUi(m, 'login.submit')).toBe('เข้าสู่ระบบ')
    expect(findUi(m, 'เข้าสู่ระบบ')).toBe('เข้าสู่ระบบ')
    expect(findUi(m, 'ไม่มี')).toBeUndefined()
  })

  it('generic adapter: labels found in source (no i18n) are their own keys', () => {
    const root = join(process.env.TMPDIR ?? '/tmp', `mk-labels-${process.pid}`)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src/App.tsx'), '<button>สมัครเรียน / เข้าสู่ระบบ</button>\n<a>Sign up now</a>')
    const a = createAdapter({ type: 'generic', strings: { th: { files: ['src/**/*.tsx'], pattern: '>([^<>{}]+)<' } }, data: {} }, root)
    expect(findUi(a.uiStrings('th'), 'สมัครเรียน / เข้าสู่ระบบ')).toBe('สมัครเรียน / เข้าสู่ระบบ')
  })

  it('check verifies the label exists; render shows it; language twins may use different labels', async () => {
    const root = await cleanFixture()
    const th = join(root, 'manual/pages/th/user-guide/01-sign-in.md')
    const en = join(root, 'manual/pages/en/user-guide/01-sign-in.md')
    writeFileSync(th, `${readFileSync(th, 'utf8')}\nปุ่ม {{ui:"เข้าสู่ระบบ"}}\n`)
    writeFileSync(en, `${readFileSync(en, 'utf8')}\nThe {{ui:"Sign in"}} button\n`)
    await signAll(root)
    const ok = runCli(['check', '--json'], root)
    expect(JSON.parse(ok.stdout).findings).toEqual([])
    const book = renderBook(await openProject(join(root, 'manual')), { lang: 'th', book: 'user-guide', target: 'html' })
    expect(book.chapters[0]!.markdown).toContain('ปุ่ม **เข้าสู่ระบบ**')
    writeFileSync(th, `${readFileSync(th, 'utf8')}\n{{ui:"ไม่มีปุ่ม นี้"}}\n`)
    await signAll(root)
    const bad = JSON.parse(runCli(['check', '--json'], root).stdout) as { findings: { rule: string; message: string }[] }
    expect(bad.findings.map((f) => f.rule)).toEqual(['ui'])
    expect(bad.findings[0]!.message).toContain('ไม่มีปุ่ม นี้')
  })
})
