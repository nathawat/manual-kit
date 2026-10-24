import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url))

/** Run the CLI the way a user would (node + the TypeScript entry, no build step). */
export function runCli(args: string[], cwd?: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } })
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr }
}

/** Like runCli, but does not block the event loop (needed when the test process also serves HTTP). */
export function runCliAsync(args: string[], cwd?: string, env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}
