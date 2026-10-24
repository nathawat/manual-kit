import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { outlineMock } from './helpers/outline-mock.ts'

const TOKEN = 'test-token-123'
const COLLECTION = 'dae52987-941e-47e3-8d75-d3b021e7666a'
let mocks: Awaited<ReturnType<typeof outlineMock>>[] = []
afterEach(async () => {
  for (const m of mocks) await m.close()
  mocks = []
})
async function setup(mockOpts: Parameters<typeof outlineMock>[0] = {}) {
  const mock = await outlineMock(mockOpts)
  mocks.push(mock)
  const root = await cleanFixture()
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, `${readFileSync(cfg, 'utf8')}\noutline: { baseUrl: "${mock.url}" }\n`)
  // a built PDF to attach to the book document
  const dist = join(root, 'manual/dist')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'user-guide.th.pdf'), '%PDF-1.4 fake')
  return { root, mock }
}
/** token null = no OUTLINE_API_KEY in the environment */
const publish = (root: string, args: string[], token: string | null = TOKEN) =>
  runCliAsync(['publish', 'outline', '--lang', 'th', ...args], root, { OUTLINE_API_KEY: token ?? '' })

describe('publish outline', () => {
  it('--dry-run prints the plan and sends nothing (no token needed)', async () => {
    const { root, mock } = await setup()
    const r = await publish(root, ['--collection', COLLECTION, '--dry-run'], null)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(mock.calls).toEqual([])
    expect(r.stdout).toContain(`collection ${COLLECTION}`)
    expect(r.stdout).toContain('dry run: nothing is sent')
    expect(r.stdout).toMatch(/create\s+book\s+user-guide\/th\s+"คู่มือการใช้งานระบบห้องเรียน: คู่มือผู้ใช้"/)
    expect(r.stdout).toMatch(/create\s+page\s+teacher\.sign-in\s+"1\. เข้าสู่ระบบ"/)
    expect(r.stdout).toMatch(/create\s+page\s+teacher\.create-class\s+"2\. สร้างห้องเรียน"/)
    expect(r.stdout).toMatch(/upload\s+media\/th\/login\.png/)
    expect(r.stdout).toMatch(/upload\s+dist\/user-guide\.th\.pdf/)
    expect(existsSync(join(root, 'manual/outline.json'))).toBe(false)
  })

  it('creates one document per book and per page, uploads media once, rewrites links; re-publishing changes nothing', async () => {
    const { root, mock } = await setup()
    const r = await publish(root, ['--collection', 'Hq7RtK2xWm', '--parent', 'parent-doc'])
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(`${r.stdout}${readFileSync(join(root, 'manual/outline.json'), 'utf8')}`).not.toContain(TOKEN)
    for (const c of mock.calls) expect(c.auth).toBe(`Bearer ${TOKEN}`)
    const creates = mock.calls.filter((c) => c.path === '/api/documents.create')
    expect(creates.map((c) => c.body.title)).toEqual(['คู่มือการใช้งานระบบห้องเรียน: คู่มือผู้ใช้', '1. เข้าสู่ระบบ', '2. สร้างห้องเรียน'])
    expect(creates[0]!.body).toMatchObject({ collectionId: COLLECTION, parentDocumentId: 'parent-doc', publish: true })
    expect(creates[1]!.body).toMatchObject({ collectionId: COLLECTION, parentDocumentId: 'doc-1', publish: true })
    const page = [...mock.docs.values()].find((d) => d.title === '1. เข้าสู่ระบบ')!
    expect(page.text).toMatch(/!\[ภาพที่ 1-1 [^\]]*\]\(\/api\/attachments\.redirect\?id=att-\d+\)/)
    expect(page.text).not.toContain('media/')
    expect(page.text).not.toMatch(/\{#fig/)
    // [[teacher.create-class]] points at the published document
    expect(page.text).toContain('](/doc/d-3-u3)')
    const book = mock.docs.get('doc-1')!
    expect(book.text).toMatch(/\[[^\]]*PDF[^\]]*\]\(\/api\/attachments\.redirect\?id=att-\d+\)/)
    expect(book.text).toContain('[1. เข้าสู่ระบบ](/doc/d-2-u2)')
    // login.png is used by the th page only once: one upload per distinct file
    const uploads = mock.calls.filter((c) => c.path === '/api/attachments.create').map((c) => c.body.name)
    expect(new Set(uploads).size).toBe(uploads.length)
    expect(mock.uploads.every((u) => u.auth === `Bearer ${TOKEN}`)).toBe(true)
    const map = JSON.parse(readFileSync(join(root, 'manual/outline.json'), 'utf8')) as { collection: { id: string }; documents: Record<string, { id: string }> }
    expect(map.collection.id).toBe(COLLECTION)
    expect(Object.keys(map.documents).sort()).toEqual(['user-guide/th', 'user-guide/th/teacher.create-class', 'user-guide/th/teacher.sign-in'])

    // again: nothing created, uploaded or updated
    const before = mock.calls.length
    const again = await publish(root, ['--collection', 'Hq7RtK2xWm', '--parent', 'parent-doc'])
    expect(again.code).toBe(0)
    const later = mock.calls.slice(before).map((c) => c.path)
    expect(later.filter((p) => p !== '/api/collections.info' && p !== '/api/documents.info')).toEqual([])
    expect(again.stdout).toMatch(/unchanged\s+page\s+teacher\.sign-in/)

    // an edited page updates that document only
    const file = join(root, 'manual/pages/th/user-guide/01-sign-in.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('ระบบเปิดหน้าห้องเรียน', 'ระบบเปิดหน้ารายการห้องเรียน'))
    const n = mock.calls.length
    expect((await publish(root, ['--collection', 'Hq7RtK2xWm', '--parent', 'parent-doc'])).code).toBe(0)
    const updates = mock.calls.slice(n).filter((c) => c.path === '/api/documents.update')
    expect(updates.map((c) => c.body.id)).toEqual(['doc-2'])
    expect(mock.docs.get('doc-2')!.text).toContain('ระบบเปิดหน้ารายการห้องเรียน')
  })

  it('a book\'s outline.title replaces the book document title', async () => {
    const { root } = await setup()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('user-guide: { title: { th: คู่มือผู้ใช้, en: User guide } }', 'user-guide: { title: { th: คู่มือผู้ใช้, en: User guide }, outline: { title: { th: "คู่มือผู้ใช้ (user-guide)" } } }'))
    const r = await publish(root, ['--collection', COLLECTION, '--dry-run'], null)
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/create\s+book\s+user-guide\/th\s+"คู่มือผู้ใช้ \(user-guide\)"/)
  })

  it('a document deleted in Outline is created again', async () => {
    const { root, mock } = await setup()
    expect((await publish(root, ['--collection', COLLECTION])).code).toBe(0)
    mock.docs.delete('doc-2')
    const n = mock.calls.length
    expect((await publish(root, ['--collection', COLLECTION])).code).toBe(0)
    expect(mock.calls.slice(n).filter((c) => c.path === '/api/documents.create').map((c) => c.body.title)).toEqual(['1. เข้าสู่ระบบ'])
  })

  it('needs the wiki address: there is no default wiki', async () => {
    const root = await cleanFixture()
    const r = await publish(root, ['--collection', COLLECTION, '--dry-run'])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/outline\.baseUrl/)
  })

  it('needs OUTLINE_API_KEY from the environment, and a collection', async () => {
    const { root, mock } = await setup()
    const r = await publish(root, ['--collection', COLLECTION], null)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/OUTLINE_API_KEY/)
    expect(mock.calls).toEqual([])
    const r2 = await publish(root, [])
    expect(r2.code).toBe(2)
    expect(r2.stderr).toMatch(/--collection/)
  })

  it('refuses to publish into another collection than the one in outline.json', async () => {
    const { root } = await setup()
    expect((await publish(root, ['--collection', COLLECTION])).code).toBe(0)
    const map = join(root, 'manual/outline.json')
    writeFileSync(map, readFileSync(map, 'utf8').replace(COLLECTION, 'other-collection'))
    const r = await publish(root, ['--collection', COLLECTION])
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/outline\.json.*other-collection/)
  })

  it('never sends the token to an upload address on another host', async () => {
    const other = await outlineMock()
    mocks.push(other)
    const { root, mock } = await setup({ uploadOrigin: other.url })
    expect((await publish(root, ['--collection', COLLECTION])).code).toBe(0)
    expect(other.uploads.length).toBeGreaterThan(0)
    expect(other.uploads.every((u) => u.auth === undefined)).toBe(true)
    expect(mock.uploads).toEqual([])
  })
})
