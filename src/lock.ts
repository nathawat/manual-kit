// manual.lock.json: what a person signed. A page's signature = hashes of its language files and its sources.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Project } from './project.ts'

export const LOCK_FILE = 'manual.lock.json'

const Signature = z.object({ files: z.record(z.string(), z.string()), sources: z.record(z.string(), z.string()) })
export type Signature = z.infer<typeof Signature>
const LockFile = z.object({ version: z.literal(1), pages: z.record(z.string(), Signature) })
export type Lock = z.infer<typeof LockFile>

export const MISSING = 'missing'
const hashFile = (file: string) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : MISSING)

export function readLock(manualDir: string): Lock {
  const file = join(manualDir, LOCK_FILE)
  if (!existsSync(file)) return { version: 1, pages: {} }
  const parsed = LockFile.safeParse(JSON.parse(readFileSync(file, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid ${LOCK_FILE}; delete it and sign again`)
  return parsed.data
}

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))

export function writeLock(manualDir: string, lock: Lock): boolean {
  const text = `${JSON.stringify({ version: 1, pages: sortKeys(lock.pages) }, null, 2)}\n`
  const file = join(manualDir, LOCK_FILE)
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false
  writeFileSync(file, text)
  return true
}

/** The current signature of a page id (all languages; sources of every language version). */
export function currentSignature(project: Project, id: string): Signature {
  const versions = project.pages.filter((p) => p.id === id)
  const files: Record<string, string> = {}
  const sources: Record<string, string> = {}
  for (const p of versions) {
    files[p.rel] = hashFile(p.file)
    for (const s of p.meta.sources) sources[s] = hashFile(join(project.projectRoot, s))
  }
  return { files: sortKeys(files), sources: sortKeys(sources) }
}

/** What differs between a stored signature and now. */
export function signatureDiff(stored: Signature, now: Signature): { files: string[]; sources: string[] } {
  const diff = (a: Record<string, string>, b: Record<string, string>) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort()
  return { files: diff(stored.files, now.files), sources: diff(stored.sources, now.sources) }
}
