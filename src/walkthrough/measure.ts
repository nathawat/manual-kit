// walkthrough measure: open each screenshot's screen again (same login, URL and actions as capture) and record where
// every walkthrough target is. `--list` prints the visible controls of one shot to pick targets from.
import type { Page } from 'playwright'
import { allowed, openSession, openShot } from '../capture.ts'
import type { Project } from '../project.ts'
import { targetBox } from '../target.ts'
import { UsageError } from '../sign.ts'
import { loadShots } from '../shots.ts'
import { boxKey, imageHash, readBoxes, writeBoxes, type Boxes } from './boxes.ts'

export interface MeasureResult {
  measured: { lang: string; shot: string; targets: number }[]
  missing: { lang: string; shot: string; target: string }[]
}

/** Shots and their targets that the walkthroughs (all, or `only`) need. */
function targetsByShot(project: Project, only?: string): Map<string, Set<string>> {
  const shots = loadShots(project.manualDir)
  if (only && !shots.walkthroughs[only]) throw new UsageError(`walkthrough "${only}" is not in shots.yaml (${Object.keys(shots.walkthroughs).join(', ') || 'none defined'})`)
  const need = new Map<string, Set<string>>()
  for (const [id, w] of Object.entries(shots.walkthroughs)) {
    if (only && id !== only) continue
    for (const sc of w.scenes) for (const st of sc.steps) (need.get(sc.shot) ?? need.set(sc.shot, new Set()).get(sc.shot)!).add(st.target)
  }
  return need
}

function checkHosts(project: Project) {
  const { capture } = project.config
  if (!allowed(capture.baseUrl, capture.allowlist)) throw new UsageError(`${new URL(capture.baseUrl).hostname} is not in capture.allowlist (${capture.allowlist.join(', ')})`)
}

export async function runMeasure(project: Project, opts: { only?: string; lang?: string } = {}): Promise<MeasureResult> {
  checkHosts(project)
  const shots = loadShots(project.manualDir)
  const need = targetsByShot(project, opts.only)
  const boxes: Boxes = readBoxes(project.manualDir)
  const result: MeasureResult = { measured: [], missing: [] }
  if (!need.size) return result
  const session = await openSession(project, shots, new Set())
  try {
    for (const lang of project.config.languages) {
      if (opts.lang && opts.lang !== lang) continue
      for (const [shot, targets] of [...need].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const { context, page } = await openShot(session, project, shots.shots[shot]!, lang)
        try {
          const entry = { image: imageHash(project.manualDir, lang, shot), targets: { ...(boxes[boxKey(lang, shot)]?.targets ?? {}) } }
          for (const target of targets) {
            const b = await targetBox(page.locator(target).first(), 4_000).catch(() => null)
            entry.targets[target] = b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null
            if (!b) result.missing.push({ lang, shot, target })
          }
          boxes[boxKey(lang, shot)] = entry
          result.measured.push({ lang, shot, targets: targets.size })
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    await session.close()
    writeBoxes(project.manualDir, boxes)
  }
  return result
}

export interface Control {
  text: string
  /** data-cy / data-testid / id, whichever the element has first. */
  hook: string
  /** A selector that finds it (for `target`). */
  selector: string
  box: [number, number, number, number]
}

/** Buttons, links, tabs, inputs and test hooks visible on a shot's screen, top to bottom. */
export async function listControls(project: Project, shot: string, lang = project.primary): Promise<Control[]> {
  checkHosts(project)
  const shots = loadShots(project.manualDir)
  const spec = shots.shots[shot]
  if (!spec?.url) throw new UsageError(`shot "${shot}" is not an app screen in shots.yaml`)
  const session = await openSession(project, shots, new Set())
  try {
    const { page } = await openShot(session, project, spec, lang)
    return await visibleControls(page)
  } finally {
    await session.close()
  }
}

async function visibleControls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const out: { text: string; hook: string; selector: string; box: [number, number, number, number] }[] = []
    const seen = new Set<string>()
    const q = (s: string) => JSON.stringify(s)
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, [data-cy], [data-testid]')) {
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.opacity === '0') continue
      const text = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      const cy = el.getAttribute('data-cy')
      const tid = el.getAttribute('data-testid')
      const hook = cy ? `data-cy=${cy}` : tid ? `data-testid=${tid}` : el.id ? `#${el.id}` : ''
      if (!text && !hook) continue
      const selector = cy ? `[data-cy=${q(cy)}]` : tid ? `[data-testid=${q(tid)}]` : el.id ? `#${CSS.escape(el.id)}` : `text=${q(text)} >> nth=0`
      const box: [number, number, number, number] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
      const key = `${selector}|${box.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ text, hook, selector, box })
    }
    return out.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0])
  })
}
