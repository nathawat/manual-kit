// Why a shot, step or login failed: what a selector matched instead, which hosts the allowlist refused, and a
// screenshot of the page at that moment under <manual>/.manual-kit/failures/ (ignored by git).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Page } from 'playwright'

/** A failure in the browser whose message already says what went wrong and what to try. */
export class CaptureFailure extends Error {}

const FAILURES = '.manual-kit/failures'

/** Start a run without the screenshots of the previous one; the folder ignores itself so it never gets committed. */
export function resetFailures(manualDir: string) {
  rmSync(join(manualDir, FAILURES), { recursive: true, force: true })
  mkdirSync(join(manualDir, FAILURES), { recursive: true })
  writeFileSync(join(manualDir, '.manual-kit/.gitignore'), '*\n')
}

/** The page URL without query or fragment: a sign-in callback carries codes there that must not reach a log. */
export const bare = (url: string) => {
  try {
    const u = new URL(url)
    return `${u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin}${u.pathname}`
  } catch {
    return url
  }
}

/** First line of an error, with query strings cut from URLs in it (sign-in codes). */
export const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')

/**
 * The full failure message: the cause, the hosts the allowlist refused while this page was open, and where the
 * screenshot of the page was saved (`name` becomes the file name).
 */
export async function failureReport(page: Page, manualDir: string, name: string, e: unknown, blocked: Set<string>, cover?: () => Promise<void>): Promise<string> {
  const lines = [e instanceof CaptureFailure ? e.message : firstLine(e)]
  if (blocked.size)
    lines.push(
      `  blocked by capture allowlist: ${[...blocked].sort().join(', ')} (add it to capture.allowlist in manual.config.yaml if the page needs it, or to capture.assetHosts if it only serves CSS, fonts or images)`,
    )
  const file = join(manualDir, FAILURES, `${name.replace(/[^\w.-]+/g, '-')}.png`)
  mkdirSync(join(manualDir, FAILURES), { recursive: true })
  const url = bare(page.url())
  // the page may show private data: no screenshot unless it is covered the way captured images are
  const saved = await (cover ?? (async () => {}))()
    .then(() => page.screenshot({ path: file, timeout: 5_000 }))
    .then(() => true)
    .catch(() => false)
  writeFileSync(file.replace(/\.png$/, '.txt'), `${url}\n\n${lines.join('\n')}\n`)
  lines.push(saved ? `  page at failure: ${relative(process.cwd(), file)} (${url})` : `  page at failure: ${url} (no screenshot: the page was gone)`)
  return lines.join('\n')
}

/**
 * Words the author probably meant by a selector: quoted text, `text=` values, ids, classes and attribute values, then
 * their parts (save-btn -> save) as weaker guesses.
 */
export function selectorNeedles(selector: string): string[] {
  const strong = [
    ...[...selector.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]!),
    ...[...selector.matchAll(/text=([^"'>][^>]*)/g)].map((m) => m[1]!.trim()),
    ...[...selector.replace(/"[^"]*"|'[^']*'/g, '').matchAll(/[#.]([\w-]+)|=\s*([\w-]+)\s*\]/g)].map((m) => m[1] ?? m[2]!),
  ]
  const parts = strong.flatMap((s) => s.split(/[-_\s]+/)).filter((s) => s.length >= 4)
  return [...new Set([...strong, ...parts].map((s) => s.toLowerCase()).filter(Boolean))]
}

interface Candidate {
  tag: string
  text: string
  /** The test hook attribute the element carries, and its value. */
  hook?: { attr: string; value: string }
  id?: string
  visible: boolean
}

/** In the page: the deepest elements whose text or test hook contains a needle (at most 5, visible ones first). */
function findNearMisses(needles: string[]): Candidate[] {
  const HOOKS = ['data-testid', 'data-test', 'data-cy', 'id', 'aria-label', 'name', 'placeholder', 'title']
  const textOf = (e: Element) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim().replace(/\s+/g, ' ')
  const byText = new Set<Element>()
  const byHook = new Set<Element>()
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('script, style, noscript, #manual-kit-highlight')) continue
    const text = textOf(e).toLowerCase()
    if (needles.some((n) => text.includes(n))) byText.add(e)
    if (needles.some((n) => HOOKS.some((a) => (e.getAttribute(a) ?? '').toLowerCase().includes(n)))) byHook.add(e)
  }
  // a container matches by text whenever a child does; keep the child
  const hits = [...new Set([...byText, ...byHook])].filter((e) => byHook.has(e) || ![...byText].some((o) => o !== e && e.contains(o)))
  const rank = (e: Element) => {
    const text = textOf(e).toLowerCase()
    return (e.checkVisibility() ? 0 : 100) + (needles.some((n) => text === n) ? 0 : 10) + Math.min(text.length, 99) / 100
  }
  return hits
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 5)
    .map((e) => ({
      tag: e.tagName.toLowerCase(),
      text: textOf(e).slice(0, 60),
      hook: ['data-testid', 'data-test', 'data-cy'].map((attr) => ({ attr, value: e.getAttribute(attr) })).find((h): h is { attr: string; value: string } => h.value !== null),
      id: e.id || undefined,
      visible: e.checkVisibility(),
    }))
}

const quote = (s: string) => JSON.stringify(s)

/** A selector that finds the candidate: its test hook, a readable id, or its exact text. */
function suggest(c: Candidate): string {
  if (c.hook) return `[${c.hook.attr}=${quote(c.hook.value)}]`
  if (c.id && /^[A-Za-z][\w-]*$/.test(c.id)) return `#${c.id}`
  return c.text.length <= 40 ? `${c.tag}:text-is(${quote(c.text)})` : `${c.tag}:has-text(${quote(c.text.slice(0, 30))})`
}

/**
 * Why `verb "selector"` failed, from what the selector matches now: nothing (with similar elements to try instead),
 * several elements (with their texts and a way to pick one), or one that cannot be used (not visible).
 */
export async function explainSelector(page: Page, verb: string, selector: string, e: unknown): Promise<CaptureFailure> {
  const head = `${verb} ${quote(selector)}`
  const loc = page.locator(selector)
  const count = await loc.count().catch(() => -1)
  if (count < 0) return new CaptureFailure(`${head}: ${firstLine(e)}`)
  if (count === 0) {
    const near = await page.evaluate(findNearMisses, selectorNeedles(selector)).catch(() => [] as Candidate[])
    const hints = near.map((c) => `    ${c.tag} ${quote(c.text)}${c.visible ? '' : ' (not visible)'} -> ${suggest(c)}`)
    return new CaptureFailure(`${head}: no element matches${hints.length ? `; similar elements on the page:\n${hints.join('\n')}` : ' (and none has similar text or test id)'}`)
  }
  if (count > 1) {
    const els = await loc.evaluateAll((all) =>
      all.map((el) => ({ text: ((el as HTMLElement).innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40), visible: el.checkVisibility() })),
    )
    const shown = els.slice(0, 3).map((x) => `${quote(x.text)}${x.visible ? '' : ' hidden'}`)
    const someHidden = els.some((x) => !x.visible) && els.some((x) => x.visible)
    const text = (els.find((x) => x.visible && x.text) ?? els.find((x) => x.text))?.text
    return new CaptureFailure(
      `${head}: ${count} elements match (${shown.join(', ')}${count > 3 ? ', ...' : ''}); pick one with ${quote(`${selector} >> ${someHidden ? 'visible=true' : 'nth=0'}`)}${text ? ` or by exact text, e.g. ${quote(`${selector}:text-is(${quote(text)})`)}` : ''}`,
    )
  }
  // display: contents and zero-size elements match but have no box to click or frame
  const box = await loc.boundingBox({ timeout: 1_000 }).catch(() => null)
  return new CaptureFailure(
    `${head}: ${firstLine(e)}${box ? '' : ' (the element matches but has no visible box: hidden, zero-size, or a display: contents wrapper; point at the visible element inside it)'}`,
  )
}
