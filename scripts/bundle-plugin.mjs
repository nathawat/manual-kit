#!/usr/bin/env node
// Builds the Claude Code plugin's runnable copy of the CLI (no build step on the teammate's machine):
//   plugins/manual-kit/dist/manual-kit.mjs   one ESM file, every pure-JS dependency inlined
//   plugins/manual-kit/assets, templates     copied from the repository
//   plugins/manual-kit/runtime/package.json  the packages left out of the bundle (installed by the plugin's setup)
// Usage: node scripts/bundle-plugin.mjs [--out <plugin dir>]   (default plugins/manual-kit; tests build elsewhere)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--out')
const out = i > 0 ? resolve(process.argv[i + 1]) : join(repo, 'plugins/manual-kit')

/** Not bundled: a browser driver with its own downloads, a polyfill read as a file, and the 9 MB TypeScript parser. */
export const RUNTIME = ['playwright', 'pagedjs', 'typescript']

const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const installed = (name) => JSON.parse(readFileSync(join(repo, 'node_modules', name, 'package.json'), 'utf8')).version

await build({
  entryPoints: [join(repo, 'src/cli.ts')],
  outfile: join(out, 'dist/manual-kit.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: [...RUNTIME, 'playwright-core'],
  define: { MANUAL_KIT_VERSION: JSON.stringify(pkg.version) },
  // bundled CommonJS packages call require() for Node built-ins
  banner: { js: "import { createRequire as __mkRequire } from 'node:module';\nconst require = __mkRequire(import.meta.url);" },
  legalComments: 'none',
  minify: true,
  logLevel: 'warning',
})

for (const dir of ['assets', 'templates']) {
  rmSync(join(out, dir), { recursive: true, force: true })
  cpSync(join(repo, dir), join(out, dir), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') })
}

// the method skill points Claude at the full reference
mkdirSync(join(out, 'skills/building-product-manuals'), { recursive: true })
cpSync(join(repo, 'docs/reference.md'), join(out, 'skills/building-product-manuals/reference.md'))

const runtime = {
  name: 'manual-kit-runtime',
  private: true,
  description: 'Packages the manual-kit plugin installs at session start (not bundled).',
  dependencies: Object.fromEntries(RUNTIME.map((n) => [n, installed(n)])),
}
mkdirSync(join(out, 'runtime'), { recursive: true })
const runtimeFile = join(out, 'runtime/package.json')
const text = `${JSON.stringify(runtime, null, 2)}\n`
const changed = !existsSync(runtimeFile) || readFileSync(runtimeFile, 'utf8') !== text
writeFileSync(runtimeFile, text)
if (changed && !process.argv.includes('--no-lock')) {
  const { execFileSync } = await import('node:child_process')
  execFileSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: join(out, 'runtime'), stdio: 'inherit' })
}
console.log(`bundled ${join(out, 'dist/manual-kit.mjs')}`)
