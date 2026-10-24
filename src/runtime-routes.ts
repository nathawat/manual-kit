// discover --runtime: the route table of the running app, read from its Vue Router (Nuxt 3/4, Nuxt 2, any Vue app).
// Opened like capture: allowlisted hosts only, optionally signed in with a login from shots.yaml.
import type { Evidence } from './discover.ts'
import { absolute, allowed, goto, openSession } from './capture.ts'
import type { Project } from './project.ts'
import { loadShots } from './shots.ts'
import { UsageError } from './sign.ts'

export interface RuntimeRoute {
  path: string
  name?: string
  /** The path of the record this one is an alias of (Vue Router 4 lists alias records with the same name). */
  aliasOf?: string
}

/** In the page: the router's routes, or null while no Vue Router is reachable. */
function readRouter(): RuntimeRoute[] | null {
  type Router = { getRoutes?: () => { path: string; name?: unknown; aliasOf?: { path: string } }[]; options?: { routes?: Tree[] } }
  type Tree = { path: string; name?: unknown; children?: Tree[] }
  type Mounted = Element & { __vue_app__?: { config?: { globalProperties?: { $router?: Router } } }; __vue__?: { $router?: Router } }
  const mounts = [document.querySelector('#__nuxt'), document.querySelector('#app'), ...document.querySelectorAll('[data-v-app]')] as (Mounted | null)[]
  let router: Router | undefined
  for (const el of mounts) router ??= el?.__vue_app__?.config?.globalProperties?.$router ?? el?.__vue__?.$router
  router ??= (window as { $nuxt?: { $router?: Router } }).$nuxt?.$router
  if (!router) return null
  const named = (name: unknown) => (name === undefined || name === null ? {} : { name: String(name) })
  if (typeof router.getRoutes === 'function') return router.getRoutes().map((r) => ({ path: r.path, ...named(r.name), ...(r.aliasOf ? { aliasOf: r.aliasOf.path } : {}) }))
  const out: RuntimeRoute[] = []
  const visit = (routes: Tree[] | undefined, parent: string) => {
    for (const r of routes ?? []) {
      const path = r.path.startsWith('/') ? r.path : `${parent.replace(/\/$/, '')}/${r.path}`
      out.push({ path, ...named(r.name) })
      visit(r.children, path)
    }
  }
  visit(router.options?.routes, '')
  return out
}

/** Open `url` (relative to capture.baseUrl) and read the router's full route table, waiting up to capture.settle.timeoutMs for the app to mount. */
export async function readRuntimeRoutes(project: Project, opts: { url: string; login?: string | undefined }): Promise<RuntimeRoute[]> {
  const { config } = project
  const shots = loadShots(project.manualDir)
  if (opts.login && !shots.logins[opts.login])
    throw new UsageError(`login "${opts.login}" is not in shots.yaml (logins: ${Object.keys(shots.logins).join(', ') || 'none'})`)
  const lang = project.primary
  const url = absolute(config, opts.url, lang)
  if (!allowed(url, config.capture.allowlist)) throw new UsageError(`${new URL(url).hostname} is not in capture.allowlist (${config.capture.allowlist.join(', ')})`)
  const session = await openSession(project, shots, new Set())
  try {
    const { page } = await session.open(opts.login ? { login: opts.login } : {}, lang)
    await goto(page, url, config)
    try {
      const handle = await page.waitForFunction(readRouter, undefined, { timeout: Math.max(config.capture.settle.timeoutMs, 1000) })
      return (await handle.jsonValue()) as RuntimeRoute[]
    } catch {
      throw new UsageError(
        `no Vue Router found at ${url}: looked for __vue_app__ on #__nuxt, #app and [data-v-app] (Vue 3) and window.$nuxt or __vue__ (Vue 2). Check that the page loads${opts.login ? '' : ' (sign in with --login <name> if it needs a login)'} and that the app uses Vue Router`,
      )
    }
  } finally {
    await session.close()
  }
}

/** Nuxt's runtime paths say `:id()` for a plain param; the static scan writes `:id`. */
const normalize = (path: string) => path.replace(/\(\)/g, '')

/**
 * Routes the static scan did not find. Routes that share a name apart from an @nuxtjs/i18n `___<locale>` suffix are one
 * route in several languages: known if any of its paths is known, else listed once with the others as alternates.
 */
export function runtimeOnly(known: Set<string>, routes: RuntimeRoute[]): Evidence[] {
  const groups = new Map<string, string[]>()
  for (const r of routes) {
    const path = normalize(r.path)
    const key = r.name && !r.aliasOf ? `name:${r.name.replace(/___[\w-]+$/, '')}` : `path:${path}`
    groups.set(key, [...(groups.get(key) ?? []), path])
  }
  const out: Evidence[] = []
  for (const paths of groups.values()) {
    const [main, ...alternates] = [...new Set(paths)].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
    if (!main || paths.some((p) => known.has(p))) continue
    out.push({ name: main, source: 'runtime', detail: ['found only at runtime', ...(alternates.length ? [`alternates ${alternates.join(', ')}`] : [])].join('; ') })
  }
  return out
}
