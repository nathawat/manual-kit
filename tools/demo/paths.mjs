// Shared paths for the demo-video scripts.
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = fileURLToPath(new URL('.', import.meta.url))
export const REPO = resolve(HERE, '../..')
/** Frames, timeline, narration audio, page images and the generated scenes. Big (about 2700 JPEGs): keep it out of the repo. */
export const WORK = resolve(process.env.DEMO_WORK ?? join(tmpdir(), 'mk-demo'))
/** The built manual web site the web scenes play in: manual-kit's own manual. */
export const WEB = resolve(process.env.DEMO_WEB ?? join(REPO, 'docs/manual/dist/web'))
export const PORT = Number(process.env.DEMO_PORT ?? 8765)
export const BASE = `http://127.0.0.1:${PORT}`
export const require = createRequire(join(REPO, 'package.json'))
