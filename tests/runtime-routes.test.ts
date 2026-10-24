import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runtimeOnly } from '../src/runtime-routes.ts'
import { runCliAsync } from './helpers/cli.ts'
import { copyFixture } from './helpers/fixture.ts'
import { serveStatic } from './helpers/server.ts'

let server: Awaited<ReturnType<typeof serveStatic>>
beforeAll(async () => {
  server = await serveStatic(join(__dirname, 'fixtures/vue-router-site'))
})
afterAll(() => server.close())

/** The fixture project (static routes /login and /classes) pointed at the fake router pages. */
function project(): string {
  const root = copyFixture()
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('baseUrl: http://127.0.0.1:4599', `baseUrl: ${server.url}\n  settle: { timeoutMs: 2000 }`))
  const shots = join(root, 'manual/shots.yaml')
  writeFileSync(shots, `logins:\n  admin: { url: /login.html, actions: [{ click: "#go" }, { wait: "body[data-done]" }] }\n${readFileSync(shots, 'utf8')}`)
  return root
}
const discover = async (root: string, args: string[]) => {
  const r = await runCliAsync(['discover', '--print', ...args], root)
  return { ...r, routes: r.code === 0 ? (JSON.parse(r.stdout).routes as { name: string; source: string; detail?: string }[]) : [] }
}

describe('discover --runtime', () => {
  it("reads Vue 3's __vue_app__ router, adds only the routes the code did not show, marked runtime", async () => {
    const r = await discover(project(), ['--runtime', '/vue3.html'])
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const runtime = r.routes.filter((x) => x.source === 'runtime')
    expect(runtime).toEqual([
      { name: '/about', source: 'runtime', detail: 'found only at runtime; alternates /th/about' },
      { name: '/reports/:year?', source: 'runtime', detail: 'found only at runtime' },
      { name: '/settings', source: 'runtime', detail: 'found only at runtime' },
      { name: '/users/:id', source: 'runtime', detail: 'found only at runtime' },
    ])
    expect(r.routes.find((x) => x.name === '/login')!.source).toBe('src/routes.ts')
  })

  it('reads Nuxt 2 window.$nuxt.$router (configured tree, children joined to the parent)', async () => {
    const r = await discover(project(), ['--runtime', '/vue2.html'])
    expect(r.code).toBe(0)
    expect(r.routes.filter((x) => x.source === 'runtime').map((x) => x.name)).toEqual(['/', '/shop', '/shop/cart'])
  })

  it('signs in first with --login (a login from shots.yaml)', async () => {
    const root = project()
    const without = await discover(root, ['--runtime', '/private.html'])
    expect(without.code).not.toBe(0)
    expect(without.stderr).toMatch(/no Vue Router found at .*private\.html.*--login <name>/)
    const signedIn = await discover(root, ['--runtime', '/private.html', '--login', 'admin'])
    expect(signedIn.code).toBe(0)
    expect(signedIn.routes.filter((x) => x.source === 'runtime').map((x) => x.name)).toEqual(['/admin'])
  })

  it('fails clearly without a router, outside the allowlist, with an unknown login, or without a config', async () => {
    const root = project()
    expect((await discover(root, ['--runtime', '/plain.html'])).stderr).toMatch(/no Vue Router found at .*plain\.html: looked for __vue_app__ on #__nuxt, #app/)
    expect((await discover(root, ['--runtime', 'https://example.com/'])).stderr).toMatch(/example\.com is not in capture\.allowlist/)
    expect((await discover(root, ['--runtime', '--login', 'nobody'])).stderr).toMatch(/login "nobody" is not in shots\.yaml \(logins: admin\)/)
    expect((await runCliAsync(['discover', '--login', 'admin'], root)).stderr).toMatch(/--login is used with --runtime/)
  })

  it('never runs without --runtime', async () => {
    const r = await discover(project(), [])
    expect(r.code).toBe(0)
    expect(r.routes.some((x) => x.source === 'runtime')).toBe(false)
  })
})

describe('runtimeOnly', () => {
  it("normalises Nuxt's :id() to :id, treats ___<locale> names as one route, and keeps an unknown alias", () => {
    const known = new Set(['/users/:id', '/about'])
    expect(
      runtimeOnly(known, [
        { path: '/users/:id()', name: 'users-id' },
        { path: '/th/about', name: 'about___th' },
        { path: '/about', name: 'about___en' },
        { path: '/th/news', name: 'news___th' },
        { path: '/news', name: 'news___en' },
        { path: '/team', name: 'about___en', aliasOf: '/about' },
      ]),
    ).toEqual([
      { name: '/news', source: 'runtime', detail: 'found only at runtime; alternates /th/news' },
      { name: '/team', source: 'runtime', detail: 'found only at runtime' },
    ])
  })
})
