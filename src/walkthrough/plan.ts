// Timing and camera of a walkthrough video, as plain numbers: when each scene and step plays, where the cursor goes,
// how far the camera zooms, and every animated property as keyframes (seconds). compose.ts turns them into HTML.
import type { Box } from '../capture.ts'

/** Canvas width of every walkthrough; the height keeps the screenshots' aspect (1440x900 -> 1920x1200). */
export const CANVAS_WIDTH = 1920
export const INTRO = 3.4
export const OUTRO = 3.4
/** Shortest time a step stays on screen; longer when its caption needs more reading time. */
export const STEP_MIN = 3.4
export const XFADE = 0.5
/** Zoom factor of `zoom: true`. */
export const DEFAULT_ZOOM = 1.6
/** Second of the video used as the poster: the intro card, fully drawn. */
export const POSTER_AT = 2

export interface StepInput {
  caption: string
  box: Box
  zoom?: true | number
  action: 'click' | 'point'
}
export interface SceneInput {
  /** Screenshot file name inside the composition's assets. */
  image: string
  steps: StepInput[]
}

export interface PlannedStep {
  n: number
  scene: number
  start: number
  end: number
  caption: string
  box: Box
  /** 1 = no zoom. */
  zoom: number
  action: 'click' | 'point'
}
export interface Plan {
  width: number
  height: number
  /** Screenshot pixels -> canvas pixels. */
  scale: number
  shot: { width: number; height: number }
  total: number
  outroStart: number
  scenes: { image: string; start: number; end: number }[]
  steps: PlannedStep[]
  tracks: Track[]
}

/** One animated property of one element (by id): values at times, each easing towards the next. */
export interface Track {
  id: string
  prop: 'opacity' | 'transform'
  frames: { t: number; v: string; ease?: string }[]
}

export const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)'
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const EASE_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/** Reading time of a step's caption (s): about 15 characters a second, never under STEP_MIN. */
export const stepSeconds = (caption: string) => Math.max(STEP_MIN, Math.round((1.5 + [...caption].length * 0.065) * 10) / 10)

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Camera that zooms by `z` while `p` stays where it is on screen: with transform-origin 0 0, scale(z) then
 * translate(p * (1 - z)) maps p to p. Any p inside the frame keeps the frame covered.
 */
export function zoomAt(p: { x: number; y: number }, z: number): { x: number; y: number; scale: number } {
  return { x: round(p.x * (1 - z)), y: round(p.y * (1 - z)), scale: z }
}
const camera = (c: { x: number; y: number; scale: number }) => `translate(${c.x}px, ${c.y}px) scale(${c.scale})`
const IDENTITY = camera({ x: 0, y: 0, scale: 1 })

/** Builds a track from moves; each move starts from the value the last one ended on, so the track never jumps. */
class TrackBuilder {
  readonly track: Track
  constructor(id: string, prop: Track['prop'], initial: string) {
    this.track = { id, prop, frames: [{ t: 0, v: initial }] }
  }
  get value() {
    return this.track.frames.at(-1)!.v
  }
  to(t0: number, t1: number, v: string, ease = EASE_IN_OUT) {
    const from = this.value
    this.track.frames.push({ t: round(t0), v: from, ease }, { t: round(t1), v })
    return this
  }
}

export function planWalkthrough(scenes: SceneInput[], shot: { width: number; height: number }): Plan {
  const scale = CANVAS_WIDTH / shot.width
  const width = CANVAS_WIDTH
  const height = Math.round((shot.height * scale) / 2) * 2
  const steps: PlannedStep[] = []
  const planned: Plan['scenes'] = []
  let t = INTRO
  for (const [i, sc] of scenes.entries()) {
    const start = i ? t - XFADE : t
    for (const st of sc.steps) {
      const d = stepSeconds(st.caption)
      steps.push({ n: steps.length + 1, scene: i, start: round(t), end: round(t + d), caption: st.caption, box: st.box, zoom: st.zoom === true ? DEFAULT_ZOOM : (st.zoom ?? 1), action: st.action })
      t += d
    }
    planned.push({ image: sc.image, start: round(start), end: round(t) })
  }
  const outroStart = round(t)
  const total = round(t + OUTRO)
  const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

  const tracks: Track[] = []
  // intro card over the screen; it fades out as the first screenshot shows, the outro fades in at the end
  tracks.push(new TrackBuilder('intro', 'opacity', '1').to(INTRO - 0.1, INTRO + 0.5, '0').track)
  tracks.push(new TrackBuilder('intro-mark', 'transform', 'scale(0.6)').to(0.2, 0.8, 'scale(1)', EASE_BACK).track)
  tracks.push(new TrackBuilder('intro-mark', 'opacity', '0').to(0.2, 0.6, '1').track)
  tracks.push(new TrackBuilder('intro-title', 'transform', 'translateY(40px)').to(0.45, 1.05, 'translateY(0px)', EASE_OUT).track)
  tracks.push(new TrackBuilder('intro-title', 'opacity', '0').to(0.45, 1.0, '1').track)
  tracks.push(new TrackBuilder('intro-sub', 'opacity', '0').to(0.7, 1.2, '1').track)
  tracks.push(new TrackBuilder('outro', 'opacity', '0').to(outroStart - 0.2, outroStart + 0.3, '1').track)
  tracks.push(new TrackBuilder('outro-mark', 'transform', 'scale(0.4)').to(outroStart + 0.2, outroStart + 0.7, 'scale(1)', EASE_BACK).track)

  // scene i > 0 cross-fades in over the one before
  for (const [i, sc] of planned.entries()) if (i) tracks.push(new TrackBuilder(`scene${i}`, 'opacity', '0').to(sc.start, sc.start + XFADE, '1').track)

  const cam = new TrackBuilder('zoom', 'transform', IDENTITY)
  const cursor = new TrackBuilder('cursor', 'transform', `translate(${round(shot.width / 2)}px, ${round(shot.height / 2)}px)`)
  const press = new TrackBuilder('press', 'transform', 'scale(1)')
  for (const [i, s] of steps.entries()) {
    const p = center(s.box)
    const sceneStart = planned[s.scene]!.start
    // a new scene starts unzoomed: the camera returns before the cross-fade
    if (i && s.scene !== steps[i - 1]!.scene && cam.value !== IDENTITY) cam.to(sceneStart - 0.4, sceneStart, IDENTITY)
    const want = s.zoom > 1 ? camera(zoomAt(p, s.zoom)) : IDENTITY
    if (want !== cam.value) cam.to(s.start + 0.1, s.start + (s.zoom > 1 ? 1.0 : 0.9), want)
    cursor.to(s.start + 0.2, s.start + 1.1, `translate(${round(p.x - 4)}px, ${round(p.y - 2)}px)`)
    const ring = new TrackBuilder(`ring${s.n}`, 'opacity', '0').to(s.start + 1.0, s.start + 1.3, '1').to(s.end - 0.35, s.end - 0.05, '0')
    tracks.push(ring.track)
    const cap = new TrackBuilder(`cap${s.n}`, 'opacity', '0').to(s.start, s.start + 0.3, '1').to(s.end - 0.3, s.end, '0')
    tracks.push(cap.track)
    if (s.action === 'click') {
      const at = s.start + 1.8
      press.to(at, at + 0.08, 'scale(0.85)').to(at + 0.08, at + 0.16, 'scale(1)')
      tracks.push(new TrackBuilder(`pulse${s.n}`, 'opacity', '0').to(at - 0.01, at, '1').to(at, at + 0.5, '0', EASE_OUT).track)
      tracks.push(new TrackBuilder(`pulse${s.n}`, 'transform', 'scale(0.4)').to(at, at + 0.5, 'scale(1.6)', EASE_OUT).track)
    }
  }
  tracks.push(cam.track, cursor.track, press.track)
  return { width, height, scale, shot, total, outroStart, scenes: planned, steps, tracks }
}

/** A track's value at its last keyframe at or before t (where a move has arrived; tests read the plan with it). */
export function valueAt(track: Track, t: number): string {
  let last = track.frames[0]!.v
  for (const f of track.frames) if (f.t <= t) last = f.v
  return last
}
