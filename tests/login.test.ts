import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runLogin } from '../src/login.ts'
import { openProject } from '../src/project.ts'
import { LoginSpec, ShotSpec, loadShots, specHash } from '../src/shots.ts'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'

const listen = async (server: Server) => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return (server.address() as { port: number }).port
}

/**
 * An app on 127.0.0.1 whose sign-in lives on another host (localhost, outside the allowlist), like SSO: /home.html
 * without a valid session redirects there; the SSO page's button returns to the app, which sets the session cookie.
 * `expire()` forgets every session, as a server does when a session times out.
 */
async function ssoApp() {
  const sessions = new Set<string>()
  const ssoHits: string[] = []
  let appUrl = ''
  const sso = createServer((req, res) => {
    ssoHits.push(req.url ?? '')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><body><a id="approve" href="${appUrl}/callback?code=one-time">Approve</a></body></html>`)
  })
  const ssoUrl = `http://localhost:${await listen(sso)}`
  const app = createServer((req, res) => {
    const url = new URL(req.url ?? '/', appUrl)
    const sid = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
    if (url.pathname === '/callback') {
      const id = `s${sessions.size + 1}-secret-value`
      sessions.add(id)
      return void res.writeHead(302, { location: '/home.html', 'set-cookie': `sid=${id}; Path=/; HttpOnly` }).end()
    }
    const page = (body: string) => void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><body>${body}</body></html>`)
    const signedIn = !!sid && sessions.has(sid)
    if (url.pathname === '/home.html') return signedIn ? page('<p id="user">Signed in</p>') : void res.writeHead(302, { location: `${ssoUrl}/signin` }).end()
    if (url.pathname === '/dashboard.html') return signedIn ? page('<p id="user">Dashboard</p>') : void res.writeHead(302, { location: '/signed-out.html' }).end()
    if (url.pathname === '/signed-out.html') return page('<p>Your session ended</p>')
    res.writeHead(404).end()
  })
  appUrl = `http://127.0.0.1:${await listen(app)}`
  const close = (s: Server) => new Promise<void>((r) => s.close(() => r()))
  return { appUrl, ssoHits, expire: () => sessions.clear(), close: async () => Promise.all([close(app), close(sso)]) }
}

async function project(appUrl: string, login: string) {
  const root = await cleanFixture()
  rmSync(join(root, 'manual/media'), { recursive: true })
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', appUrl).replace('capture:\n', 'capture:\n  allowlist: [127.0.0.1]\n'))
  writeFileSync(
    join(root, 'manual/shots.yaml'),
    `logins:\n  main:\n${login}shots:\n  login:\n    url: /home.html\n    login: main\n    caption: home\n    actions: [{ wait: "#user" }]\n`,
  )
  return root
}
const SAVED = '    url: /home.html\n    storageState: true\n    until: { selector: "#user" }\n'
const signIn = (page: import('playwright').Page) => page.click('#approve')
const never = () => new Promise<void>(() => {})

describe('manual-kit login', () => {
  it('saves the session after a sign-in on a host outside the allowlist; capture reuses it without signing in', async () => {
    const site = await ssoApp()
    try {
      const root = await project(site.appUrl, SAVED)
      const said: string[] = []
      const file = await runLogin(await openProject(join(root, 'manual')), 'main', { headless: true, enter: never, person: signIn, say: (l) => said.push(l) })
      expect(file).toBe(join(root, 'manual/.auth/main.json'))
      expect(said).toEqual(['Sign in in the browser window. manual-kit saves the session when #user appears, or press Enter once you are signed in.'])
      const state = JSON.parse(readFileSync(file, 'utf8')) as { cookies: { name: string; value: string }[] }
      expect(state.cookies.find((c) => c.name === 'sid')?.value).toBe('s1-secret-value')
      expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(readFileSync(join(root, 'manual/.auth/.gitignore'), 'utf8')).toBe('*\n')
      expect(site.ssoHits).toEqual(['/signin'])

      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(r.code).toBe(0)
      expect(r.stdout).toMatch(/captured 2/)
      expect(site.ssoHits).toEqual(['/signin'])
      expect(r.stdout).not.toContain('secret-value')
      expect(existsSync(join(root, 'manual/media/th/login.png'))).toBe(true)
    } finally {
      await site.close()
    }
  })

  it('without until, waits for Enter', async () => {
    const site = await ssoApp()
    try {
      const root = await project(site.appUrl, '    url: /home.html\n    storageState: true\n')
      let signedIn!: () => void
      const enter = () => new Promise<void>((r) => (signedIn = r))
      const said: string[] = []
      const file = await runLogin(await openProject(join(root, 'manual')), 'main', {
        headless: true,
        enter,
        person: async (page) => {
          await signIn(page)
          await page.waitForSelector('#user')
          signedIn()
        },
        say: (l) => said.push(l),
      })
      expect(said).toEqual(['Sign in in the browser window, then press Enter here.'])
      expect(readFileSync(file, 'utf8')).toContain('s1-secret-value')
    } finally {
      await site.close()
    }
  })

  it('refuses a login that signs in with actions, and an unknown name', async () => {
    const root = await project('http://127.0.0.1:9', '    url: /signin\n    actions: [{ click: "#in" }]\n')
    const p = await openProject(join(root, 'manual'))
    await expect(runLogin(p, 'main', { headless: true })).rejects.toThrow('login "main" signs in with actions during capture; to sign in by hand instead, give it storageState: true (and until) in shots.yaml')
    await expect(runLogin(p, 'admin', { headless: true })).rejects.toThrow('login "admin" is not in shots.yaml logins (main)')
    const cli = await runCliAsync(['login', 'admin'], root)
    expect(cli.code).toBe(2)
    expect(cli.stderr).toBe('manual-kit: login "admin" is not in shots.yaml logins (main)\n')
  })
})

describe('capture with a saved login', () => {
  it('a missing session stops before the browser opens and names the command', async () => {
    const root = await project('http://127.0.0.1:9', SAVED)
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toBe(`manual-kit: login "main": no saved session (${join('manual', '.auth', 'main.json')} does not exist); sign in by hand with: manual-kit login main\n`)
  })

  it('an expired session (redirected to the sign-in host) says so and names the command; or lands on a signed-out page', async () => {
    const site = await ssoApp()
    try {
      const root = await project(site.appUrl, SAVED)
      await runLogin(await openProject(join(root, 'manual')), 'main', { headless: true, enter: never, person: signIn, say: () => {} })
      site.expire()
      const before = [...site.ssoHits]
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(2)
      expect(r.stderr).toBe(`manual-kit: login "main": the saved session has expired (the start page went to localhost, outside capture.allowlist); sign in again with: manual-kit login main\n`)
      // the redirect to the sign-in host is refused before the request leaves
      expect(site.ssoHits).toEqual(before)

      // an app that sends an expired session to its own signed-out page: check says where signed in is
      const shots = join(root, 'manual/shots.yaml')
      writeFileSync(shots, readFileSync(shots, 'utf8').replace(SAVED, '    url: /dashboard.html\n    storageState: true\n    check: { url: /dashboard.html }\n'))
      const gone = await runCliAsync(['capture'], root)
      expect(gone.code).toBe(2)
      expect(gone.stderr).toBe(`manual-kit: login "main": the saved session has expired (the start page is ${site.appUrl}/signed-out.html, not /dashboard.html); sign in again with: manual-kit login main\n`)
    } finally {
      await site.close()
    }
  })
})

describe('saved logins in shots.yaml', () => {
  it('action logins keep their spec hash', () => {
    const logins = { t: LoginSpec.parse({ url: '/signin', actions: [{ fill: '#u', value: '{env:U}' }, { click: '#go' }], storage: { localStorage: { a: 'b' } } }) }
    expect(specHash(ShotSpec.parse({ url: '/a', caption: 'x', login: 't' }), logins)).toBe('b4ba96ba6b82bcc2')
  })

  it('a login is either actions or storageState, and a saved login name must be a safe file name', async () => {
    const root = await project('http://127.0.0.1:9', '    url: /home.html\n    storageState: true\n    actions: [{ click: "#in" }]\n')
    expect(() => loadShots(join(root, 'manual'))).toThrow('logins.main: Unrecognized key: "actions"')
    writeFileSync(join(root, 'manual/shots.yaml'), 'logins:\n  main:\n    url: /\n    storageState: true\n    until: { css: "#x" }\n')
    expect(() => loadShots(join(root, 'manual'))).toThrow('logins.main.until: give { selector: "..." } (an element on the page) or { url: /path } (the address starts with it)')
    writeFileSync(join(root, 'manual/shots.yaml'), 'logins:\n  ../x:\n    url: /\n    storageState: true\n')
    expect(() => loadShots(join(root, 'manual'))).toThrow('login "../x": a login with storageState needs a name of letters, digits, - and _')
  })
})
