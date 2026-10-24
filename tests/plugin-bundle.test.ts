// The Claude Code plugin runs a bundled copy of the CLI with its runtime packages in a separate folder
// (MANUAL_KIT_HOME/node_modules). These tests build the bundle outside the repository, so nothing can resolve from the
// repository's own node_modules, and check that the committed plugin is the bundle of the current source.
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { cleanFixture } from './helpers/fixture.ts'
import { pdfText } from './helpers/pdf.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PLUGIN = join(REPO, 'plugins/manual-kit')
const RUNTIME = ['playwright', 'pagedjs', 'typescript']

let built: string
let home: string

const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const e: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', ...env }
  if (!env.MANUAL_KIT_HOME) delete e.MANUAL_KIT_HOME
  const r = spawnSync(process.execPath, [join(built, 'dist/manual-kit.mjs'), ...args], { cwd, encoding: 'utf8', env: e })
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
}

const tree = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== '.DS_Store')
    .map((d) => relative(dir, join(d.parentPath, d.name)))
    .sort()

beforeAll(() => {
  built = mkdtempSync(join(tmpdir(), 'mk-plugin-'))
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/bundle-plugin.mjs'), '--out', built, '--no-lock'], { encoding: 'utf8' })
  expect(r.stderr).toBe('')
  expect(r.status).toBe(0)
  // the runtime packages in a folder of their own, as the plugin's setup installs them
  home = mkdtempSync(join(tmpdir(), 'mk-home-'))
  mkdirSync(join(home, 'node_modules'))
  for (const name of RUNTIME) symlinkSync(realpathSync(join(REPO, 'node_modules', name)), join(home, 'node_modules', name))
}, 120_000)

describe('plugin bundle', () => {
  it('prints its version without any runtime package', () => {
    const r = run(['--version'], built)
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe(JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version)
  })

  it('says how to get a missing runtime package instead of a stack trace', async () => {
    const root = await cleanFixture()
    const r = run(['build', 'pdf', '--lang', 'th'], root)
    expect(r.code).toBe(2)
    expect(r.stderr).toMatch(/package "playwright" is not installed/)
  })

  it('builds a Thai PDF with fonts and templates from the bundle and packages from MANUAL_KIT_HOME', async () => {
    const root = await cleanFixture()
    const r = run(['build', 'pdf', '--lang', 'th'], root, { MANUAL_KIT_HOME: home })
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const file = join(root, 'manual/dist/user-guide.th.pdf')
    expect(existsSync(file)).toBe(true)
    expect(pdfText(file)).toContain('คู่มือการใช้งานระบบห้องเรียน')
  })

  it('reads code with the TypeScript parser from MANUAL_KIT_HOME (nextjs adapter)', () => {
    const r = run(['discover', '--print'], join(REPO, 'tests/fixtures/next-app'), { MANUAL_KIT_HOME: home })
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
  })

  it('is committed as built from the current source (run: pnpm bundle)', () => {
    for (const f of tree(built).filter((f) => f !== 'runtime/package-lock.json'))
      expect(readFileSync(join(PLUGIN, f)).equals(readFileSync(join(built, f))), `${f} differs; run pnpm bundle`).toBe(true)
    expect(existsSync(join(PLUGIN, 'runtime/package-lock.json'))).toBe(true)
  })

  // macOS ships bash 3.2 as /bin/bash; the wrapper must run there (it once failed to parse)
  const bash = existsSync('/bin/bash') ? '/bin/bash' : 'bash'
  const runBin = (pluginDir: string, args: string[], env: Record<string, string>) => {
    const e: NodeJS.ProcessEnv = { ...process.env, ...env }
    for (const k of ['MANUAL_KIT_HOME', 'CLAUDE_PLUGIN_DATA', 'PLAYWRIGHT_BROWSERS_PATH']) if (!(k in env)) delete e[k]
    const r = spawnSync(bash, [join(pluginDir, 'bin/manual-kit'), ...args], { encoding: 'utf8', env: e })
    return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
  }

  it('bin/manual-kit runs the bundle with the runtime packages once they are installed', () => {
    const ready = mkdtempSync(join(tmpdir(), 'mk-ready-'))
    copyFileSync(join(PLUGIN, 'runtime/package.json'), join(ready, '.installed'))
    const r = runBin(PLUGIN, ['--version'], { MANUAL_KIT_HOME: ready })
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('bin/manual-kit finds the plugin data folder from the plugin cache layout', () => {
    const plugins = mkdtempSync(join(tmpdir(), 'mk-plugins-'))
    const installed = join(plugins, 'cache/manual-kit/manual-kit/0123456789ab')
    cpSync(PLUGIN, installed, { recursive: true, filter: (f) => !f.includes('/dist/') })
    const r = runBin(installed, ['doctor'], {})
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(`home:     ${realpathSync(plugins)}/data/manual-kit-manual-kit`)
    expect(r.stdout).toContain(`browsers: ${realpathSync(plugins)}/data/manual-kit-manual-kit/ms-playwright`)
  })
})
