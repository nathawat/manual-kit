// Files shipped with the tool. In the repository they sit next to src/; in the plugin bundle (dist/manual-kit.mjs)
// next to dist/. Both are one folder up from this module, so every shipped file is found from here.
export const ROOT = new URL('../', import.meta.url)
export const ASSETS = new URL('assets/', ROOT)
export const TEMPLATES = new URL('templates/pages/', ROOT)
