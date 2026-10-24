import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAdapter, type InventoryItem } from '../src/adapters/index.ts'
import { AdapterConfig } from '../src/config.ts'
import { runCli } from './helpers/cli.ts'

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const adapter = (cfg: unknown, root: string) => createAdapter(AdapterConfig.parse(cfg), root)
const routes = (root: string, cfg: object = {}) => {
  const a = adapter({ type: 'nuxt', ...cfg }, root)
  return { items: a.items().filter((i) => i.kind === 'route'), notes: a.notes?.() ?? [] }
}
const route = (items: InventoryItem[], path: string) => items.find((i) => i.id === `route:${path}`)

describe('nuxt routes, static scan', () => {
  const { items, notes } = routes(fx('nuxt-routes'))

  it('maps file names: [id], [[opt]], [...slug], (group) dropped, index is its folder', () => {
    expect(route(items, '/users/:id')).toMatchObject({ source: 'pages/users/[id].vue' })
    expect(route(items, '/search/:q?')).toMatchObject({ source: 'pages/search/[[q]].vue' })
    expect(route(items, '/docs/:slug(.*)*')).toMatchObject({ source: 'pages/docs/[...slug].vue' })
    expect(route(items, '/settings')).toMatchObject({ source: 'pages/(admin)/settings.vue' })
    expect(route(items, '/users')).toMatchObject({ source: 'pages/users.vue' })
    expect(items.some((i) => i.id.includes('index') || i.id.includes('(admin)') || i.id.includes('['))).toBe(false)
  })

  it('names the parent of nested routes (parent.vue next to parent/)', () => {
    expect(route(items, '/users/:id')?.label).toBe('nested in /users')
    expect(route(items, '/users/:id/edit')?.label).toBe('nested in /users/:id')
    expect(route(items, '/help')?.label).not.toMatch(/nested/)
  })

  it('definePageMeta path replaces the file path and each alias is a route, at file:line', () => {
    expect(route(items, '/about')).toBeUndefined()
    expect(route(items, '/about-us')).toMatchObject({ source: 'pages/about.vue:5' })
    expect(route(items, '/company')).toMatchObject({ source: 'pages/about.vue:6', label: 'alias of /about-us' })
    expect(route(items, '/team')).toMatchObject({ source: 'pages/about.vue:6', label: 'alias of /about-us' })
  })

  it('pages:extend: a literal push adds a route, a findIndex splice removes one', () => {
    expect(route(items, '/extra')).toMatchObject({ source: 'nuxt.config.ts:9', label: 'added by pages:extend; file ~/extra/page.vue' })
    expect(route(items, '/old')).toBeUndefined()
  })

  it('router.options routes: literal entries with aliases and children are added; ..._routes keeps the file routes', () => {
    expect(route(items, '/print/:id')).toMatchObject({ source: 'router.options.ts:8', label: 'added by router.options' })
    expect(route(items, '/p/:id')).toMatchObject({ label: 'alias of /print/:id' })
    expect(route(items, '/print/:id/preview')).toBeDefined()
    expect(route(items, '/')).toBeDefined()
  })

  it('@nuxtjs/i18n per-locale paths are alternates of one route, not more routes; a locale set to false is left out', () => {
    expect(route(items, '/help')?.label).toBe('i18n th: /ช่วยเหลือ; i18n en: /help')
    expect(route(items, '/contact')?.label).toBe('i18n th: /ติดต่อ; i18n en: /contact')
    expect(route(items, '/ช่วยเหลือ')).toBeUndefined()
    expect(route(items, '/help')?.label).not.toMatch(/fr/)
  })

  it('skips what is not a literal with a note at file:line that says how to add the route', () => {
    expect(notes.map((n) => n.source)).toEqual(['pages/legacy.vue:3', 'nuxt.config.ts:10', 'nuxt.config.ts:12', 'nuxt.config.ts:6', 'router.options.ts:9'])
    expect(notes[0]!.message).toMatch(/definePageMeta path is not a literal.*adapter\.extraRoutes/)
    expect(notes[1]!.message).toMatch(/pages:extend.*path is not a literal/)
    expect(notes[2]!.message).toMatch(/passed to removePagesMatching\(\)/)
    expect(notes[3]!.message).toBe('i18n pages key "ghost" matches no page')
    expect(route(items, '/legacy')).toMatchObject({ source: 'pages/legacy.vue' })
    expect(items.some((i) => i.id.includes('generated') || i.id.includes('made'))).toBe(false)
  })

  it('adapter.extraRoutes adds the routes the scan cannot see', () => {
    expect(route(routes(fx('nuxt-routes'), { extraRoutes: ['/generated/x'] }).items, '/generated/x')).toMatchObject({ source: 'adapter.extraRoutes' })
    expect(() => AdapterConfig.parse({ type: 'nuxt', extraRoutes: ['generated'] })).toThrow(/starting with \//)
  })

  it('router.options without ..._routes replaces the file routes', () => {
    const root = mkdtempSync(join(tmpdir(), 'mk-nuxt-replace-'))
    mkdirSync(join(root, 'pages'))
    writeFileSync(join(root, 'pages/index.vue'), '<template><p/></template>')
    mkdirSync(join(root, 'app'))
    writeFileSync(join(root, 'app/router.options.ts'), "export default {\n  routes(_routes) {\n    return [{ path: '/only', component: {} }]\n  },\n}\n")
    expect(routes(root).items.map((i) => [i.id, i.source])).toEqual([['route:/only', 'app/router.options.ts:3']])
  })

  it('Nuxt 2: _id is a param, _ is the catch-all, router.extendRoutes pushes count', () => {
    const r = routes(fx('nuxt2-routes'))
    expect(r.items.map((i) => i.id)).toEqual(['route:/', 'route:/*', 'route:/:id', 'route:/custom', 'route:/users/:id'])
    expect(route(r.items, '/custom')).toMatchObject({ source: 'nuxt.config.js:4', label: 'added by router.extendRoutes' })
  })

  it('discover lists the notes under their own heading in discovery.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'mk-nuxt-discover-'))
    cpSync(fx('nuxt-routes'), root, { recursive: true })
    mkdirSync(join(root, '.git'))
    const r = runCli(['discover'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/5 not read from the code/)
    const md = readFileSync(join(root, 'manual/discovery.md'), 'utf8')
    expect(md).toContain('## Not read from the code (check by hand)')
    expect(md).toContain('- `pages/legacy.vue:3`: definePageMeta path is not a literal')
    expect(md).toContain('| /about-us |  | `pages/about.vue:5` |')
    const json = JSON.parse(readFileSync(join(root, 'manual/discovery.json'), 'utf8'))
    expect(json.project.adapter).toBe('nuxt')
    expect(json.notes).toHaveLength(5)
  })
})
