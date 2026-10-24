import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/adapters/index.ts'
import { fileRoutePath } from '../src/adapters/react-spa.ts'
import { detectAdapter, runDiscovery } from '../src/discover.ts'
import { findUi } from '../src/pages.ts'
import { runCli } from './helpers/cli.ts'

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const routes = (a: ReturnType<typeof createAdapter>) => a.items().filter((i) => i.kind === 'route')
const ids = (a: ReturnType<typeof createAdapter>) => routes(a).map((i) => i.id)
const sourceOf = (a: ReturnType<typeof createAdapter>, id: string) => a.items().find((i) => i.id === id)?.source

describe('react-spa adapter: <Route> elements', () => {
  const a = createAdapter({ type: 'react-spa' }, fx('spa-wouter'))

  it('wouter: paths across lines, inside layout wrappers, nest joins children; dynamic paths, catch-alls and tests skipped', () => {
    expect(ids(a)).toEqual([
      'route:/',
      'route:/documents/:documentId/printing',
      'route:/inbox',
      'route:/inbox/:id',
      'route:/login',
      'route:/settings',
      'route:/settings/roles/:id',
      'route:/settings/users',
    ])
  })

  it('each route names the file and line of its path, the first one when a path is declared twice', () => {
    expect(sourceOf(a, 'route:/documents/:documentId/printing')).toBe('src/main.tsx:10')
    expect(sourceOf(a, 'route:/inbox')).toBe('src/main.tsx:17')
    expect(sourceOf(a, 'route:/settings/users')).toBe('src/main.tsx:21')
  })

  it('React Router: relative children join the parent, absolute children and index routes, pathless layouts add nothing', () => {
    const rr = createAdapter({ type: 'react-spa' }, fx('spa-react-router'))
    expect(ids(rr)).toEqual([
      'route:/',
      'route:/*',
      'route:/account',
      'route:/admin',
      'route:/admin/audit/:entryId',
      'route:/admin/reports',
      'route:/admin/reports/monthly',
      'route:/help',
      'route:/help/faq',
      'route:/settings/profile',
      'route:/users',
      'route:/users/:userId',
      'route:/users/new',
    ])
    expect(sourceOf(rr, 'route:/users')).toBe('src/App.tsx:9')
    expect(sourceOf(rr, 'route:/admin/audit/:entryId')).toBe('src/router.tsx:10')
    expect(sourceOf(rr, 'route:/settings/profile')).toBe('src/routes.ts:6')
  })
})

describe('react-spa adapter: TanStack Router file routes', () => {
  const a = createAdapter({ type: 'react-spa' }, fx('spa-tanstack'))

  it('file names become paths: index and route are the folder, $id is :id, _layout and (group) leave the URL', () => {
    expect(ids(a)).toEqual([
      'route:/',
      'route:/about',
      'route:/dashboard',
      'route:/files/*',
      'route:/posts',
      'route:/posts/:postId',
      'route:/posts/:postId/edit',
      'route:/pricing',
      'route:/settings',
    ])
    expect(sourceOf(a, 'route:/posts/:postId')).toBe('src/routes/posts/$postId.tsx:3')
  })

  it('layouts, the root route and -ignored files are not pages', () => {
    expect(fileRoutePath('_auth.tsx')).toBeUndefined()
    expect(fileRoutePath('__root.tsx')).toBeUndefined()
    expect(fileRoutePath('-components/Header.tsx')).toBeUndefined()
    expect(fileRoutePath('posts.$postId.tsx')).toBe('/posts/:postId')
  })
})

describe('react-spa adapter: config and UI strings', () => {
  it('routes.files and routes.dir narrow where routes are read', () => {
    expect(ids(createAdapter({ type: 'react-spa', routes: { files: ['src/router.tsx'] } }, fx('spa-react-router')))).toEqual([
      'route:/admin',
      'route:/admin/audit/:entryId',
      'route:/admin/reports',
      'route:/admin/reports/monthly',
    ])
    expect(ids(createAdapter({ type: 'react-spa', routes: { dir: false } }, fx('spa-tanstack')))).toEqual([])
  })

  it('UI strings from JSX text and literal attributes in src/**/*.tsx, the label is its own key', () => {
    const ui = createAdapter({ type: 'react-spa' }, fx('spa-wouter')).uiStrings('th')
    for (const label of ['หนังสือเข้า', 'ค้นหาเลขที่หนังสือ', 'Search letters', 'Refresh list', 'รีเฟรช', 'ตราหน่วยงาน', 'ใหม่']) expect(findUi(ui, label), label).toBe(label)
    expect(ui.has('items')).toBe(false)
    expect(ui.has('badge')).toBe(false)
  })
})

describe('react-spa detection', () => {
  const withDeps = (deps: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'mk-spa-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: deps }))
    return root
  }

  it('vite plus react-router-dom, wouter or @tanstack/react-router, and no next', () => {
    for (const router of ['react-router-dom', 'wouter', '@tanstack/react-router']) expect(detectAdapter(withDeps({ vite: '7', react: '19', [router]: '1' })), router).toBe('react-spa')
    expect(detectAdapter(withDeps({ vite: '7', react: '19' }))).toBe('none')
    expect(detectAdapter(withDeps({ react: '19', wouter: '3' }))).toBe('none')
    expect(detectAdapter(withDeps({ vite: '7', next: '15', 'react-router-dom': '6' }))).toBe('nextjs')
  })

  it('discover reads the routes through it', () => {
    const d = runDiscovery(fx('spa-wouter'))
    expect(d.project.adapter).toBe('react-spa')
    expect(d.routes.find((r) => r.name === '/inbox/:id')?.source).toBe('src/main.tsx:18')
  })

  it('init writes it into the config when --adapter is not given', () => {
    const root = mkdtempSync(join(tmpdir(), 'mk-spa-init-'))
    cpSync(fx('spa-wouter'), root, { recursive: true })
    expect(runCli(['init', '--no-samples'], root).code).toBe(0)
    expect(readFileSync(join(root, 'manual/manual.config.yaml'), 'utf8')).toMatch(/adapter:\n\s+type: react-spa/)
  })
})
