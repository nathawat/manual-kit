import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadPages, scanTokens } from '../src/pages.ts'
import { FIXTURE, copyFixture } from './helpers/fixture.ts'

describe('scanTokens', () => {
  it('finds every token kind with its line, skipping fenced code', () => {
    const body = 'a {{ui:x.y}} b {{data:n.k}}\n{{shot:s1}}\n```\n{{ui:ignored}}\n```\n{{steps:st}} {{clip:c}} see [[page.id]] {{bogus:z}}'
    expect(scanTokens(body)).toEqual([
      { kind: 'ui', arg: 'x.y', line: 1 },
      { kind: 'data', arg: 'n.k', line: 1 },
      { kind: 'shot', arg: 's1', line: 2 },
      { kind: 'steps', arg: 'st', line: 6 },
      { kind: 'clip', arg: 'c', line: 6 },
      { kind: 'link', arg: 'page.id', line: 6 },
      { kind: 'unknown', arg: 'bogus:z', line: 6 },
    ])
  })
})

describe('loadPages', () => {
  it('loads pages per language and book in file order', () => {
    const { pages, problems } = loadPages(join(FIXTURE, 'manual'))
    expect(problems).toEqual([])
    expect(pages.map((p) => `${p.lang}/${p.book}/${p.id}`)).toEqual([
      'en/user-guide/teacher.sign-in',
      'en/user-guide/teacher.create-class',
      'th/user-guide/teacher.sign-in',
      'th/user-guide/teacher.create-class',
    ])
    const signIn = pages.find((p) => p.lang === 'th' && p.id === 'teacher.sign-in')!
    expect(signIn.meta).toMatchObject({ title: 'เข้าสู่ระบบ', kind: 'how-to', audience: ['teacher'], routes: ['/login'], sources: ['src/routes.ts'] })
    expect(signIn.rel).toBe('pages/th/user-guide/01-sign-in.md')
    expect(signIn.tokens.map((t) => t.kind)).toEqual(['ui', 'ui', 'shot', 'link'])
    // body lines are counted from the file start so messages point at the real line
    expect(signIn.tokens[0]!.line).toBe(18)
  })

  it('reports invalid front matter as a problem instead of throwing', () => {
    const root = copyFixture()
    writeFileSync(join(root, 'manual/pages/th/user-guide/03-bad.md'), '---\ntitle: x\nkind: story\n---\nbody\n')
    const { pages, problems } = loadPages(join(root, 'manual'))
    expect(pages).toHaveLength(4)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.file).toBe('pages/th/user-guide/03-bad.md')
    expect(problems[0]!.message).toMatch(/id/)
    expect(problems[0]!.message).toMatch(/kind/)
  })
})
