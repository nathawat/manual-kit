import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCliAsync } from './helpers/cli.ts'
import { cleanFixture } from './helpers/fixture.ts'
import { countColor, darkest, pixel } from './helpers/png.ts'
import { serveStatic } from './helpers/server.ts'

let server: Awaited<ReturnType<typeof serveStatic>>
beforeAll(async () => {
  server = await serveStatic(join(__dirname, 'fixtures/project/site'))
})
afterAll(() => server.close())

const pngSize = (file: string) => {
  const b = readFileSync(file)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}
async function project(extra = '') {
  const root = await cleanFixture()
  rmSync(join(root, 'manual/media'), { recursive: true })
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('http://127.0.0.1:4599', server.url) + extra)
  return root
}

describe('capture', () => {
  it('takes screenshots per language and records the manifest; check then passes', async () => {
    const root = await project()
    const r = await runCliAsync(['capture'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    // one summary line, no line per image
    expect(r.stdout).toMatch(/^captured 2 \(2 shots\), 0 failed \(\d+\.\ds\)\n$/)
    for (const lang of ['th', 'en']) expect(pngSize(join(root, `manual/media/${lang}/login.png`))).toEqual({ width: 1280, height: 800 })
    // steps are not captured at media level "screenshots"
    expect(existsSync(join(root, 'manual/media/th/create-class-1.png'))).toBe(false)
    const manifest = JSON.parse(readFileSync(join(root, 'manual/media/manifest.json'), 'utf8')) as Record<string, string>
    expect(Object.keys(manifest)).toEqual(['en/shot/login', 'th/shot/login'])
    expect((await runCliAsync(['check'], root)).code).toBe(0)
  })

  it('--changed captures only what is missing or whose spec changed', async () => {
    const root = await project()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps'))
    expect((await runCliAsync(['capture'], root)).stdout).toMatch(/captured 4/)
    expect(pngSize(join(root, 'manual/media/en/create-class-2.png')).width).toBe(1280)
    expect((await runCliAsync(['capture', '--changed'], root)).stdout).toMatch(/captured 0/)
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('mask: [".email-hint"]', 'mask: [".email-hint", "#email"]'))
    const again = await runCliAsync(['capture', '--changed', '--verbose'], root)
    const lines = again.stdout.trimEnd().split('\n')
    expect(lines.slice(0, -1)).toEqual(['  th shot login', '  en shot login'])
    expect(lines.at(-1)).toMatch(/^captured 2 \(2 shots\), 0 failed \(/)
  })

  it('--changed also captures again what was deleted from disk: a shot, a step image, a clip frame or timeline', async () => {
    const root = await project()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps+video'))
    appendFileSync(join(root, 'manual/shots.yaml'), 'clips:\n  open-classes:\n    url: /classes.html\n    caption: Classes\n    segments:\n      - caption: New\n        highlight: "#new-class"\n        holdMs: 500\n')
    expect((await runCliAsync(['capture'], root)).stdout).toMatch(/captured 6 /)
    const deleted = ['th/login.png', 'en/create-class-2.png', 'th/clips/open-classes/frame-001.png', 'en/clips/open-classes/timeline.json']
    for (const f of deleted) rmSync(join(root, 'manual/media', f))
    expect(await runCliAsync(['shotlist'], root).then((r) => r.stdout)).toMatch(/## open-classes \(clip[^#]*Status: th: missing · en: missing/)
    const again = await runCliAsync(['capture', '--changed', '--verbose'], root)
    expect(again.stdout.trimEnd().split('\n').slice(0, -1)).toEqual(['  th shot login', '  th clip open-classes', '  en steps create-class', '  en clip open-classes'])
    for (const f of deleted) expect(existsSync(join(root, 'manual/media', f)), f).toBe(true)
    expect((await runCliAsync(['capture', '--changed'], root)).stdout).toMatch(/captured 0/)
  })

  it('warns when a mask selector matches nothing in any frame, since the private text it should cover would show', async () => {
    const root = await project()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('mask: [".email-hint"]', 'mask: [".email-hint", ".no-such-user-name"]'))
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/captured 2/)
    expect(r.stdout).toContain('warning th shot login: mask ".no-such-user-name" matched nothing, so nothing was covered')
    expect(r.stdout).toContain('warning en shot login: mask ".no-such-user-name" matched nothing')
    expect(r.stdout).not.toContain('.email-hint" matched nothing')
  })

  it('refuses a base URL outside the allowlist before opening anything', async () => {
    const root = await project('')
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, 'https://example.com'))
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/example\.com is not in capture\.allowlist/)
  })

  it('blocks requests and navigations to hosts outside the allowlist; a blocked stylesheet fails the shot', async () => {
    const root = await project()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('url: /login.html', 'url: /leak.html').replace('highlight: "#submit"', ''))
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(1)
    expect(r.stdout).toMatch(/blocked .*example\.com/)
    // the page script sends the page to example.com: refused, and the browser's error page is not photographed
    expect(r.stdout).toContain('failed th shot login: the page went to example.com, outside capture.allowlist')
    expect(r.stdout).toMatch(/^captured 0, 2 failed \(/m)
    expect(existsSync(join(root, 'manual/media/th/login.png'))).toBe(false)
    expect(existsSync(join(root, 'manual/media/manifest.json')) ? readFileSync(join(root, 'manual/media/manifest.json'), 'utf8') : '{}').not.toContain('shot/login')

    const site = await servePages({ '/styled.html': '<!doctype html><html><head><link rel="stylesheet" href="https://example.com/x.css"></head><body>x</body></html>' })
    try {
      const css = await runCliAsync(['capture'], await projectOn(site.url, 'shots:\n  styled:\n    url: /styled.html\n    caption: styled\n'))
      expect(css.code).toBe(1)
      expect(css.stdout).toMatch(/failed th shot styled: stylesheet .*example\.com.* capture\.assetHosts/)
    } finally {
      await site.close()
    }
  })

  it('capture.assetHosts lets pages load CSS/fonts/images from other hosts, but never navigate there', async () => {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    const assets = await serveStatic(site)
    const port = new URL(assets.url).port
    writeFileSync(join(site, 'style.css'), 'body { background: rgb(1, 2, 3); }')
    writeFileSync(join(site, 'page.html'), `<!doctype html><html><head><link rel="stylesheet" href="http://localhost:${port}/style.css"></head><body><button id="submit">x</button><a id="go" href="http://localhost:${port}/page.html">go</a></body></html>`)
    try {
      const root = await project()
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, assets.url).replace('capture:\n', 'capture:\n  allowlist: [127.0.0.1]\n  assetHosts: [localhost]\n'))
      const shots = join(root, 'manual/shots.yaml')
      writeFileSync(shots, readFileSync(shots, 'utf8').replace('url: /login.html', 'url: /page.html').replace('    mask: [".email-hint"]', ''))
      const ok = await runCliAsync(['capture'], root)
      expect(ok.stdout).toMatch(/captured 2/)
      expect(ok.code).toBe(0)
      // a navigation to an asset host is still refused
      writeFileSync(shots, readFileSync(shots, 'utf8').replace('highlight: "#submit"', 'highlight: "#submit"\n    actions: [{ goto: "http://localhost:' + port + '/page.html" }]'))
      const nav = await runCliAsync(['capture'], root)
      expect(nav.code).toBe(2)
      expect(nav.stderr).toMatch(/localhost is not in capture\.allowlist/)
    } finally {
      await assets.close()
    }
  })

  it('runs the project seed hook first and stops if it fails', async () => {
    const root = await project('')
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('capture:\n', 'capture:\n  seed: "echo seeded > seed.txt"\n'))
    expect((await runCliAsync(['capture'], root)).code).toBe(0)
    expect(readFileSync(join(root, 'seed.txt'), 'utf8').trim()).toBe('seeded')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('echo seeded > seed.txt', 'exit 3'))
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/seed hook failed/)
  })
})

describe('shotlist', () => {
  it('lists every shot with its pages and capture status', async () => {
    const root = await project()
    const r = await runCliAsync(['shotlist'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('## login')
    expect(r.stdout).toContain('teacher.sign-in')
    expect(r.stdout).toMatch(/th: missing/)
    expect(r.stdout).toContain('## create-class (2 steps)')
    await runCliAsync(['capture'], root)
    expect((await runCliAsync(['shotlist'], root)).stdout).toMatch(/th: captured/)
  })
})

describe('secrets in shots.yaml', () => {
  it('fill values read {env:NAME}; a missing variable stops capture with its name', async () => {
    const { expandEnv } = await import('../src/capture.ts')
    expect(expandEnv('pw={env:MK_X}', { MK_X: 's3cret' })).toBe('pw=s3cret')
    expect(() => expandEnv('{env:MK_MISSING}', {})).toThrow(/MK_MISSING/)
    const root = await project()
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('    mask: [".email-hint"]', '    mask: [".email-hint"]\n    actions: [{ fill: "#email", value: "{env:MK_NOT_SET_ANYWHERE}" }]'))
    const r = await runCliAsync(['capture'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/MK_NOT_SET_ANYWHERE/)
  })
})

describe('logged-in shots', () => {
  it('a named login runs once per language and is reused; per-shot storage sets localStorage, sessionStorage and cookies', async () => {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    writeFileSync(join(site, 'signin.html'), `<!doctype html><html><body><button id="in" onclick="localStorage.setItem('auth','ok');document.cookie='sid=42;path=/';document.body.insertAdjacentHTML('beforeend','<p id=done>in</p>')">in</button></body></html>`)
    const ok = `localStorage.getItem('auth')==='ok' && document.cookie.includes('sid=42')`
    writeFileSync(join(site, 'home.html'), `<!doctype html><html><body><main id="m">home</main><script>if (${ok}) document.body.insertAdjacentHTML('beforeend','<p id=ok>ok</p>')</script></body></html>`)
    writeFileSync(
      join(site, 'prefs.html'),
      `<!doctype html><html><body><main>prefs</main><script>if (${ok} && /^dark-(th|en)$/.test(localStorage.getItem('theme') || '') && sessionStorage.getItem('tab') === '2' && document.cookie.includes('consent=yes')) document.body.insertAdjacentHTML('beforeend','<p id=ok>ok</p>')</script></body></html>`,
    )
    const srv = await serveStatic(site)
    try {
      const root = await project()
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, srv.url))
      writeFileSync(
        join(root, 'manual/shots.yaml'),
        `logins:
  teacher:
    url: /signin.html
    actions: [{ click: "#in" }, { wait: "#done" }]
shots:
  login:
    url: /home.html
    login: teacher
    caption: home
    actions: [{ wait: "#ok" }]
  prefs:
    url: /prefs.html
    login: teacher
    caption: prefs
    storage:
      localStorage: { theme: "dark-{lang}" }
      sessionStorage: { tab: "2" }
      cookies: [{ name: consent, value: "yes" }]
    actions: [{ wait: "#ok" }]
steps: {}
`,
      )
      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(r.stdout).toMatch(/captured 4/)
      expect(srv.hits.filter((h) => h === '/signin.html')).toHaveLength(2) // once per language, not per shot
      // an unknown login name is a clear error
      writeFileSync(join(root, 'manual/shots.yaml'), readFileSync(join(root, 'manual/shots.yaml'), 'utf8').replace('login: teacher\n    caption: prefs', 'login: admin\n    caption: prefs'))
      const bad = await runCliAsync(['capture'], root)
      expect(bad.code).toBe(2)
      expect(bad.stderr).toMatch(/login "admin" is not in logins/)
      // a login page outside the allowlist is refused before the browser opens
      writeFileSync(join(root, 'manual/shots.yaml'), readFileSync(join(root, 'manual/shots.yaml'), 'utf8').replace('login: admin', 'login: teacher').replace('url: /signin.html', 'url: https://example.com/signin'))
      const outside = await runCliAsync(['capture'], root)
      expect(outside.code).toBe(2)
      expect(outside.stderr).toMatch(/login "teacher": example\.com is not in capture\.allowlist/)
    } finally {
      await srv.close()
    }
  })
})

describe('framing', () => {
  it('maxHeight keeps the top of the screen, crop takes a region, element + maxHeight keeps the top of the element', async () => {
    const root = await project()
    writeFileSync(
      join(root, 'manual/shots.yaml'),
      `shots:
  top:
    url: /login.html
    caption: top
    maxHeight: 300
  region:
    url: /login.html
    caption: region
    crop: { x: 10, y: 20, width: 400, height: 200 }
  part:
    url: /login.html
    caption: part
    element: main
    maxHeight: 20
  bad:
    url: /login.html
    caption: bad
    element: main
    crop: { x: 0, y: 0, width: 10, height: 10 }
`,
    )
    const invalid = await runCliAsync(['capture'], root)
    expect(invalid.code).toBe(2)
    expect(invalid.stderr).toMatch(/element and crop/)
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace(/  bad:[\s\S]*$/, ''))
    const r = await runCliAsync(['capture'], root)
    expect(r.stderr).toBe('')
    expect(pngSize(join(root, 'manual/media/en/top.png'))).toEqual({ width: 1280, height: 300 })
    expect(pngSize(join(root, 'manual/media/en/region.png'))).toEqual({ width: 400, height: 200 })
    const part = pngSize(join(root, 'manual/media/en/part.png'))
    expect(part.height).toBe(20)
    expect(part.width).toBeLessThanOrEqual(1280)
  })
})

describe('actions and hiding', () => {
  const page = `<!doctype html><html><head><style>
  body { margin: 0; background: rgb(0, 160, 0); height: 100vh }
  .promo { position: fixed; right: 0; bottom: 0; width: 120px; height: 120px; background: rgb(0, 0, 255) }
  nextjs-portal { position: fixed; inset: 0; background: rgb(255, 0, 0) }
  </style></head><body>
  <select id="kind"><option value="a">Apple</option><option value="b">Banana</option><option value="c">Cherry</option></select>
  <select id="size"><option value="s">Small</option><option value="l">Large</option></select>
  <input type="checkbox" id="agree"><input type="checkbox" id="news" checked>
  <div id="menu" onmouseenter="this.dataset.hover = '1'">menu</div>
  <input id="q" onkeydown="if (event.key === 'Enter') this.dataset.entered = '1'">
  <button id="go" onclick="
    const ok = document.getElementById('kind').value === 'b' && document.getElementById('size').value === 'l'
      && document.getElementById('agree').checked && !document.getElementById('news').checked
      && document.getElementById('menu').dataset.hover === '1' && document.getElementById('q').dataset.entered === '1'
    if (ok) document.body.insertAdjacentHTML('beforeend', '<p id=ok>ok</p>')">go</button>
  <div class="promo"></div>
  <nextjs-portal></nextjs-portal>
  </body></html>`

  async function setup(shotsYaml: string, extraConfig = '') {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    writeFileSync(join(site, 'form.html'), page)
    const srv = await serveStatic(site)
    const root = await project(extraConfig)
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, srv.url))
    writeFileSync(join(root, 'manual/shots.yaml'), shotsYaml)
    return { root, srv }
  }

  it('select (by value or label), check, uncheck, hover and press on an element run before the image', async () => {
    const { root, srv } = await setup(`shots:
  login:
    url: /form.html
    caption: form
    actions:
      - { select: "#kind", value: b }
      - { select: "#size", label: Large }
      - { check: "#agree" }
      - { uncheck: "#news" }
      - { hover: "#menu" }
      - { press: Enter, on: "#q" }
      - { click: "#go" }
      - { wait: "#ok" }
`)
    try {
      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(r.stdout).toMatch(/captured 2/)
    } finally {
      await srv.close()
    }
  })

  it('known dev overlays are hidden by default, hide: hides more; capture.hide overrides the built-in list; viewport per shot', async () => {
    const shots = `shots:
  login:
    url: /form.html
    caption: form
  hidden:
    url: /form.html
    caption: hidden
    hide: [".promo"]
  phone:
    url: /form.html
    caption: phone
    viewport: { width: 390, height: 600 }
`
    const { root, srv } = await setup(shots)
    try {
      expect((await runCliAsync(['capture'], root)).stdout).toMatch(/captured 6/)
      const media = (f: string) => join(root, 'manual/media/en', f)
      expect(pixel(media('login.png'), 5, 400)).toEqual([0, 160, 0]) // nextjs-portal hidden
      expect(pixel(media('login.png'), 1275, 795)).toEqual([0, 0, 255]) // promo visible
      expect(pixel(media('hidden.png'), 1275, 795)).toEqual([0, 160, 0])
      expect(pngSize(media('phone.png'))).toEqual({ width: 390, height: 600 })
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(/capture:\n/, 'capture:\n  hide: []\n'))
      expect((await runCliAsync(['capture'], root)).code).toBe(0)
      expect(pixel(media('login.png'), 5, 400)).toEqual([255, 0, 0])
    } finally {
      await srv.close()
    }
  })
})

describe('redaction', () => {
  const checker = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><defs><pattern id='c' width='4' height='4' patternUnits='userSpaceOnUse'><rect width='2' height='2'/><rect x='2' y='2' width='2' height='2'/></pattern></defs><rect width='80' height='80' fill='#fff'/><rect width='80' height='80' fill='url(#c)'/></svg>`,
  )
  const page = `<!doctype html><html><head><style>
  body { margin: 0; background: #fff }
  .at { position: absolute; left: 20px; margin: 0; font: 700 28px/1 sans-serif; color: #000 }
  </style></head><body>
  <p class="at" style="top: 20px">teacher@example.com</p>
  <p class="at" style="top: 120px">Classes</p>
  <img class="signature at" style="top: 220px; width: 80px; height: 80px" src="data:image/svg+xml,${checker}">
  <button id="next" class="at" style="top: 400px" onclick="this.textContent = 'done'">next</button>
  </body></html>`

  async function setup(redact: string) {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    writeFileSync(join(site, 'profile.html'), page)
    const srv = await serveStatic(site)
    const root = await project()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, srv.url).replace('capture:\n', `capture:\n  redact: ${redact}\n`).replace('media: screenshots', 'media: steps'))
    writeFileSync(
      join(root, 'manual/shots.yaml'),
      `shots:
  login: { url: /profile.html, caption: profile }
steps:
  create-class:
    url: /profile.html
    steps:
      - { text: one }
      - { text: two, actions: [{ click: "#next" }] }
`,
    )
    return { root, srv }
  }
  const email = (f: string) => darkest(f, 20, 20, 300, 48)
  const visible = (f: string) => darkest(f, 20, 120, 120, 148)

  it('blurs matching text and images in shots and in every step, and leaves the rest sharp', async () => {
    const { root, srv } = await setup('{ presets: [email], images: [".signature"] }')
    try {
      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(r.stdout).toMatch(/captured 4/)
      expect(r.stdout).not.toMatch(/matched nothing/)
      for (const f of ['th/login.png', 'en/create-class-1.png', 'en/create-class-2.png'].map((x) => join(root, 'manual/media', x))) {
        expect(visible(f)).toBeLessThan(40)
        expect(email(f)).toBeGreaterThan(80)
        const [g] = pixel(f, 60, 260)
        expect(g).toBeGreaterThan(60)
        expect(g).toBeLessThan(200)
        expect(countColor(f, [0x9a, 0xa3, 0xad])).toBe(0)
      }
    } finally {
      srv.close()
    }
  })

  it('blurs the screenshot of a page where capture failed', async () => {
    const { root, srv } = await setup('{ presets: [email] }')
    try {
      writeFileSync(join(root, 'manual/shots.yaml'), 'shots:\n  login: { url: /profile.html, caption: profile, highlight: "#gone" }\n')
      const r = await runCliAsync(['capture'], root)
      expect(r.stdout).toMatch(/failed th shot login/)
      const f = join(root, 'manual/.manual-kit/failures/th-shot-login.png')
      expect(visible(f)).toBeLessThan(40)
      expect(email(f)).toBeGreaterThan(80)
    } finally {
      srv.close()
    }
  })

  it('box paints grey boxes; without redact nothing is covered', async () => {
    const boxed = await setup('{ style: box, text: ["teacher@\\\\w+\\\\.com"] }')
    const plain = await setup('{}')
    try {
      for (const { root } of [boxed, plain]) expect((await runCliAsync(['capture'], root)).stdout).toMatch(/captured 4/)
      const b = join(boxed.root, 'manual/media/th/login.png')
      expect(countColor(b, [0x9a, 0xa3, 0xad])).toBeGreaterThan(280 * 28)
      expect(visible(b)).toBeLessThan(40)
      const p = join(plain.root, 'manual/media/th/login.png')
      expect(email(p)).toBeLessThan(40)
      expect(countColor(p, [0x9a, 0xa3, 0xad])).toBe(0)
    } finally {
      boxed.srv.close()
      plain.srv.close()
    }
  })
})

describe('spec hash stability', () => {
  it('specs captured before `hide` existed keep their hash (no recapture after upgrading)', async () => {
    const { ShotSpec, specHash } = await import('../src/shots.ts')
    expect(specHash(ShotSpec.parse({ url: '/a', caption: 'x', actions: [{ click: '#b' }] }))).toBe('147f19538897feda')
    expect(specHash(ShotSpec.parse({ url: '/a', caption: 'x', actions: [{ click: '#b' }], hide: ['.x'] }))).not.toBe('147f19538897feda')
  })
})

describe('highlight inside a modal dialog', () => {
  it('draws the frame above the dialog (top layer), not behind it', async () => {
    const site = mkdtempSync(join(tmpdir(), 'mk-site-'))
    writeFileSync(
      join(site, 'modal.html'),
      `<!doctype html><html><head><style>
      body { margin: 0; background: rgb(0, 160, 0); height: 100vh }
      dialog { margin: 0; position: fixed; left: 100px; top: 100px; width: 400px; height: 300px; padding: 0; border: 0; background: #fff }
      dialog::backdrop { background: rgb(0 0 0 / 0.5) }
      #inner { position: absolute; left: 50px; top: 50px; width: 200px; height: 40px; margin: 0; border: 0; background: #eee }
      </style></head><body><dialog id="d"><input id="inner"></dialog><script>document.getElementById('d').showModal()</script></body></html>`,
    )
    const srv = await serveStatic(site)
    try {
      const root = await project()
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, srv.url))
      writeFileSync(join(root, 'manual/shots.yaml'), 'shots:\n  login:\n    url: /modal.html\n    caption: modal\n    highlight: "#inner"\n')
      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(pixel(join(root, 'manual/media/en/login.png'), 146, 170)).toEqual([209, 36, 47])
    } finally {
      await srv.close()
    }
  })
})

/** Pages from a map on 127.0.0.1; `/hang` never answers, like a long-polling request. */
async function servePages(pages: Record<string, string>) {
  const { createServer } = await import('node:http')
  const open = new Set<import('node:http').ServerResponse>()
  const server = createServer((req, res) => {
    if (req.url === '/hang') return void open.add(res)
    if (req.method === 'POST') {
      // the byte count the server received, to show a request body arrived whole
      let n = 0
      req.on('data', (c: Buffer) => (n += c.length)).on('end', () => res.end(String(n)))
      return
    }
    const body = pages[req.url ?? '']
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }).end(body)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const close = () => new Promise<void>((r) => {
    for (const res of open) res.destroy()
    server.close(() => r())
  })
  return { url, close }
}

async function projectOn(url: string, shotsYaml: string, captureConfig = '') {
  const root = await project()
  const cfg = join(root, 'manual/manual.config.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(server.url, url).replace('capture:\n', `capture:\n${captureConfig}`))
  writeFileSync(join(root, 'manual/shots.yaml'), shotsYaml)
  return root
}

const RED: [number, number, number] = [255, 0, 0]

describe('settling before each image', () => {
  const late = `<!doctype html><html><body style="margin:0;background:#fff">
  <div class="spinner" style="width:80px;height:80px;background:rgb(255,0,0)"></div>
  <script>setTimeout(() => { document.querySelector('.spinner').remove(); document.body.insertAdjacentHTML('beforeend', '<main id=done>loaded</main>') }, 1500)</script>
  </body></html>`
  const forever = `<!doctype html><html><body><div class="animate-spin" style="width:20px;height:20px;background:#000"></div><script>fetch('/hang')</script></body></html>`

  it('waits for a loading spinner to disappear, without waitMs; a page that never settles is shot anyway with a warning', async () => {
    const site = await servePages({ '/late.html': late, '/forever.html': forever })
    try {
      const root = await projectOn(site.url, `shots:\n  login:\n    url: /late.html\n    caption: late\n`)
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(0)
      expect(r.stdout).not.toContain('warning')
      for (const lang of ['th', 'en']) expect(countColor(join(root, `manual/media/${lang}/login.png`), RED)).toBe(0)

      // the same page without spinner detection shows the spinner: the wait above is what removed it
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('capture:\n', 'capture:\n  settle: { spinners: [], networkIdle: false }\n'))
      expect((await runCliAsync(['capture'], root)).code).toBe(0)
      expect(countColor(join(root, 'manual/media/en/login.png'), RED)).toBe(80 * 80)

      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('settle: { spinners: [], networkIdle: false }', 'settle: { timeoutMs: 1000 }'))
      writeFileSync(join(root, 'manual/shots.yaml'), `shots:\n  login:\n    url: /forever.html\n    caption: forever\n`)
      const slow = await runCliAsync(['capture'], root)
      expect(slow.code).toBe(0)
      expect(slow.stdout).toMatch(/captured 2/)
      expect(slow.stdout).toContain(
        `warning en shot login: page did not settle within 1s, image taken anyway: 1 request to ${new URL(site.url).host} still open; spinner .animate-spin still visible`,
      )
    } finally {
      await site.close()
    }
  })
})

describe('a step that does not wait for the page to settle', () => {
  it('photographs a message that closes itself before the page settles, with settle: false', async () => {
    const page = `<!doctype html><html><body><div class="animate-spin" style="width:20px;height:20px"></div>
    <button id="go" onclick="document.body.insertAdjacentHTML('beforeend', '<p id=toast>saved</p>'); setTimeout(() => document.getElementById('toast').remove(), 1500)">go</button>
    </body></html>`
    const site = await servePages({ '/save.html': page })
    try {
      const steps = (settle: string) => `steps:\n  save:\n    url: /save.html\n    steps:\n      - { text: saved, actions: [{ click: "#go" }], highlight: "#toast"${settle} }\n`
      const root = await projectOn(site.url, steps(''))
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps').replace('capture:\n', 'capture:\n  settle: { timeoutMs: 3000 }\n'))
      const waited = await runCliAsync(['capture'], root)
      expect(waited.stdout).toMatch(/failed en steps save: highlight "#toast"/)

      writeFileSync(join(root, 'manual/shots.yaml'), steps(', settle: false'))
      const r = await runCliAsync(['capture'], root)
      expect(r.stdout).toMatch(/captured 2 \(2 step sets\), 0 failed/)
      expect(countColor(join(root, 'manual/media/en/save-1.png'), [0xd1, 0x24, 0x2f])).toBeGreaterThan(0)
    } finally {
      await site.close()
    }
  })
})

describe('failure diagnostics', () => {
  it('a failed login names the hosts the allowlist blocked and saves the page', async () => {
    const sso = await servePages({})
    // the sign-in button appears only after the SSO API answers, and that API's host is not on the allowlist
    const signin = `<!doctype html><html><body><p>Signing in</p><script>
      fetch('http://localhost:${new URL(sso.url).port}/session').then(() => document.body.insertAdjacentHTML('beforeend', '<button id=in>in</button>')).catch(() => {})
    </script></body></html>`
    const app = await servePages({ '/signin.html?code=secret-code': signin })
    try {
      const root = await projectOn(
        app.url,
        `logins:\n  teacher:\n    url: /signin.html?code=secret-code\n    actions: [{ click: "#in" }]\nshots:\n  login:\n    url: /home.html\n    login: teacher\n    caption: home\n`,
        '  allowlist: [127.0.0.1]\n',
      )
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(2)
      expect(r.stderr).toContain('login "teacher" (th) failed: click "#in": no element matches')
      expect(r.stderr).toContain('blocked by capture allowlist: localhost (add it to capture.allowlist in manual.config.yaml')
      expect(r.stderr).toContain(`page at failure: ${join('manual', '.manual-kit', 'failures', 'login-teacher-th.png')} (${app.url}/signin.html)`)
      expect(r.stderr).not.toContain('secret-code')
      expect(readFileSync(join(root, 'manual/.manual-kit/failures/login-teacher-th.png')).subarray(1, 4).toString()).toBe('PNG')
      expect(readFileSync(join(root, 'manual/.manual-kit/.gitignore'), 'utf8')).toBe('*\n')
    } finally {
      await sso.close()
      await app.close()
    }
  })

  it('a selector that matches nothing suggests similar elements; one without a box says so; other shots still capture', async () => {
    const page = `<!doctype html><html><body>
    <button data-testid="save-button">Save</button><button>Save draft</button><button data-cy="save-later">Later</button>
    <div class="wrap" style="display:contents"><span style="display:none">inside</span></div>
    <a class="tab" style="display:none">Classes</a><a class="tab">Classes</a>
    </body></html>`
    const site = await servePages({ '/form.html': page })
    try {
      const root = await projectOn(
        site.url,
        `shots:
  missing:
    url: /form.html
    caption: missing
    highlight: "#save-btn"
  contents:
    url: /form.html
    caption: contents
    highlight: ".wrap"
  twice:
    url: /form.html
    caption: twice
    highlight: ".tab"
  fine:
    url: /form.html
    caption: fine
`,
      )
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(1)
      expect(r.stdout).toMatch(/captured 2 \(2 shots\), 6 failed/)
      expect(r.stdout).toContain(
        'failed en shot missing: highlight "#save-btn": no element matches; similar elements on the page:\n    button "Save" -> [data-testid="save-button"]\n    button "Later" -> [data-cy="save-later"]\n    button "Save draft" -> button:text-is("Save draft")',
      )
      expect(r.stdout).toContain('failed en shot contents: highlight ".wrap": the element has no box on the page (the element matches but has no visible box')
      expect(r.stdout).toContain(
        'failed en shot twice: highlight ".tab": 2 elements match ("Classes" hidden, "Classes"); pick one with ".tab >> visible=true" or by exact text, e.g. ".tab:text-is(\\"Classes\\")"',
      )
      expect(r.stdout).toContain(`page at failure: ${join('manual', '.manual-kit', 'failures', 'en-shot-missing.png')}`)
      expect(existsSync(join(root, 'manual/.manual-kit/failures/en-shot-missing.png'))).toBe(true)
      expect(existsSync(join(root, 'manual/media/en/fine.png'))).toBe(true)
      expect(existsSync(join(root, 'manual/media/en/missing.png'))).toBe(false)
    } finally {
      await site.close()
    }
  })
})

describe('optional actions', () => {
  // the Select button is there only in some server states; on the picker it shows up late, as after an API call
  const picker = `<!doctype html><html><body style="margin:0;height:100vh;background:#fff">
  <script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<button id=select onclick="document.body.style.background=\\'rgb(0,160,0)\\'">Select</button>'), 800)</script>
  </body></html>`
  const home = `<!doctype html><html><body style="margin:0;height:100vh;background:#fff">
  <button id="go" onclick="document.body.style.background='rgb(0,0,255)'">go</button>
  </body></html>`
  const GREEN: [number, number, number] = [0, 160, 0]
  const BLUE: [number, number, number] = [0, 0, 255]

  it('runs the action when its target appears, skips it when it does not, and reports the skip with --verbose only', async () => {
    const site = await servePages({ '/picker.html': picker, '/home.html': home })
    try {
      const root = await projectOn(
        site.url,
        `logins:
  main:
    url: /home.html
    actions: [{ click: "#select", optional: true }, { wait: "#go" }]
shots:
  picked:
    url: /picker.html
    caption: picked
    actions: [{ click: "#select", optional: true }]
  already:
    url: /home.html
    login: main
    caption: already
    actions: [{ click: "#select", optional: true }, { click: "#go" }]
steps:
  pick:
    url: /home.html
    setup: [{ click: "#select", optional: true }]
    steps: [{ text: go, actions: [{ click: "#go" }] }]
clips:
  demo:
    url: /home.html
    caption: demo
    segments: [{ caption: go, actions: [{ click: "#select", optional: true }, { click: "#go" }] }]
`,
      )
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps+video'))
      const r = await runCliAsync(['capture'], root)
      expect(r.stderr).toBe('')
      expect(r.code).toBe(0)
      expect(r.stdout).toMatch(/^captured 8 \(4 shots, 2 step sets, 2 clips\), 0 failed \(/)
      expect(r.stdout).not.toContain('skipped')
      expect(readdirSync(join(root, 'manual/.manual-kit/failures'))).toEqual([])
      for (const lang of ['th', 'en']) {
        // the button came late but within the wait, so it was clicked
        expect(pixel(join(root, `manual/media/${lang}/picked.png`), 640, 400)).toEqual(GREEN)
        // no button: skipped, and the next action still ran
        expect(pixel(join(root, `manual/media/${lang}/already.png`), 640, 400)).toEqual(BLUE)
        expect(pixel(join(root, `manual/media/${lang}/pick-1.png`), 640, 400)).toEqual(BLUE)
        // a skipped action adds no frame: the start, the click on #go, the end of the segment
        const timeline = JSON.parse(readFileSync(join(root, `manual/media/${lang}/clips/demo/timeline.json`), 'utf8')) as { frames: unknown[] }
        expect(timeline.frames).toHaveLength(3)
      }

      const verbose = await runCliAsync(['capture', '--verbose'], root)
      expect(verbose.code).toBe(0)
      const skips = verbose.stdout.split('\n').filter((l) => l.includes('skipped'))
      expect(skips.sort()).toEqual(
        [
          ...['th', 'en'].flatMap((lang) => [
            `  skipped ${lang} login main: optional click "#select" (not on the page)`,
            `  skipped ${lang} shot already: optional click "#select" (not on the page)`,
            `  skipped ${lang} steps pick: optional click "#select" (not on the page)`,
            `  skipped ${lang} clip demo: optional click "#select" (not on the page)`,
          ]),
        ].sort(),
      )
    } finally {
      await site.close()
    }
  }, 180_000)

  it('optional needs an action with a target; specs without it keep their hash', async () => {
    const { Action, ShotSpec, specHash } = await import('../src/shots.ts')
    expect(Action.safeParse({ click: '#a', optional: true }).success).toBe(true)
    expect(Action.safeParse({ press: 'Enter', on: '#q', optional: true }).success).toBe(true)
    expect(Action.safeParse({ press: 'Enter', optional: true }).success).toBe(false)
    expect(Action.safeParse({ goto: '/a', optional: true }).success).toBe(false)
    expect(Action.safeParse({ waitMs: 100, optional: true }).success).toBe(false)
    expect(Action.safeParse({ click: '#a', optional: 'yes' }).success).toBe(false)
    expect(specHash(ShotSpec.parse({ url: '/a', caption: 'x', actions: [{ click: '#b' }] }))).toBe('147f19538897feda')
    expect(specHash(ShotSpec.parse({ url: '/a', caption: 'x', actions: [{ click: '#b', optional: true }] }))).not.toBe('147f19538897feda')
  })
})

describe('display: contents targets', () => {
  // each labelled control sits in a display: contents wrapper that carries the test id, as React apps often do
  const page = `<!doctype html><html><head><style>
  body { margin: 0; background: rgb(0, 160, 0); height: 100vh }
  .box { position: absolute; left: 100px; width: 200px; height: 40px; margin: 0; border: 0; padding: 0; background: #fff; font: 14px sans-serif }
  </style></head><body>
  <span data-testid="send" style="display:contents"><span class="box" style="top:20px">Ready to send</span><button class="box" style="top:80px" onclick="document.body.insertAdjacentHTML('beforeend', '<p id=sent>sent</p>')">Send</button><button class="box" style="top:140px">Cancel</button></span>
  <span data-testid="name" style="display:contents"><label class="box" style="top:200px" for="n">Name</label><input class="box" style="top:260px" id="n"></span>
  <button id="check" class="box" style="top:320px" onclick="if (document.getElementById('n').value === 'Ada') document.body.insertAdjacentHTML('beforeend', '<p id=filled>filled</p>')">check</button>
  <span data-testid="pair" style="display:contents"><span class="box" style="left:400px;top:400px"></span><span class="box" style="left:400px;top:460px"></span></span>
  <span data-testid="gone" style="display:none"><span class="box" style="left:700px;top:400px">gone</span></span>
  <span data-testid="unseen" style="display:contents;visibility:hidden"><span class="box" style="left:700px;top:500px">unseen</span></span>
  </body></html>`
  const FRAME: [number, number, number] = [209, 36, 47]

  async function capture(shotsYaml: string, args: string[] = []) {
    const site = await servePages({ '/form.html': page })
    try {
      const root = await projectOn(site.url, shotsYaml)
      return { root, r: await runCliAsync(['capture', ...args], root) }
    } finally {
      await site.close()
    }
  }

  it('click acts on the first clickable element inside the wrapper; --verbose notes the choice when several could', async () => {
    const { r } = await capture(
      'shots:\n  sent:\n    url: /form.html\n    caption: sent\n    actions: [{ click: "[data-testid=send]" }, { wait: "#sent" }]\n',
      ['--verbose'],
    )
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatch(/captured 2 \(2 shots\), 0 failed/)
    expect(r.stdout).toContain(
      '  note en shot sent: click "[data-testid=send]" has no box of its own (display: contents); used the first of 2 elements inside it that can take the click: button "Send"',
    )
    const quiet = await capture('shots:\n  sent:\n    url: /form.html\n    caption: sent\n    actions: [{ click: "[data-testid=send]" }, { wait: "#sent" }]\n')
    expect(quiet.r.stdout).not.toContain('note')
  })

  it('fill types into the input inside the wrapper', async () => {
    const { r } = await capture(
      'shots:\n  filled:\n    url: /form.html\n    caption: filled\n    actions: [{ fill: "[data-testid=name]", value: Ada }, { click: "#check" }, { wait: "#filled" }]\n',
      ['--verbose'],
    )
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatch(/captured 2 \(2 shots\), 0 failed/)
    // one input inside: nothing to note
    expect(r.stdout).not.toContain('note')
  })

  it('highlight and element frame the content inside the wrapper; hidden targets still fail with the no-box message', async () => {
    const { root, r } = await capture(`shots:
  pair:
    url: /form.html
    caption: pair
    highlight: "[data-testid=pair]"
  pair-only:
    url: /form.html
    caption: pair only
    element: "[data-testid=pair]"
  gone:
    url: /form.html
    caption: gone
    highlight: "[data-testid=gone]"
  unseen:
    url: /form.html
    caption: unseen
    highlight: "[data-testid=unseen]"
`)
    expect(r.stdout).toMatch(/captured 4 \(4 shots\), 4 failed/)
    for (const lang of ['th', 'en']) {
      const shot = join(root, `manual/media/${lang}/pair.png`)
      // the frame goes around both children (400,400 to 600,500), not only the first
      expect(pixel(shot, 396, 450)).toEqual(FRAME)
      expect(pixel(shot, 500, 503)).toEqual(FRAME)
      expect(pixel(shot, 500, 450)).not.toEqual(FRAME)
      expect(pngSize(join(root, `manual/media/${lang}/pair-only.png`))).toEqual({ width: 200, height: 100 })
    }
    const noBox = 'the element has no box on the page (the element matches but has no visible box: hidden, zero-size, or a display: contents wrapper; point at the visible element inside it)'
    expect(r.stdout).toContain(`failed en shot gone: highlight "[data-testid=gone]": ${noBox}`)
    expect(r.stdout).toContain(`failed en shot unseen: highlight "[data-testid=unseen]": ${noBox}`)
  })
})

describe('capture --only and --dry-run', () => {
  const SHOTS = `logins:
  main:
    url: /login.html
    storageState: true
shots:
  login:
    url: /login.html
    caption: login
  list-a:
    url: /classes.html
    caption: a
  list-b:
    url: /classes.html
    caption: b
steps:
  create-class:
    url: /classes.html
    steps:
      - text: New
        highlight: "#new-class"
`
  async function selectable(shots = SHOTS) {
    const root = await project()
    const cfg = join(root, 'manual/manual.config.yaml')
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps'))
    writeFileSync(join(root, 'manual/shots.yaml'), shots)
    return root
  }
  const captured = (stdout: string) => stdout.trimEnd().split('\n').slice(0, -1)
  /** Every file under the manual folder with its contents, to show a dry run changed nothing. */
  const snapshot = (dir: string): Record<string, string> =>
    Object.fromEntries(
      (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
        .filter((e) => e.isFile())
        .map((e) => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), 'base64')]),
    )

  it('--only takes ids and * globs, comma-separated or repeated, across shots and step sets', async () => {
    const root = await selectable()
    const one = await runCliAsync(['capture', '--only', 'login', '--verbose'], root)
    expect(one.code).toBe(0)
    expect(captured(one.stdout)).toEqual(['  th shot login', '  en shot login'])
    expect(existsSync(join(root, 'manual/media/th/list-a.png'))).toBe(false)
    const glob = await runCliAsync(['capture', '--only', 'list-*,create-*', '--verbose'], root)
    expect(captured(glob.stdout)).toEqual(['  th shot list-a', '  th shot list-b', '  th steps create-class', '  en shot list-a', '  en shot list-b', '  en steps create-class'])
    const repeated = await runCliAsync(['capture', '--only', 'list-b', '--only', 'login', '--verbose'], root)
    expect(captured(repeated.stdout)).toEqual(['  th shot login', '  th shot list-b', '  en shot login', '  en shot list-b'])
  })

  it('--only with --changed takes only the selected jobs that are out of date', async () => {
    const root = await selectable()
    expect((await runCliAsync(['capture'], root)).stdout).toMatch(/^captured 8 /m)
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(shots, readFileSync(shots, 'utf8').replace('caption: a', 'caption: a2').replace('caption: b', 'caption: b2'))
    const r = await runCliAsync(['capture', '--changed', '--only', 'list-a', '--verbose'], root)
    expect(r.code).toBe(0)
    expect(captured(r.stdout)).toEqual(['  th shot list-a', '  en shot list-a'])
    // selected but up to date: nothing to do, not an error
    const none = await runCliAsync(['capture', '--changed', '--only', 'login'], root)
    expect(none.code).toBe(0)
    expect(none.stdout).toMatch(/^captured 0, 0 failed/)
  })

  it('a pattern that matches no id stops before the browser opens and names the close ids', async () => {
    const root = await selectable()
    const hits = server.hits.length
    const r = await runCliAsync(['capture', '--only', 'login', '--only', 'lst-*'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toBe('manual-kit: --only "lst-*" matches no shot, step set or clip; close ids: list-a, list-b\n')
    const typo = await runCliAsync(['capture', '--only', 'creat-clas'], root)
    expect(typo.stderr).toContain('close ids: create-class\n')
    expect(server.hits.length).toBe(hits)
    expect(existsSync(join(root, 'manual/media'))).toBe(false)
  })

  it('a login runs only when a selected job needs it', async () => {
    const root = await selectable(SHOTS.replace('    url: /classes.html\n    caption: b', '    url: /classes.html\n    login: main\n    caption: b'))
    const all = await runCliAsync(['capture'], root)
    expect(all.code).toBe(2)
    expect(all.stderr).toContain('login "main": no saved session')
    const some = await runCliAsync(['capture', '--only', 'list-a'], root)
    expect(some.stderr).toBe('')
    expect(some.code).toBe(0)
    expect(some.stdout).toMatch(/^captured 2 \(2 shots\), 0 failed/)
  })

  it('--dry-run lists each job with its reason, logins and hosts; opens no browser and writes nothing', async () => {
    const root = await selectable()
    expect((await runCliAsync(['capture'], root)).code).toBe(0)
    const shots = join(root, 'manual/shots.yaml')
    writeFileSync(
      shots,
      readFileSync(shots, 'utf8')
        .replace('caption: a', 'caption: a2')
        .replace('    caption: b', '    login: main\n    caption: b')
        .replace('steps:\n', '  fresh:\n    url: /login.html\n    caption: fresh\n    actions: [{ goto: "https://example.com/x" }]\nsteps:\n'),
    )
    rmSync(join(root, 'manual/media/th/login.png'))
    const host = new URL(server.url).hostname
    const before = snapshot(join(root, 'manual'))
    const hits = server.hits.length

    const r = await runCliAsync(['capture', '--dry-run'], root)
    expect(r.stdout.split('\n')).toEqual([
      `  th shot login: file missing; hosts ${host}`,
      `  th shot list-a: spec changed; hosts ${host}`,
      `  th shot list-b: spec changed; login main; hosts ${host}`,
      `  th shot fresh: new; hosts ${host}, example.com (not in capture.allowlist)`,
      `  th steps create-class: forced; hosts ${host}`,
      `  en shot login: forced; hosts ${host}`,
      `  en shot list-a: spec changed; hosts ${host}`,
      `  en shot list-b: spec changed; login main; hosts ${host}`,
      `  en shot fresh: new; hosts ${host}, example.com (not in capture.allowlist)`,
      `  en steps create-class: forced; hosts ${host}`,
      `dry run: 10 to capture (8 shots, 2 step sets); logins: main (no saved session: run manual-kit login main); hosts: ${host}, example.com; nothing opened or written`,
      '',
    ])
    expect(r.stderr).toBe('manual-kit: example.com is not in capture.allowlist\n')
    expect(r.code).toBe(2)

    const changed = await runCliAsync(['capture', '--dry-run', '--changed', '--only', 'login,list-a'], root)
    expect(changed.code).toBe(0)
    expect(changed.stdout).toBe(
      `  th shot login: file missing; hosts ${host}\n  th shot list-a: spec changed; hosts ${host}\n  en shot list-a: spec changed; hosts ${host}\ndry run: 3 to capture (3 shots); logins: none; hosts: ${host}; nothing opened or written\n`,
    )
    expect(server.hits.length).toBe(hits)
    expect(snapshot(join(root, 'manual'))).toEqual(before)
  })
})

/**
 * One server reached as two hosts: 127.0.0.1 (on the allowlist) and localhost (off it). `hits` records `host path`
 * for every request, so a test can prove the off-list host was never asked for anything.
 */
async function redirectSite() {
  const { createServer } = await import('node:http')
  const hits: string[] = []
  let port = 0
  const server = createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0]!
    const url = new URL(req.url ?? '/', 'http://x')
    hits.push(`${host} ${url.pathname}`)
    const cookies = req.headers.cookie ?? ''
    const off = `http://localhost:${port}`
    const html = (body: string, status = 200) => void res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><body>${body}</body></html>`)
    const redirect = (location: string, cookie?: string) => void res.writeHead(302, { location, ...(cookie ? { 'set-cookie': `${cookie}; Path=/; HttpOnly` } : {}) }).end()
    if (host !== '127.0.0.1') return html('<h1 id="leak">off-list page</h1>')
    switch (url.pathname) {
      case '/nav':
        return redirect(`${off}/authorize`)
      case '/signin.html':
        return html('<form method="post" action="/signin"><input name="user" value="teacher"><button id="go">Sign in</button></form>')
      case '/signin':
        return req.method === 'POST' ? redirect('/mid', 'a=1') : html('use POST', 405)
      case '/mid':
        return cookies.includes('a=1') ? redirect('/home.html', 'b=2') : html('no a', 403)
      case '/home.html':
        return cookies.includes('a=1') && cookies.includes('b=2') ? html('<p id="user">Signed in</p>') : html('no session', 403)
      case '/chain':
        return redirect('/chain-mid', 'c=3')
      case '/chain-mid':
        return redirect(`${off}/sso`)
      case '/img':
        return redirect(`${off}/pic.png`)
      case '/css':
        return redirect(`${off}/style.css`)
      case '/image.html':
        return html('<img src="/img"><button id="submit">x</button>')
      case '/styled.html':
        return html('<link rel="stylesheet" href="/css"><button id="submit">x</button>')
      case '/client.html':
        return html(`<p>leaving</p><script>location.href = '${off}/elsewhere'</script>`)
    }
    html('missing', 404)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as { port: number }).port
  return { url: `http://127.0.0.1:${port}`, port, hits, offHits: () => hits.filter((h) => !h.startsWith('127.0.0.1 ')), close: () => new Promise<void>((r) => server.close(() => r())) }
}

describe('redirects and the allowlist', () => {
  const shot = (id: string, url: string, extra = '') => `  ${id}:\n    url: ${url}\n    caption: ${id}\n${extra}`

  it('a page that redirects to a host outside the allowlist is refused at that hop; the shot fails and says where from', async () => {
    const site = await redirectSite()
    try {
      const root = await projectOn(site.url, `shots:\n${shot('nav', '/nav')}`, '  allowlist: [127.0.0.1]\n')
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(1)
      expect(r.stdout).toContain(`blocked by capture allowlist: localhost (redirect from 127.0.0.1:${site.port}/nav) (add it to capture.allowlist in manual.config.yaml`)
      expect(r.stdout).toMatch(/^captured 0, 2 failed/m)
      expect(r.stdout).toContain('blocked requests to hosts outside the allowlist: localhost:')
      expect(site.offHits()).toEqual([])
      expect(existsSync(join(root, 'manual/media/th/nav.png'))).toBe(false)
    } finally {
      await site.close()
    }
  })

  it('a sign-in that redirects through allowed pages keeps the cookie of every hop; each hop of a chain is checked', async () => {
    const site = await redirectSite()
    try {
      const root = await projectOn(
        site.url,
        `logins:\n  teacher:\n    url: /signin.html\n    actions: [{ click: "#go" }, { wait: "#user" }]\nshots:\n${shot('home', '/home.html', '    login: teacher\n    actions: [{ wait: "#user" }]\n')}${shot('chain', '/chain')}`,
        '  allowlist: [127.0.0.1]\n',
      )
      const r = await runCliAsync(['capture'], root)
      expect(existsSync(join(root, 'manual/media/th/home.png'))).toBe(true)
      expect(existsSync(join(root, 'manual/media/en/home.png'))).toBe(true)
      // the chain's first hop is allowed and sets a cookie; its second hop leaves the allowlist
      expect(r.stdout).toContain(`failed th shot chain: `)
      expect(r.stdout).toContain(`blocked by capture allowlist: localhost (redirect from 127.0.0.1:${site.port}/chain-mid)`)
      expect(r.stdout).toMatch(/^captured 2 \(2 shots\), 2 failed/m)
      expect(r.code).toBe(1)
      expect(site.offHits()).toEqual([])
      // every hop was asked for once per sign-in, not again by the browser
      expect(site.hits.filter((h) => h === '127.0.0.1 /signin')).toHaveLength(2)
      expect(site.hits.filter((h) => h === '127.0.0.1 /mid')).toHaveLength(2)
    } finally {
      await site.close()
    }
  })

  it('an image or stylesheet that redirects outside the allowlist is never loaded; the stylesheet fails its shot', async () => {
    const site = await redirectSite()
    try {
      const root = await projectOn(site.url, `shots:\n${shot('image', '/image.html')}${shot('styled', '/styled.html')}`, '  allowlist: [127.0.0.1]\n')
      const r = await runCliAsync(['capture'], root)
      expect(existsSync(join(root, 'manual/media/th/image.png'))).toBe(true)
      expect(r.stdout).toContain(`failed th shot styled: stylesheet blocked (localhost:${site.port}); add the host to capture.assetHosts`)
      expect(r.stdout).toContain('blocked requests to hosts outside the allowlist: localhost:')
      expect(r.code).toBe(1)
      expect(site.offHits()).toEqual([])
    } finally {
      await site.close()
    }
  })

  it('a page script that moves to a host outside the allowlist fails the shot; nothing is photographed there', async () => {
    const site = await redirectSite()
    try {
      const root = await projectOn(site.url, `shots:\n${shot('client', '/client.html')}`, '  allowlist: [127.0.0.1]\n')
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(1)
      expect(r.stdout).toContain('failed th shot client: the page went to localhost, outside capture.allowlist')
      expect(r.stdout).toContain('blocked by capture allowlist: localhost (add it to capture.allowlist')
      expect(existsSync(join(root, 'manual/media/th/client.png'))).toBe(false)
      expect(site.offHits()).toEqual([])
    } finally {
      await site.close()
    }
  })
})

describe('upload and drag', () => {
  const page = `<!doctype html><html><head><style>
  body { margin: 0; height: 100vh; font: 14px sans-serif }
  #zone { position: absolute; left: 400px; top: 300px; width: 300px; height: 200px; background: #eee }
  .chip { position: absolute; width: 60px; height: 30px; background: #fc0 }
  </style></head><body>
  <input type="file" id="doc" onchange="out('doc', this)"><p id="doc-out"></p>
  <input type="file" id="hidden" multiple style="display:none" onchange="out('picked', this)">
  <button id="pick" onclick="document.getElementById('hidden').click()">Choose</button><p id="picked-out"></p>
  <div id="sig" class="chip" style="left:40px;top:300px">sig</div>
  <div id="card" class="chip" draggable="true" style="left:40px;top:400px" ondragstart="event.dataTransfer.setData('text/plain', 'card')">card</div>
  <div id="zone" ondragover="event.preventDefault()" ondrop="event.preventDefault(); record('html5', event)"></div>
  <p id="drop-out"></p>
  <button id="send" onclick="send()">Send</button><p id="sent-out"></p>
  <script>
  function out(id, input) { document.getElementById(id + '-out').textContent = id + ': ' + [...input.files].map((f) => f.name + ' ' + f.size).join(', ') }
  async function send() {
    const file = document.getElementById('doc').files[0], form = new FormData()
    form.append('file', file)
    const n = Number(await (await fetch('/upload', { method: 'POST', body: form })).text())
    document.getElementById('sent-out').textContent = 'received ' + (n >= file.size ? file.size : n) + ' file bytes'
  }
  function record(how, e) {
    const r = document.getElementById('zone').getBoundingClientRect()
    document.getElementById('drop-out').textContent = how + ' dropped at ' + Math.round(e.clientX - r.left) + ',' + Math.round(e.clientY - r.top)
  }
  let dragging = false
  document.getElementById('sig').addEventListener('pointerdown', () => { dragging = true })
  document.addEventListener('pointerup', (e) => {
    if (!dragging) return
    dragging = false
    const r = document.getElementById('zone').getBoundingClientRect()
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) record('pointer', e)
  })
  </script>
  </body></html>`

  async function setup(shotsYaml: string) {
    const site = await servePages({ '/form.html': page })
    const root = await projectOn(site.url, shotsYaml)
    mkdirSync(join(root, 'manual/files'))
    writeFileSync(join(root, 'manual/files/main.pdf'), '%PDF-1.4 main')
    writeFileSync(join(root, 'manual/files/sig.png'), 'png!')
    writeFileSync(join(root, 'manual/files/cert.p12'), 'p12 bytes')
    return { root, site }
  }

  it('upload sets an input directly or through the file chooser; drag drops at the centre or at an offset, pointer and HTML5', async () => {
    const { root, site } = await setup(`shots:
  doc:
    url: /form.html
    caption: doc
    actions:
      - { upload: "#doc", files: files/main.pdf }
      - { wait: "text=doc: main.pdf 13" }
      - { upload: "#nope", files: files/main.pdf, optional: true }
  chooser:
    url: /form.html
    caption: chooser
    actions:
      - { upload: "#pick", files: [files/sig.png, files/cert.p12] }
      - { wait: "text=picked: sig.png 4, cert.p12 9" }
  centre:
    url: /form.html
    caption: centre
    actions:
      - { drag: "#sig", to: "#zone" }
      - { wait: "text=pointer dropped at 150,100" }
  offset:
    url: /form.html
    caption: offset
    actions:
      - { drag: "#sig", to: "#zone", offset: { x: 30, y: 20 } }
      - { wait: "text=pointer dropped at 30,20" }
      - { drag: "#nope", to: "#zone", optional: true }
  html5:
    url: /form.html
    caption: html5
    actions:
      - { drag: "#card", to: "#zone", offset: { x: 10, y: 190 } }
      - { wait: "text=html5 dropped at 10,190" }
steps:
  sign:
    url: /form.html
    setup: [{ upload: "#doc", files: files/main.pdf }]
    steps:
      - text: place
        actions: [{ drag: "#sig", to: "#zone", offset: { x: 250, y: 50 } }, { wait: "text=pointer dropped at 250,50" }, { wait: "text=doc: main.pdf 13" }]
        highlight: "#zone"
clips:
  place:
    url: /form.html
    caption: place
    segments:
      - caption: place
        actions: [{ upload: "#pick", files: files/sig.png }, { drag: "#sig", to: "#zone" }, { wait: "text=pointer dropped at 150,100" }, { wait: "text=picked: sig.png 4" }]
`)
    try {
      const cfg = join(root, 'manual/manual.config.yaml')
      writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('media: screenshots', 'media: steps+video'))
      const r = await runCliAsync(['capture', '--verbose'], root)
      expect(r.stderr).toBe('')
      expect(r.stdout).toMatch(/captured 14 \(10 shots, 2 step sets, 2 clips\), 0 failed/)
      expect(r.stdout).toContain('  skipped en shot doc: optional upload "#nope" (not on the page)')
      expect(r.stdout).toContain('  skipped en shot offset: optional drag "#nope" (not on the page)')
      // a frame per action: the start, upload, drag, two waits, the end of the segment
      const timeline = JSON.parse(readFileSync(join(root, 'manual/media/en/clips/place/timeline.json'), 'utf8')) as { frames: unknown[] }
      expect(timeline.frames).toHaveLength(6)
    } finally {
      await site.close()
    }
  }, 300_000)

  it('a file uploaded in a multipart form reaches the server whole', async () => {
    const { root, site } = await setup(`shots:
  sent:
    url: /form.html
    caption: sent
    actions:
      - { upload: "#doc", files: files/big.pdf }
      - { click: "#send" }
      - { wait: "text=received 50000 file bytes" }
`)
    try {
      writeFileSync(join(root, 'manual/files/big.pdf'), Buffer.alloc(50_000, 0xff))
      const r = await runCliAsync(['capture'], root)
      expect(r.stdout).toMatch(/shots?\), 0 failed/)
    } finally {
      await site.close()
    }
  })

  it('a drop target that matches nothing names the target and similar elements', async () => {
    const { root, site } = await setup('shots:\n  bad:\n    url: /form.html\n    caption: bad\n    actions: [{ drag: "#sig", to: "#zonee" }]\n')
    try {
      const r = await runCliAsync(['capture'], root)
      expect(r.code).toBe(1)
      expect(r.stdout).toContain('failed en shot bad: drag to "#zonee": no element matches')
    } finally {
      await site.close()
    }
  })

  it('a missing upload file stops capture and --dry-run before any browser opens', async () => {
    const { root, site } = await setup('shots:\n  bad:\n    url: /form.html\n    caption: bad\n    actions: [{ upload: "#doc", files: [files/main.pdf, files/gone.pdf] }]\n')
    try {
      for (const args of [['capture'], ['capture', '--dry-run']]) {
        const r = await runCliAsync(args, root)
        expect(r.code).toBe(2)
        expect(r.stderr).toBe('manual-kit: shot "bad": upload "#doc": file "files/gone.pdf" does not exist (upload files are relative to the manual folder)\n')
      }
      expect(existsSync(join(root, 'manual/.manual-kit'))).toBe(false)
    } finally {
      await site.close()
    }
  })

  it('the spec hash follows the uploaded files: content, path, and those of a login it signs in with', async () => {
    const { loadShots, specHash } = await import('../src/shots.ts')
    const dir = mkdtempSync(join(tmpdir(), 'mk-upload-'))
    writeFileSync(join(dir, 'a.pdf'), 'one')
    writeFileSync(join(dir, 'b.pdf'), 'one')
    const yaml = (file: string) =>
      `logins:\n  main:\n    url: /login\n    actions: [{ upload: "#cert", files: ${file} }]\nshots:\n  s:\n    url: /a\n    caption: x\n    actions: [{ upload: "#doc", files: ${file} }]\n  l:\n    url: /a\n    caption: x\n    login: main\n`
    const hashes = () => {
      const s = loadShots(dir)
      return [specHash(s.shots.s!, s.logins), specHash(s.shots.l!, s.logins)]
    }
    writeFileSync(join(dir, 'shots.yaml'), yaml('a.pdf'))
    const first = hashes()
    expect(hashes()).toEqual(first)
    writeFileSync(join(dir, 'a.pdf'), 'two')
    const edited = hashes()
    expect(edited[0]).not.toBe(first[0])
    expect(edited[1]).not.toBe(first[1])
    writeFileSync(join(dir, 'shots.yaml'), yaml('b.pdf'))
    expect(hashes()[0]).not.toBe(first[0])
  })
})
