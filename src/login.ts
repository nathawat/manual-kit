// login: a person signs in by hand in a browser window (SSO, 2FA, national ID), and the session is saved for capture.
// The window reaches any host, since sign-in pages live outside capture.allowlist; capture later uses only the saved file.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Page } from 'playwright'
import { absolute, authFile, waitForSignal } from './capture.ts'
import { lazyDep } from './deps.ts'
import type { Project } from './project.ts'
import { AUTH_DIR, isSaved, loadShots } from './shots.ts'
import { UsageError } from './sign.ts'

const playwright = lazyDep<typeof import('playwright')>('playwright')

export interface LoginOptions {
  /** No window (tests); a person needs one. */
  headless?: boolean
  /** Resolves when the person says the sign-in is done; default: Enter in the terminal. */
  enter?: (signal: AbortSignal) => Promise<void>
  /** Runs on the opened page alongside the wait; tests sign in with it as a person would. */
  person?: (page: Page) => Promise<void>
  say?: (line: string) => void
}

function pressEnter(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin })
    rl.once('line', () => resolve())
    signal.addEventListener('abort', () => rl.close(), { once: true })
  })
}

/** Open the login's start page, wait until the person has signed in, and save the session. Returns the file written. */
export async function runLogin(project: Project, name: string, opts: LoginOptions = {}): Promise<string> {
  const { logins } = loadShots(project.manualDir)
  const login = logins[name]
  if (!login) throw new UsageError(`login "${name}" is not in shots.yaml logins (${Object.keys(logins).join(', ') || 'none defined'})`)
  if (!isSaved(login)) throw new UsageError(`login "${name}" signs in with actions during capture; to sign in by hand instead, give it storageState: true (and until) in shots.yaml`)
  const say = opts.say ?? console.log
  const lang = project.primary
  const browser = await playwright.chromium.launch({ headless: opts.headless ?? false })
  const done = new AbortController()
  try {
    const context = await browser.newContext({ viewport: null, locale: lang })
    const page = await context.newPage()
    await page.goto(absolute(project.config, login.url, lang))
    say(
      login.until
        ? `Sign in in the browser window. manual-kit saves the session when ${'selector' in login.until ? `${login.until.selector} appears` : `the address starts with ${login.until.url}`}, or press Enter once you are signed in.`
        : 'Sign in in the browser window, then press Enter here.',
    )
    const waits: Promise<unknown>[] = [
      (opts.enter ?? pressEnter)(done.signal),
      new Promise((_, reject) => page.once('close', () => reject(new UsageError('the browser window was closed before the sign-in finished; nothing was saved')))),
    ]
    if (login.until) waits.push(waitForSignal(page, login.until, project.config, lang, 0))
    if (opts.person) waits.push(opts.person(page).then(() => new Promise(() => {})))
    for (const w of waits) w.catch(() => {})
    await Promise.race(waits)
    const file = authFile(project.manualDir, name)
    mkdirSync(join(project.manualDir, AUTH_DIR), { recursive: true })
    writeFileSync(join(project.manualDir, AUTH_DIR, '.gitignore'), '*\n')
    writeFileSync(file, JSON.stringify(await context.storageState()), { mode: 0o600 })
    chmodSync(file, 0o600)
    return file
  } finally {
    done.abort()
    await browser.close()
  }
}
