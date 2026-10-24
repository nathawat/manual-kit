import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOW_TO_PARTS } from '../src/how-to.ts'
import { runCli } from './helpers/cli.ts'
import { cleanFixture, copyFixture } from './helpers/fixture.ts'

const lock = (root: string) => JSON.parse(readFileSync(join(root, 'manual/manual.lock.json'), 'utf8')) as { pages: Record<string, { files: Record<string, string>; sources: Record<string, string> }> }

describe('sign', () => {
  it('records page file and source hashes for the given ids', () => {
    const root = copyFixture()
    const r = runCli(['sign', 'teacher.sign-in'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/signed teacher\.sign-in/)
    const sig = lock(root).pages['teacher.sign-in']!
    expect(Object.keys(sig.files)).toEqual(['pages/en/user-guide/01-sign-in.md', 'pages/th/user-guide/01-sign-in.md'])
    expect(Object.keys(sig.sources)).toEqual(['src/routes.ts'])
    expect(sig.sources['src/routes.ts']).toMatch(/^[0-9a-f]{64}$/)
    expect(lock(root).pages['teacher.create-class']).toBeUndefined()
  })

  it('--all signs every page; signing again changes nothing', () => {
    const root = copyFixture()
    runCli(['sign', '--all'], root)
    const before = readFileSync(join(root, 'manual/manual.lock.json'), 'utf8')
    expect(Object.keys(lock(root).pages)).toEqual(['teacher.create-class', 'teacher.sign-in'])
    const r = runCli(['sign', '--all'], root)
    expect(r.stdout).toMatch(/already signed/)
    expect(readFileSync(join(root, 'manual/manual.lock.json'), 'utf8')).toBe(before)
  })

  it('rejects unknown ids without writing', () => {
    const root = copyFixture()
    const r = runCli(['sign', 'nope'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/unknown page "nope"/)
    expect(existsSync(join(root, 'manual/manual.lock.json'))).toBe(false)
  })

  it('clears the signature finding in check', async () => {
    const root = await cleanFixture()
    rmSync(join(root, 'manual/manual.lock.json'))
    expect(runCli(['check'], root).code).toBe(1)
    runCli(['sign', '--all'], root)
    expect(runCli(['check'], root).code).toBe(0)
  })
})

describe('how-to steps heading', () => {
  it('takes a task that starts with แก้ไข, not a problems heading', () => {
    const how = HOW_TO_PARTS.find((p) => p.id === 'how')!.match.th
    expect(['วิธีแก้ไขข้อมูลส่วนตัว', 'วิธีสร้างห้องเรียน'].map(how)).toEqual([true, true])
    expect(['วิธีแก้ปัญหา', 'วิธีแก้ไขปัญหา', 'ปัญหาที่อาจพบและวิธีแก้ไข'].map(how)).toEqual([false, false, false])
  })
})

describe('new-page', () => {
  it('creates the page in every language with the next number and a kind template', () => {
    const root = copyFixture()
    const r = runCli(['new-page', 'teacher.add-students', '--kind', 'how-to', '--book', 'user-guide', '--title', 'Add students'], root)
    expect(r.code).toBe(0)
    const th = readFileSync(join(root, 'manual/pages/th/user-guide/03-add-students.md'), 'utf8')
    const en = readFileSync(join(root, 'manual/pages/en/user-guide/03-add-students.md'), 'utf8')
    expect(th).toMatch(/^---\nid: teacher\.add-students\ntitle: Add students\n/)
    expect(th).toContain('kind: how-to')
    // the headings that name the task carry the title
    expect(th).toContain('## Add studentsคืออะไร')
    expect(en).toContain('## How to add students')
    expect(en).toContain('## Problems and fixes')
  })

  it('a how-to page has every part the skill requires, in order, and passes the how-to structure rule', () => {
    const root = copyFixture()
    runCli(['new-page', 'teacher.add-students', '--kind', 'how-to', '--book', 'user-guide'], root)
    const th = readFileSync(join(root, 'manual/pages/th/user-guide/03-add-students.md'), 'utf8')
    const en = readFileSync(join(root, 'manual/pages/en/user-guide/03-add-students.md'), 'utf8')
    const h2 = (s: string) => [...s.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(h2(th).map((h, i) => HOW_TO_PARTS[i]!.match.th(h!))).toEqual(HOW_TO_PARTS.map(() => true))
    expect(h2(th)).toEqual(['งานนี้คืออะไร', 'วิธีทำงานนี้', 'ข้อควรทราบ', 'ปัญหาที่อาจพบและวิธีแก้ไข', 'คำถามที่เกี่ยวข้อง'])
    expect(h2(en)).toEqual(['What is this task', 'How to do this task', 'Good to know', 'Problems and fixes', 'Related questions'])
    // every part has a writing hint in both languages
    expect(th).toContain('<!-- ใช้ภาพทีละขั้น')
    expect(en).toContain('<!-- One problem per item.')
    const r = JSON.parse(runCli(['check', '--json', '--allow-unsigned'], root).stdout) as { findings: { rule: string; severity: string; file?: string }[] }
    expect(r.findings.filter((f) => f.rule === 'structure' && f.file?.includes('03-add-students'))).toEqual([])
    // the hints hold no tokens: a new page has no errors of its own
    expect(r.findings.filter((f) => f.severity === 'error' && f.file?.includes('03-add-students'))).toEqual([])
  })

  it('is idempotent and fills in a missing language twin', () => {
    const root = copyFixture()
    rmSync(join(root, 'manual/pages/en/user-guide/02-create-class.md'))
    const r = runCli(['new-page', 'teacher.create-class', '--kind', 'how-to', '--book', 'user-guide'], root)
    expect(r.stdout).toMatch(/created pages\/en\/user-guide\/02-create-class\.md/)
    expect(r.stdout).not.toMatch(/pages\/th/)
    const again = runCli(['new-page', 'teacher.create-class', '--kind', 'how-to', '--book', 'user-guide'], root)
    expect(again.stdout).toMatch(/exists/)
  })

  it('rejects a bad id or kind', () => {
    const root = copyFixture()
    expect(runCli(['new-page', 'Bad Id', '--kind', 'how-to', '--book', 'user-guide'], root).code).toBe(2)
    expect(runCli(['new-page', 'ok.id', '--kind', 'story', '--book', 'user-guide'], root).code).not.toBe(0)
  })
})
