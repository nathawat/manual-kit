import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runCli } from './helpers/cli.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

describe('cli', () => {
  it('prints the package version', () => {
    const r = runCli(['--version'])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe(pkg.version)
  })

  it('lists the v0 commands in --help', () => {
    const r = runCli(['--help'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('manual-kit')
  })
})
