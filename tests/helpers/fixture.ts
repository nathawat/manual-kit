import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

export const FIXTURE = fileURLToPath(new URL('../fixtures/project', import.meta.url))

/** A fresh copy of the fixture project; returns its root (the manual is in <root>/manual). */
export function copyFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'mk-project-'))
  cpSync(FIXTURE, root, { recursive: true })
  return root
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'
import { runInventory } from '../../src/inventory.ts'
import { currentSignature, writeLock } from '../../src/lock.ts'
import { openProject } from '../../src/project.ts'
import { loadShots, manifestKey, shotPath, specHash } from '../../src/shots.ts'

/** 1x1 transparent PNG. */
export const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** Fake media for every shot in every language, with a manifest that matches the specs. */
export function writeFakeMedia(root: string, langs = ['th', 'en']) {
  const manual = join(root, 'manual')
  const shots = loadShots(manual)
  const manifest: Record<string, string> = {}
  for (const lang of langs) {
    mkdirSync(join(manual, 'media', lang), { recursive: true })
    for (const [id, spec] of Object.entries(shots.shots)) {
      writeFileSync(join(manual, shotPath(lang, id)), PNG_1PX)
      manifest[manifestKey(lang, 'shot', id)] = specHash(spec)
    }
  }
  writeFileSync(join(manual, 'media/manifest.json'), JSON.stringify(manifest, null, 2))
}

/** Sign every page as it is now. */
export async function signAll(root: string) {
  const project = await openProject(join(root, 'manual'))
  const pages = Object.fromEntries([...new Set(project.pages.map((p) => p.id))].map((id) => [id, currentSignature(project, id)]))
  writeLock(project.manualDir, { version: 1, pages })
}

/** A fixture copy on which `check` passes: coverage done (roles ignored), media present, every page signed. */
export async function cleanFixture(): Promise<string> {
  const root = copyFixture()
  runInventory(await openProject(join(root, 'manual')))
  const file = join(root, 'manual/coverage.yaml')
  const doc = YAML.parse(readFileSync(file, 'utf8')) as { items: { id: string; status: string; note?: string }[] }
  for (const i of doc.items) if (i.id.startsWith('role:')) Object.assign(i, { status: 'ignored', note: 'one role only' })
  writeFileSync(file, YAML.stringify(doc))
  writeFakeMedia(root)
  await signAll(root)
  return root
}

/** A grey RGB PNG of the given size (for layout tests). */
export function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xc8)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
