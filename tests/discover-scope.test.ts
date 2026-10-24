import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { runDiscovery, specGaps, type Discovery } from '../src/discover.ts'
import { openProject } from '../src/project.ts'
import { runCli } from './helpers/cli.ts'

const WORKSPACE = fileURLToPath(new URL('fixtures/workspace', import.meta.url))

/** A fresh copy of the two-repo workspace (web + prototype); `discover` is merged into its manual config. */
function workspace(discover?: { include?: string[]; exclude?: string[] }): string {
  const root = mkdtempSync(join(tmpdir(), 'mk-workspace-'))
  cpSync(WORKSPACE, root, { recursive: true })
  if (discover) setScope(root, discover)
  return root
}

function setScope(root: string, discover: { include?: string[]; exclude?: string[] }) {
  const file = join(root, 'manual/manual.config.yaml')
  writeFileSync(file, YAML.stringify({ ...YAML.parse(readFileSync(file, 'utf8')), discover }))
}

const discover = (root: string): Discovery => JSON.parse(runCli(['discover', '--print'], root).stdout)
const names = (xs: { name: string }[]) => xs.map((x) => x.name)

describe('discover scope (two repos in one workspace)', () => {
  it('reads every repo when no scope is set, and suggests one', () => {
    const root = workspace()
    const d = discover(root)
    expect(names(d.roles)).toEqual(['admin', 'executive'])
    expect(names(d.flags)).toEqual(['FEATURE_BETA_CHARTS', 'FEATURE_EXPORT'])
    expect(d.project.packageRoots).toEqual(['prototype', 'web'])
    const r = runCli(['discover'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('found 2 package roots: prototype, web')
    expect(r.stdout).toContain('discover:\n  exclude:\n    - prototype/**\n    - web/**')
  })

  const forms: [string, { include?: string[]; exclude?: string[] }][] = [
    ['exclude a folder', { exclude: ['prototype'] }],
    ['exclude a glob', { exclude: ['prototype/**'] }],
    ['include the app', { include: ['web/**'] }],
  ]
  for (const [form, scope] of forms) {
    it(`never reads the other repo (${form})`, () => {
      const root = workspace(scope)
      const r = runCli(['discover'], root)
      expect(r.code).toBe(0)
      expect(r.stdout).not.toContain('package roots')
      const json = readFileSync(join(root, 'manual/discovery.json'), 'utf8')
      const d = JSON.parse(json) as Discovery
      expect(names(d.routes)).toEqual(['/', '/settings/roles', '/settings/roles/:id/edit', '/settings/roles/create', '/users'])
      expect(names(d.roles)).toEqual(['admin'])
      expect(names(d.flags)).toEqual(['FEATURE_EXPORT'])
      expect(names(d.env)).toEqual(['FEATURE_EXPORT', 'VITE_API_URL'])
      expect(d.docs.map((x) => x.path)).toEqual(['web/README.md'])
      expect(d.uiStrings.sample).toEqual(['Documents', 'Roles', 'New role', 'Edit role', 'Users'])
      expect(d.project.packageRoots).toEqual(['web'])
      expect(json).not.toMatch(/prototype|executive|mock-dashboard|BETA_CHARTS|Executive dashboard/)
      expect(readFileSync(join(root, 'manual/discovery.md'), 'utf8')).not.toMatch(/prototype|executive/i)
    })
  }

  it('keeps excluded items out of coverage.yaml, also those an earlier unscoped run wrote', () => {
    const root = workspace()
    expect(runCli(['inventory'], root).code).toBe(0)
    const coverage = () => readFileSync(join(root, 'manual/coverage.yaml'), 'utf8')
    expect(coverage()).toContain('role:executive')
    setScope(root, { exclude: ['prototype'] })
    expect(runCli(['inventory'], root).code).toBe(0)
    expect(coverage()).not.toMatch(/prototype|executive|mock-dashboard|BETA_CHARTS/)
    const ids = (YAML.parse(coverage()) as { items: { id: string; status: string }[] }).items.map((i) => `${i.id} ${i.status}`)
    expect(ids).toEqual([
      'flag:FEATURE_EXPORT unmapped',
      'role:admin unmapped',
      'route:/ unmapped',
      'route:/settings/roles unmapped',
      'route:/settings/roles/:id/edit unmapped',
      'route:/settings/roles/create unmapped',
      'route:/users unmapped',
    ])
  })

  it('init suggests discover.exclude for a workspace of several package roots', () => {
    const root = workspace()
    rmSync(join(root, 'manual'), { recursive: true })
    const r = runCli(['init', '--no-samples', '--languages', 'en'], root)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('found 2 package roots: prototype, web')
    expect(r.stdout).toContain('    - prototype/**')
  })
})

describe('route globs in manual-spec.md', () => {
  it('a backticked glob names every route under it and reports a glob that matches none', async () => {
    const project = await openProject(join(workspace({ exclude: ['prototype'] }), 'manual'))
    const d = runDiscovery(project.projectRoot, { adapter: { type: 'generic', adapter: project.adapter }, scope: project.config.discover })
    const spec = '# Spec\n\nRoles screen: `/settings/roles*`\nHome `/`. Roles: admin. FEATURE_EXPORT.\n\n- `/reports*` (later)\n'
    const gaps = specGaps(d, spec)
    expect(gaps.missing.map((t) => `${t.kind}:${t.name}`)).toEqual(['route:/users'])
    expect(gaps.unmatched).toEqual([{ glob: '/reports*', line: 6 }])
  })

  it('check warns for a glob that matches no route, at its line', () => {
    const root = workspace({ exclude: ['prototype'] })
    writeFileSync(join(root, 'manual/manual-spec.md'), '# Spec\n\n- Roles: `/settings/roles*`, admin, FEATURE_EXPORT\n- Home `/`, users `/users`\n- `/reports*`\n')
    const r = JSON.parse(runCli(['check', '--json', '--allow-unsigned'], root).stdout)
    const spec = r.findings.filter((f: { rule: string }) => f.rule === 'spec')
    expect(spec).toEqual([
      expect.objectContaining({ severity: 'warning', file: 'manual-spec.md', line: 5, message: 'route glob `/reports*` matches no discovered route: fix it or remove it' }),
    ])
  })
})
