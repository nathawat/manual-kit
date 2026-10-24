// A walkthrough plan -> a HyperFrames composition (index.html): the screenshots under a camera, cursor, click pulses,
// highlight rings, numbered caption pills, title cards and the music bed. Animation is the Web Animations API, one
// animation per track over the whole video, registered as the "main" timeline that HyperFrames seeks frame by frame.
import { CARD_CSS, cardSection, type Card } from '../media/card.ts'
import type { Plan, Track } from './plan.ts'

export interface Look {
  /** Ring, pulse and number badge colour (web.brand.colors accent). */
  accent: string
  intro: Card
  outro: Card
  lang: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Room around a target inside its highlight ring (screenshot pixels). */
const RING_PAD = 8

/** Keyframes as the Web Animations API takes them: offsets 0..1 over the whole video, a hold at both ends. */
export function keyframes(track: Track, total: number): Record<string, string | number>[] {
  const frames = [...track.frames]
  if (frames.at(-1)!.t < total) frames.push({ t: total, v: frames.at(-1)!.v })
  return frames.map((f) => ({ offset: Math.min(1, Math.max(0, Math.round((f.t / total) * 1e6) / 1e6)), [track.prop]: f.v, ...(f.ease ? { easing: f.ease } : {}) }))
}

export function compositionHtml(plan: Plan, look: Look): string {
  const { width, height, shot, scale, total } = plan
  const images = plan.scenes.map((sc, i) => `<img id="scene${i}" src="assets/${esc(sc.image)}" alt="">`).join('')
  const rings = plan.steps
    .map((s) => `<div class="ring" id="ring${s.n}" style="left: ${s.box.x - RING_PAD}px; top: ${s.box.y - RING_PAD}px; width: ${s.box.width + 2 * RING_PAD}px; height: ${s.box.height + 2 * RING_PAD}px"></div>`)
    .join('')
  const pulses = plan.steps
    .filter((s) => s.action === 'click')
    .map((s) => `<div class="pulse" id="pulse${s.n}" style="left: ${s.box.x + s.box.width / 2}px; top: ${s.box.y + s.box.height / 2}px"></div>`)
    .join('')
  const captions = plan.steps.map((s) => `<div class="cap" id="cap${s.n}"><p><b>${s.n}</b><span>${esc(s.caption)}</span></p></div>`).join('')
  const animations = plan.tracks.map((t) => [t.id, keyframes(t, total)])
  return `<!doctype html>
<html lang="${esc(look.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${width}, height=${height}">
<style>
@font-face { font-family: 'Sarabun'; font-weight: 600; src: url('assets/Sarabun-SemiBold.ttf'); }
@font-face { font-family: 'Sarabun'; font-weight: 700; src: url('assets/Sarabun-Bold.ttf'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #fff; font-family: 'Sarabun', sans-serif; }
#root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
#cam { position: absolute; left: 0; top: 0; width: ${shot.width}px; height: ${shot.height}px; transform: scale(${scale}); transform-origin: 0 0; }
#zoom { position: absolute; inset: 0; transform-origin: 0 0; }
#zoom > img { position: absolute; left: 0; top: 0; width: ${shot.width}px; height: ${shot.height}px; }
#zoom > img + img { opacity: 0; }
.ring { position: absolute; border: 3px solid ${esc(look.accent)}; border-radius: 10px; box-shadow: 0 0 0 9999px rgb(15 20 25 / .16); opacity: 0; }
.pulse { position: absolute; width: 42px; height: 42px; margin: -21px 0 0 -21px; border-radius: 50%; border: 3px solid ${esc(look.accent)}; opacity: 0; }
#cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; }
#press { width: 26px; height: 26px; transform-origin: 0 0; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .35)); }
.cap { position: absolute; left: 0; right: 0; bottom: 56px; display: flex; justify-content: center; opacity: 0; }
.cap p { display: flex; align-items: center; gap: 18px; max-width: 1700px; background: #1b1f24; color: #fff; font-size: 38px; font-weight: 600;
  line-height: 1.35; padding: 16px 36px 16px 18px; border-radius: 999px; box-shadow: 0 14px 30px -12px rgb(0 0 0 / .5); }
.cap b { flex: none; width: 56px; height: 56px; border-radius: 50%; background: ${esc(look.accent)}; color: #1b1f24; display: grid; place-items: center; font-size: 32px; }
#outro { opacity: 0; }
${CARD_CSS}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
<div id="cam"><div id="zoom">${images}${rings}${pulses}<div id="cursor"><svg id="press" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#1b1f24" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div></div>
${captions}
${cardSection('intro', look.intro)}
${cardSection('outro', look.outro)}
<audio id="music" data-start="0" data-duration="${total}" data-track-index="0" src="assets/music.wav"></audio>
</div>
<script>
const total = ${total}
const tracks = ${JSON.stringify(animations).replace(/</g, '\\u003c')}
const anims = []
for (const [id, frames] of tracks) {
  const el = document.getElementById(id)
  if (!el) continue
  const a = el.animate(frames, { duration: total * 1000, fill: 'both' })
  a.pause()
  anims.push(a)
}
let now = 0
const seek = (t) => { now = t; for (const a of anims) a.currentTime = t * 1000 }
window.__timelines = window.__timelines || {}
window.__timelines.main = {
  pause() { return this }, play() { return this }, paused() { return true }, timeScale() { return 1 },
  duration() { return total }, totalDuration() { return total }, getChildren() { return [] }, time() { return now },
  totalTime(t) { if (t === undefined) return now; seek(t); return this },
  seek(t) { seek(t); return this },
}
seek(0)
</script>
</body>
</html>
`
}
