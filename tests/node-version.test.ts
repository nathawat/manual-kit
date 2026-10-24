// One minimum Node version everywhere: package.json engines, the plugin's check (env.sh, used by the SessionStart
// hook, bin/manual-kit and doctor), the README and the reference. The bundle and dist/ use fs.globSync, stable (no
// ExperimentalWarning) from Node 22.17; running src/*.ts directly needs type stripping (22.18, repo development only).
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EVERYWHERE, files } from '../src/adapters/common.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MIN = '22.17'
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8')

/** mk_check_node from env.sh with a fake `node` that reports `version`. */
function checkNode(version: string) {
  const bin = mkdtempSync(join(tmpdir(), 'mk-node-'))
  writeFileSync(join(bin, 'node'), `#!/bin/sh\ncase "$*" in *versions*) echo "${version}";; *) echo "v${version}";; esac\n`)
  chmodSync(join(bin, 'node'), 0o755)
  const script = `PLUGIN_ROOT="${join(REPO, 'plugins/manual-kit')}"; MANUAL_KIT_HOME=/nonexistent; . "$PLUGIN_ROOT/scripts/env.sh"; mk_check_node`
  return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: tmpdir() } })
}

describe('minimum Node version', () => {
  it('is the same in package.json, README, reference, plugin check and the user guide', () => {
    expect(JSON.parse(read('package.json')).engines.node).toBe(`>=${MIN}`)
    expect(read('README.md')).toContain(`Node.js ${MIN} ขึ้นไป`)
    expect(read('docs/reference.md')).toContain(`Node.js ${MIN}`)
    expect(read('plugins/manual-kit/scripts/env.sh')).toContain(`Node.js ${MIN} or newer is needed`)
    for (const page of ['docs/manual/pages/th/user-guide/02-install.md', 'docs/manual/pages/th/user-guide/09-troubleshooting.md'])
      expect(read(page)).toContain(`Node.js ${MIN} or newer is needed`)
    for (const f of ['README.md', 'docs/reference.md', 'plugins/manual-kit/scripts/env.sh']) expect(read(f)).not.toMatch(/Node(\.js)? 2[0-9](?!\.)/)
  })

  it('the plugin refuses an older Node and accepts the minimum', () => {
    const old = checkNode('22.16.0')
    expect(old.status).toBe(3)
    expect(old.stderr).toContain(`Node.js ${MIN} or newer is needed; this is v22.16.0`)
    expect(checkNode('21.9.0').status).toBe(3)
    for (const ok of ['22.17.0', '22.23.3', '24.1.0']) expect(checkNode(ok).status).toBe(0)
  })

  it('finds dot files below ** on every supported Node (globSync before 22.23 skipped them)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mk-glob-'))
    for (const d of ['', 'a', 'a/b']) {
      mkdirSync(join(root, d), { recursive: true })
      writeFileSync(join(root, d, '.env.example'), 'A=1\n')
    }
    expect(files(root, EVERYWHERE, ['**/.env.example'])).toEqual(['.env.example', 'a/.env.example', 'a/b/.env.example'])
  })
})
