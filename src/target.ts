// Where a shots.yaml selector is on the page. An element with `display: contents` (a wrapper that carries the test id
// in many React apps) has no box of its own: its box is the union of the rendered elements inside it, and an action
// goes to the first element inside it that can take that action. Hidden and zero-size elements are never resolved.
import type { Locator, Page } from 'playwright'
import type { Box } from './capture.ts'

/** What an action needs from the element it works on, and how a note names it. */
const NEEDS = { click: 'the click', fill: 'the text', select: 'the choice', check: 'the check', focus: 'the key press' }
export type Need = keyof typeof NEEDS

/** In the page: the union box of what a display: contents element renders, or null (not contents, or nothing shown). */
function contentsBox(el: Element): Box | null {
  if (getComputedStyle(el).display !== 'contents') return null
  const rects: DOMRect[] = []
  for (const e of el.querySelectorAll('*')) if (e.checkVisibility({ visibilityProperty: true })) rects.push(e.getBoundingClientRect())
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement!
    if (getComputedStyle(parent).display !== 'contents' || getComputedStyle(parent).visibility === 'hidden') continue
    const range = document.createRange()
    range.selectNodeContents(n)
    rects.push(range.getBoundingClientRect())
  }
  const shown = rects.filter((r) => r.width > 0 && r.height > 0)
  if (!shown.length) return null
  const left = Math.min(...shown.map((r) => r.left))
  const top = Math.min(...shown.map((r) => r.top))
  return { x: left, y: top, width: Math.max(...shown.map((r) => r.right)) - left, height: Math.max(...shown.map((r) => r.bottom)) - top }
}

/**
 * In the page: for a display: contents element, the index (among its descendants in document order) of the first
 * rendered one that can take the action, how many could (not counting one inside another), and how to name it.
 * Null when the element has a box of its own or nothing inside fits: the action then goes to the element itself.
 */
function contentsPick(el: Element, need: Need): { index: number; count: number; name: string } | null {
  if (getComputedStyle(el).display !== 'contents') return null
  const FILL = 'input:not([type=hidden],[type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=image],[type=file],[type=range],[type=color]), textarea, select, [contenteditable]:not([contenteditable=false])'
  const CLICK =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, label, [onclick], [contenteditable]:not([contenteditable=false]), [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=checkbox], [role=radio], [role=switch]'
  const CHECK = 'input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch]'
  const fits = (e: Element) => {
    if (need === 'fill') return e.matches(FILL)
    if (need === 'select') return e.matches('select')
    if (need === 'check') return e.matches(CHECK)
    if (need === 'focus') return (e as HTMLElement).tabIndex >= 0 || e.matches(FILL)
    return e.matches(CLICK) || (e as HTMLElement).tabIndex >= 0
  }
  const all = [...el.querySelectorAll('*')]
  const picked = all.filter((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && e.checkVisibility({ visibilityProperty: true }) && fits(e)
  })
  if (!picked.length) return null
  const first = picked[0]!
  const text = ((first as HTMLElement).innerText || first.getAttribute('aria-label') || first.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return {
    index: all.indexOf(first),
    count: picked.filter((e) => !picked.some((o) => o !== e && o.contains(e))).length,
    name: `${first.tagName.toLowerCase()}${text ? ` ${JSON.stringify(text)}` : ''}`,
  }
}

/**
 * The element's box in the viewport: its own, or for a display: contents element the union of what it renders.
 * Null when it has no box (hidden, zero-size, nothing rendered inside). Throws as `boundingBox` does when nothing matches.
 */
export async function targetBox(loc: Locator, timeout: number): Promise<Box | null> {
  return (await loc.boundingBox({ timeout })) ?? (await loc.evaluate(contentsBox, undefined, { timeout }).catch(() => null))
}

/**
 * The element an action on `selector` goes to: the match itself, or for a display: contents match the first element
 * inside it that can take the action. `note` says which one was used when several could.
 */
export async function actionTarget(page: Page, verb: string, selector: string, need: Need): Promise<{ locator: Locator; note?: string }> {
  const loc = page.locator(selector)
  const pick = await loc.evaluate(contentsPick, need)
  if (!pick) return { locator: loc }
  const note =
    pick.count > 1
      ? `${verb} ${JSON.stringify(selector)} has no box of its own (display: contents); used the first of ${pick.count} elements inside it that can take ${NEEDS[need]}: ${pick.name}`
      : undefined
  return { locator: loc.locator('*').nth(pick.index), note }
}
