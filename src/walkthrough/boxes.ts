// media/walkthroughs.json: where each walkthrough target is on its screenshot, measured by `walkthrough measure`
// from the live app in the shot's state. Each screenshot entry keeps a hash of the picture it was measured against,
// so a recaptured screenshot shows up as "measure again".
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Box } from '../capture.ts'
import { shotPath } from '../shots.ts'

export const BOXES_FILE = 'media/walkthroughs.json'

export interface MeasuredShot {
  /** Hash of the screenshot when measured ("missing" when it was not captured). */
  image: string
  /** Target selector -> [x, y, width, height] in screenshot pixels, or null when it was not on the screen. */
  targets: Record<string, [number, number, number, number] | null>
}
/** Key: `<lang>/<shot id>`. */
export type Boxes = Record<string, MeasuredShot>

export const boxKey = (lang: string, shot: string) => `${lang}/${shot}`

export function readBoxes(manualDir: string): Boxes {
  const file = join(manualDir, BOXES_FILE)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Boxes) : {}
}

/** Sorted keys at every level, so measuring again without changes rewrites the same bytes. */
export function writeBoxes(manualDir: string, boxes: Boxes): void {
  const sorted = Object.fromEntries(
    Object.keys(boxes)
      .sort()
      .map((k) => [k, { image: boxes[k]!.image, targets: Object.fromEntries(Object.keys(boxes[k]!.targets).sort().map((t) => [t, boxes[k]!.targets[t]!])) }]),
  )
  const file = join(manualDir, BOXES_FILE)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(sorted, null, 2).replace(/\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2, $3, $4]')}\n`)
}

export function imageHash(manualDir: string, lang: string, shot: string): string {
  const file = join(manualDir, shotPath(lang, shot))
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) : 'missing'
}

export const toBox = ([x, y, width, height]: [number, number, number, number]): Box => ({ x, y, width, height })
