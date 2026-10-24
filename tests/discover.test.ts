import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runDiscovery, specGaps } from '../src/discover.ts'
import { runCli } from './helpers/cli.ts'
import { copyFixture } from './helpers/fixture.ts'

const APP = fileURLToPath(new URL('fixtures/discover-app', import.meta.url))

function copyApp(): string {
  const root = mkdtempSync(join(tmpdir(), 'mk-discover-'))
  cpSync(APP, root, { recursive: true })
  mkdirSync(join(root, 'node_modules/fake'), { recursive: true })
  writeFileSync(join(root, 'node_modules/fake/index.js'), "throw new Error('from node_modules, never read')")
  return root
}

describe('discover', () => {
  const d = runDiscovery(copyApp())
  const names = (xs: { name: string }[]) => xs.map((x) => x.name)

  it('finds requirement, design and decision documents with titles and headings', () => {
    const byPath = Object.fromEntries(d.docs.map((x) => [x.path, x]))
    expect(byPath['docs/requirements.md']).toMatchObject({ kind: 'requirement', title: 'Product requirements' })
    expect(byPath['docs/requirements.md']!.headings).toContain('  Staff approve refunds')
    expect(byPath['docs/adr/0001-payments.md']!.kind).toBe('decision')
    expect(byPath['README.md']!.kind).toBe('readme')
    expect(byPath['.github/ISSUE_TEMPLATE/bug.md']!.kind).toBe('template')
  })

  it('does not take # lines inside code blocks for headings', () => {
    const root = copyApp()
    writeFileSync(join(root, 'README.md'), '# Shop\n\n```bash\n# install the tools\nnpm i\n```\n\n~~~\n## not a heading\n~~~\n\n## Usage\n')
    const readme = runDiscovery(root).docs.find((x) => x.path === 'README.md')!
    expect(readme.title).toBe('Shop')
    expect(readme.headings).toEqual(['Shop', '  Usage'])
  })

  it('detects the framework and lists screens and API routes with their files', () => {
    expect(d.project.adapter).toBe('nextjs')
    expect(d.routes).toContainEqual({ name: '/orders/new', source: 'app/orders/new/page.tsx' })
    expect(names(d.api)).toEqual(['GET /api/orders', 'POST /api/orders'])
  })

  it('finds roles, permissions and workflow states with file and line', () => {
    expect(names(d.roles)).toEqual(['admin', 'customer', 'staff'])
    expect(d.permissions).toContainEqual({ name: 'orders.refund', source: 'lib/auth.ts:3' })
    const states = Object.fromEntries(d.states.map((s) => [s.name, s]))
    expect(states.OrderStatus).toEqual({ name: 'OrderStatus', values: ['draft', 'paid', 'shipped', 'refunded'], source: 'src/status.ts:1' })
    expect(states.PaymentState!.values).toEqual(['PENDING', 'CAPTURED', 'FAILED'])
    expect(states.STEPS!.values).toEqual(['cart', 'address', 'payment'])
  })

  it('finds form fields and the messages users can meet, never from tests or node_modules', () => {
    expect(d.forms).toContainEqual({ name: 'email', source: 'app/orders/new/page.tsx:6', detail: 'email: E-mail' })
    expect(names(d.messages)).toEqual(expect.arrayContaining(['Enter a valid e-mail address', 'กรุณาระบุจำนวนอย่างน้อย 1 ชิ้น', 'Payments are not set up yet']))
    expect(JSON.stringify(d)).not.toMatch(/from a test|never read/)
  })

  it('lists environment names, flags and integrations but never environment values', () => {
    expect(names(d.env)).toEqual(['DATABASE_URL', 'FEATURE_REFUNDS', 'STRIPE_SECRET_KEY'])
    expect(names(d.flags)).toEqual(['FEATURE_REFUNDS'])
    expect(names(d.integrations)).toEqual(expect.arrayContaining(['Stripe (payments)', 'Database', 'Sign-in / authentication']))
    expect(JSON.stringify(d)).not.toContain('SECRET-VALUE')
  })

  it('records how to run the app and the seed data', () => {
    expect(d.project.scripts).toContainEqual({ name: 'dev', source: 'package.json', detail: 'next dev' })
    expect(d.project.runFiles).toContain('docker-compose.yml')
    expect(d.seed).toEqual(['prisma/seed.ts'])
  })

  it('is deterministic', () => {
    expect(JSON.stringify(runDiscovery(copyApp()))).toBe(JSON.stringify(d))
  })

  it('names the screens, roles, permissions and flags a spec does not mention', () => {
    const { missing } = specGaps(d, '# Spec\n/admin /orders /orders/new; roles: Admin, Staff, Customer. FEATURE_REFUNDS.')
    expect(missing.map((m) => `${m.kind}:${m.name}`)).toEqual(['permission:orders.refund'])
  })
})

describe('discover command', () => {
  it('writes discovery.json and discovery.md into manual/ before init', () => {
    const root = copyApp()
    const r = runCli(['discover'], root)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/3 routes, 3 roles/)
    const md = readFileSync(join(root, 'manual/discovery.md'), 'utf8')
    expect(md).toContain('## Workflow states and value sets')
    expect(md).toContain('**OrderStatus**: `draft` → `paid` → `shipped` → `refunded` (`src/status.ts:1`)')
    expect(JSON.parse(readFileSync(join(root, 'manual/discovery.json'), 'utf8')).version).toBe(1)
  })

  it('uses the manual config (adapter, project root) once there is one', () => {
    const root = copyFixture()
    const r = runCli(['discover', '--print'], root)
    expect(r.code).toBe(0)
    const d = JSON.parse(r.stdout)
    expect(d.project.adapter).toBe('json-i18n')
    expect(d.routes.length).toBeGreaterThan(0)
    expect(existsSync(join(root, 'manual/discovery.json'))).toBe(false)
  })
})

describe('check against manual-spec.md', () => {
  it('warns for each screen or role the spec leaves out, only once a spec exists', () => {
    const root = copyFixture()
    const before = runCli(['check', '--json', '--allow-unsigned'], root)
    expect(JSON.parse(before.stdout).findings.filter((f: { rule: string }) => f.rule === 'spec')).toEqual([])
    writeFileSync(join(root, 'manual/manual-spec.md'), '# Manual spec\n\nNothing yet.\n')
    const after = JSON.parse(runCli(['check', '--json', '--allow-unsigned'], root).stdout)
    const spec = after.findings.filter((f: { rule: string }) => f.rule === 'spec')
    expect(spec.length).toBeGreaterThan(0)
    expect(spec.every((f: { severity: string }) => f.severity === 'warning')).toBe(true)
    expect(spec[0].message).toMatch(/^route "\/.*" \(.*\) is not in manual-spec\.md/)
  })
})
