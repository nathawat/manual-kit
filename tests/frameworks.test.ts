import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/adapters/index.ts'
import { AdapterConfig } from '../src/config.ts'
import { findUi } from '../src/pages.ts'

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const ids = (items: { id: string }[]) => items.map((i) => i.id)
const adapter = (cfg: unknown, root: string) => createAdapter(AdapterConfig.parse(cfg), root)

describe('nextjs adapter', () => {
  it('App Router: page files become routes; groups stripped, dynamic kept, parallel/intercepting/private ignored', () => {
    const a = adapter({ type: 'nextjs' }, fx('next-app'))
    expect(ids(a.items())).toEqual(['route:/', 'route:/about', 'route:/blog', 'route:/dashboard/[id]', 'route:/docs/[...slug]'])
    expect(a.items().find((i) => i.id === 'route:/about')).toMatchObject({ source: 'app/(marketing)/about/page.tsx' })
  })

  it('Pages Router: files under pages/ minus _app, _document and api/; index is the folder; no trailing slash', () => {
    const a = adapter({ type: 'nextjs' }, fx('next-pages'))
    expect(ids(a.items())).toEqual(['route:/', 'route:/blog', 'route:/blog/[slug]', 'route:/users/[...path]'])
  })

  it('UI strings from JSX text and literal attributes (parsed, never run), whitespace collapsed, for every language', () => {
    const a = adapter({ type: 'nextjs' }, fx('next-app'))
    const th = a.uiStrings('th')
    for (const label of ['ร่างหนังสือราชการ', 'เริ่ม ร่าง ได้ทันที', 'ค้นหาระเบียบ', 'Search rules', 'Save draft', 'Sign in', 'ขั้นที่ 1: กรอกข้อมูล', 'Review the draft'])
      expect(findUi(th, label), label).toBe(label)
    expect(th.has('items')).toBe(false) // text next to an expression is not a fixed label
    expect(th.has('x y')).toBe(false) // className is not UI text
    expect(a.uiStrings('en').get('Sign in')).toBe('Sign in')
  })

  it('in-page sections: named regions by component or selector become coverage items', () => {
    const a = adapter(
      {
        type: 'nextjs',
        sections: [
          { id: 'home.wizard', route: '/', component: 'Wizard', label: 'Letter wizard' },
          { id: 'home.review', route: '/', component: 'StepTwo' },
          { id: 'home.gone', component: 'NoSuchThing' },
          { id: 'home.drawer', selector: '.drawer' },
        ],
      },
      fx('next-app'),
    )
    const items = a.items()
    expect(ids(items).filter((i) => i.startsWith('section:'))).toEqual(['section:home.drawer', 'section:home.review', 'section:home.wizard'])
    expect(items.find((i) => i.id === 'section:home.wizard')).toMatchObject({ kind: 'section', label: 'Letter wizard (on /)', source: 'components/Wizard.tsx' })
    expect(items.find((i) => i.id === 'section:home.drawer')).toMatchObject({ label: '.drawer' })
  })
})

describe('nuxt adapter', () => {
  it('pages/**/*.vue become routes', () => {
    const a = adapter({ type: 'nuxt' }, fx('nuxt-app'))
    expect(ids(a.items())).toEqual(['route:/', 'route:/docs/:slug(.*)*', 'route:/users', 'route:/users/:id'])
  })

  it('i18n files in locales/ (JSON or YAML) when present', () => {
    const a = adapter({ type: 'nuxt' }, fx('nuxt-app'))
    expect(a.uiStrings('th').get('nav.login')).toBe('เข้าสู่ระบบ')
    expect(a.uiStrings('en').get('home.title')).toBe('Home')
    expect(a.uiStrings('en').has('Welcome back')).toBe(false)
  })

  it('template text and literal attributes when there are no i18n files', () => {
    const a = adapter({ type: 'nuxt' }, fx('nuxt-plain'))
    expect(findUi(a.uiStrings('th'), 'สวัสดี')).toBe('สวัสดี')
    expect(findUi(a.uiStrings('th'), 'ปิด')).toBe('ปิด')
    const b = adapter({ type: 'nuxt', i18n: false }, fx('nuxt-app'))
    expect(findUi(b.uiStrings('th'), 'Welcome back')).toBe('Welcome back')
    expect(findUi(b.uiStrings('th'), 'Search')).toBe('Search')
    expect(findUi(b.uiStrings('th'), 'Filters')).toBe('Filters')
    expect([...b.uiStrings('th').keys()].some((k) => k.includes('$t'))).toBe(false)
  })

  it('sections by component name find .vue components', () => {
    const a = adapter({ type: 'nuxt', sections: [{ id: 'home.filters', component: 'TheDrawer' }] }, fx('nuxt-app'))
    expect(a.items().find((i) => i.id === 'section:home.filters')).toMatchObject({ source: 'components/TheDrawer.vue' })
  })
})

describe('generic adapter regex flags', () => {
  it('flags (e.g. m) apply to routes, roles, feature flags and strings', () => {
    const root = join(process.env.TMPDIR ?? '/tmp', `mk-flags-${process.pid}`)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'routes.txt'), 'route /a\nroute /b\nnot route /c\n')
    writeFileSync(join(root, 'ui.txt'), 'OK=Okay\nCANCEL=Cancel\n')
    const a = adapter(
      {
        type: 'generic',
        routes: { files: ['routes.txt'], pattern: '^route (\\S+)$', flags: 'm' },
        strings: { en: { files: ['ui.txt'], pattern: '^(\\w+)=(.+)$', flags: 'm' } },
      },
      root,
    )
    expect(ids(a.items())).toEqual(['route:/a', 'route:/b'])
    expect(a.uiStrings('en').get('CANCEL')).toBe('Cancel')
  })

  it('rejects bad flags in the config', () => {
    expect(AdapterConfig.safeParse({ type: 'generic', routes: { files: ['x'], pattern: 'a', flags: 'q' } }).success).toBe(false)
  })
})
