// Records the demo: drives the scenes in a 1280x720 stage page and takes a JPEG of the stage as fast as it can.
// Each scene lasts at least as long as its narration (WORK/voice/sN.mp3). Writes WORK/frames/*.jpg and
// WORK/timeline.json (frame times, caption cues and where each scene's narration starts). Needs serve.mjs running.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, HERE, WORK, require } from './paths.mjs'
const { chromium } = require('playwright')
mkdirSync(WORK, { recursive: true }); process.chdir(WORK)
const W = '/web/'
const SHOTS = process.env.DEMO_SHOTS === '1' // dry run: one screenshot per scene, no frames
rmSync('frames', { recursive: true, force: true }); mkdirSync('frames')

// narration: one line and one audio file per scene
const lines = Object.fromEntries(readFileSync(join(HERE, 'narration.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t')))
/** The caption of a narration line: command and product names as they are typed, not as they are spoken. */
const caption = (text) => text.replace(/slash manual/g, '/manual').replace(/Manual Kit/g, 'manual-kit').replace(/คำสั่ง check/g, 'คำสั่ง manual-kit check')
const dur = (n) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `voice/s${n}.mp3`]).toString()) * 1000
const LEAD = 350 // the voice starts this long after the scene fades in
const TAIL = 900 // and the scene holds this long after the voice ends

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
await page.goto(BASE + '/stage.html')
await page.evaluate(() => document.fonts.ready)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fr = () => page.frame({ name: 'view' })

const frames = [], cues = []
let rec = true, t0 = 0
const now = () => Date.now() - t0
async function recorder() {
  t0 = Date.now()
  while (rec) {
    if (SHOTS) { await sleep(50); continue }
    const t = now()
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 })
    const name = `f${String(frames.length).padStart(5, '0')}.jpg`
    writeFileSync(`frames/${name}`, buf)
    frames.push({ name, t })
  }
}
let first = true
async function scene(src, { phone = false } = {}) {
  await page.evaluate(() => (document.getElementById('cursor').style.display = 'none'))
  if (!first) { await page.evaluate(() => { document.getElementById('fade').style.opacity = 1; document.getElementById('cap').style.opacity = 0 }); await sleep(320) }
  await page.evaluate(({ src, phone }) => new Promise((r) => { document.body.classList.toggle('phone', phone); const f = document.getElementById('view'); f.onload = () => r(); f.src = src }), { src: BASE + src, phone })
  await fr().evaluate(() => document.fonts.ready.then(() => Promise.all([...document.images].filter(i => i.loading !== 'lazy').map(i => i.decode().catch(() => {})))))
  await sleep(150)
  await page.evaluate(() => (document.getElementById('fade').style.opacity = 0))
  first = false
}
/** Starts scene n's narration and caption; returns when the scene may end. */
async function narrate(n) {
  const start = now()
  if (cues.length) cues.at(-1).end = start
  cues.push({ n, text: caption(lines[n]), start, voice: start + LEAD })
  await page.evaluate((text) => { const c = document.getElementById('cap'); c.style.opacity = 0; setTimeout(() => { c.textContent = text; c.style.opacity = 1 }, 200) }, caption(lines[n]))
  const until = start + LEAD + dur(n) + TAIL
  return async () => { const left = until - now(); if (left > 0) await sleep(left); if (SHOTS) await page.screenshot({ path: `shot-s${n}.png` }) }
}
async function cursorTo(loc, ms = 650) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2
  await page.evaluate(({ x, y, ms }) => { const c = document.getElementById('cursor'); if (c.style.display !== 'block') { c.style.transition = 'none'; c.style.left = (x + 160) + 'px'; c.style.top = (y + 120) + 'px'; c.style.display = 'block'; c.offsetWidth } c.style.transition = `left ${ms}ms cubic-bezier(.5,0,.2,1), top ${ms}ms cubic-bezier(.5,0,.2,1)`; c.style.left = x + 'px'; c.style.top = y + 'px' }, { x, y, ms })
  await sleep(ms + 80)
}
async function click(loc) {
  await cursorTo(loc)
  await page.evaluate(() => { const c = document.getElementById('cursor'); c.classList.remove('click'); c.offsetWidth; c.classList.add('click') })
  await sleep(120)
  await loc.click()
}
async function hideCursor() { await page.evaluate(() => (document.getElementById('cursor').style.display = 'none')) }
async function scrollTo(y, ms) {
  await fr().evaluate(({ y, ms }) => new Promise((r) => { const el = document.scrollingElement; const y0 = el.scrollTop; const s = performance.now(); const step = (t) => { const k = Math.min(1, (t - s) / ms); const e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; el.scrollTop = y0 + (y - y0) * e; k < 1 ? requestAnimationFrame(step) : r() }; requestAnimationFrame(step) }), { y, ms })
}
const loaded = async () => { await page.waitForTimeout(200); await fr().waitForLoadState('load'); await fr().evaluate(() => document.fonts.ready) }
const v = () => page.frameLocator('#view')

const done = recorder()
let end
// 1 title
await scene('/title.html')
end = await narrate(1)
await end()
// 2 command
await scene('/term.html')
end = await narrate(2)
await sleep(Math.max(0, 8200 - dur(2))) // the typed command and the seven steps
await end()
// 3 spec
await scene('/spec.html')
end = await narrate(3)
await sleep(1800)
const h2s = await fr().evaluate(() => [...document.querySelectorAll('h2')].map((h) => [h.textContent, h.getBoundingClientRect().top + scrollY]))
const at = (p) => h2s.find(([t]) => t.startsWith(p))[1] - 50
await scrollTo(at('4.'), 1500)
await sleep(2400)
await scrollTo(at('5.'), 1300)
await end()
// 4 pdf
await scene('/pdf.html')
end = await narrate(4)
await sleep(1700)
for (const i of [1, 2, 3, 4]) { await fr().evaluate((i) => go(i), i); await sleep(1900) }
await end()
// 5 word
await scene('/word.html')
end = await narrate(5)
await sleep(1600)
await fr().evaluate(() => zoom())
await sleep(2600)
await end()
// 6 web: front page, Thai search, a page of steps, enlarge a step
await scene(W + 'index.html')
end = await narrate(6)
await sleep(900)
await click(v().locator('#hq'))
await page.keyboard.type('ติดตั้ง', { delay: 190 })
await sleep(1500)
await click(v().locator('#hero-pop li a').first())
await loaded()
await hideCursor()
await sleep(900)
const walkY = await fr().evaluate(() => document.querySelector('.walk').getBoundingClientRect().top + scrollY - 90)
await scrollTo(walkY, 1200)
await sleep(400)
await click(v().locator('.walk .zoom').first())
await sleep(1500)
await click(v().locator('.lightbox [data-next]'))
await sleep(1500)
await page.keyboard.press('Escape'); await hideCursor()
await end()
// 7 mobile, then the dark theme
await scene(W + 'user-guide/th/use.new-manual.html', { phone: true })
end = await narrate(7)
await sleep(900)
await scrollTo(420, 1400)
await sleep(500)
await click(v().locator('.theme-toggle'))
await sleep(1200)
await hideCursor()
await scrollTo(900, 1400)
await end()
await fr().evaluate(() => { try { localStorage.removeItem('mk-theme') } catch {} })
// 8 check
await scene('/check.html')
end = await narrate(8)
await sleep(Math.min(4800, dur(8) * 0.5))
await fr().evaluate(() => step2())
await end()
// 9 end
await scene('/end.html')
end = await narrate(9)
await sleep(Math.max(0, 6000 - dur(9)))
await end()
cues.at(-1).end = now()
rec = false
await done
const total = now()
writeFileSync('timeline.json', JSON.stringify({ frames, cues, total }, null, 1))
console.log('frames', frames.length, 'seconds', total / 1000, 'fps', (frames.length / total * 1000).toFixed(1))
await browser.close()
