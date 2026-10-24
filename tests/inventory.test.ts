import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { runCli } from './helpers/cli.ts'
import { copyFixture } from './helpers/fixture.ts'

const coverage = (root: string) => readFileSync(join(root, 'manual/coverage.yaml'), 'utf8')
const items = (root: string) => (YAML.parse(coverage(root)) as { items: { id: string; status: string; pages: string[]; auto?: string[] }[] }).items

describe('inventory', () => {
  it('writes coverage.yaml, mapping routes named in page front matter', () => {
    const root = copyFixture()
    const r = runCli(['inventory'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/4 new/)
    expect(items(root)).toEqual([
      expect.objectContaining({ id: 'role:admin', status: 'unmapped', pages: [] }),
      expect.objectContaining({ id: 'role:teacher', status: 'unmapped', pages: [] }),
      expect.objectContaining({ id: 'route:/classes', status: 'mapped', pages: [], auto: ['teacher.create-class'] }),
      expect.objectContaining({ id: 'route:/login', status: 'mapped', pages: [], auto: ['teacher.sign-in'] }),
    ])
  })

  it('maps items named in a page\'s covers (wildcards allowed) and follows front matter changes on the next run', () => {
    const root = copyFixture()
    const page = join(root, 'manual/pages/th/user-guide/01-sign-in.md')
    writeFileSync(page, readFileSync(page, 'utf8').replace('routes: [/login]', 'routes: [/login]\ncovers: ["role:*"]'))
    runCli(['inventory'], root)
    expect(items(root).filter((i) => i.id.startsWith('role:'))).toEqual([
      expect.objectContaining({ id: 'role:admin', status: 'mapped', pages: [], auto: ['teacher.sign-in'] }),
      expect.objectContaining({ id: 'role:teacher', status: 'mapped', pages: [], auto: ['teacher.sign-in'] }),
    ])
    writeFileSync(page, readFileSync(page, 'utf8').replace('covers: ["role:*"]', 'covers: [role:teacher]'))
    runCli(['inventory'], root)
    expect(items(root).find((i) => i.id === 'role:admin')).toMatchObject({ status: 'unmapped', pages: [] })
    expect(items(root).find((i) => i.id === 'role:admin')).not.toHaveProperty('auto')
  })

  it('is idempotent: a second run changes nothing', () => {
    const root = copyFixture()
    runCli(['inventory'], root)
    const first = coverage(root)
    const r = runCli(['inventory'], root)
    expect(r.stdout).toMatch(/no changes/)
    expect(coverage(root)).toBe(first)
  })

  it('keeps human edits and marks items that left the code as removed', () => {
    const root = copyFixture()
    runCli(['inventory'], root)
    const doc = YAML.parse(coverage(root)) as { items: Record<string, unknown>[] }
    doc.items.find((i) => i.id === 'role:admin')!.status = 'ignored'
    doc.items.find((i) => i.id === 'role:admin')!.note = 'admins have their own guide'
    doc.items.find((i) => i.id === 'role:teacher')!.pages = ['teacher.sign-in']
    writeFileSync(join(root, 'manual/coverage.yaml'), YAML.stringify(doc))
    writeFileSync(join(root, 'src/routes.ts'), "export const routes = [{ path: '/login' }]\nexport const ROLES = ['teacher', 'admin']\n")
    const r = runCli(['inventory'], root)
    expect(r.stdout).toMatch(/1 removed/)
    expect(items(root)).toEqual([
      expect.objectContaining({ id: 'role:admin', status: 'ignored', note: 'admins have their own guide' }),
      expect.objectContaining({ id: 'role:teacher', status: 'mapped', pages: ['teacher.sign-in'] }),
      expect.objectContaining({ id: 'route:/classes', status: 'removed' }),
      expect.objectContaining({ id: 'route:/login', status: 'mapped' }),
    ])
  })

  it('applies coverage include/exclude patterns', () => {
    const root = copyFixture()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8') + 'coverage: { include: ["route:*"], exclude: ["route:/classes"] }\n')
    runCli(['inventory'], root)
    expect(items(root).map((i) => i.id)).toEqual(['route:/login'])
  })
})
