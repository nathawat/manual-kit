// Runtime packages that are not bundled into the plugin build (browser automation, the paged-media polyfill and the
// TypeScript parser). The plugin installs them in one folder outside the plugin and points MANUAL_KIT_HOME at it
// (node_modules inside it). Node's ESM loader ignores NODE_PATH, so they are loaded with a require rooted there;
// without MANUAL_KIT_HOME they resolve from this module as usual (repository checkout, tests).
import { createRequire } from 'node:module'
import { join } from 'node:path'

const home = process.env.MANUAL_KIT_HOME
const requireDep = createRequire(home ? join(home, 'resolve.cjs') : import.meta.url)

export function dep<T>(name: string): T {
  try {
    return requireDep(name) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' && String((e as Error).message).includes(`'${name}'`))
      throw new Error(`package "${name}" is not installed${home ? ` in ${home}` : ''}; the plugin installs it at session start (or run "manual-kit setup")`)
    throw e
  }
}

/** Resolve a file inside an installed package (e.g. the pagedjs polyfill). */
export const resolveDep = (name: string) => requireDep.resolve(name)

/** A package loaded on first use, so commands that never need it (e.g. --version, check) run without it. */
export function lazyDep<T extends object>(name: string): T {
  let mod: T | undefined
  return new Proxy({} as T, { get: (_t, key) => Reflect.get((mod ??= dep<T>(name)), key) })
}
