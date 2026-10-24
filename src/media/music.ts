// An original background music bed made by code: a soft pad, bass and arpeggio over a four-chord loop.
// Deterministic: the same seed and length always give the same samples. No samples, no voice.

export const SAMPLE_RATE = 48_000

/** Small fast PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function seedOf(text: string): number {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0
  return h
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const PROGRESSIONS = [
  [0, 7, 9, 5], // I V vi IV
  [9, 5, 0, 7], // vi IV I V
  [0, 5, 9, 7], // I IV vi V
  [0, 9, 5, 7], // I vi IV V
]
const ROOTS = [48, 50, 45, 53] // C, D, A, F (low octave)

/** Stereo float samples [left, right] of `seconds` of music. */
export function musicSamples(seconds: number, seed: number): [Float32Array, Float32Array] {
  const r = rng(seed)
  const n = Math.max(1, Math.round(seconds * SAMPLE_RATE))
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const prog = PROGRESSIONS[seed % PROGRESSIONS.length]!
  const root = ROOTS[(seed >>> 3) % ROOTS.length]!
  const bpm = 80 + ((seed >>> 5) % 13)
  const beat = 60 / bpm
  const bar = beat * 4
  const bars = Math.ceil(seconds / bar) + 1

  const add = (start: number, dur: number, f: number, amp: number, pan: number, shape: 'pad' | 'pluck' | 'bass') => {
    const s0 = Math.floor(start * SAMPLE_RATE)
    const len = Math.floor(dur * SAMPLE_RATE)
    const gl = amp * Math.cos((pan * Math.PI) / 4 + Math.PI / 4)
    const gr = amp * Math.sin((pan * Math.PI) / 4 + Math.PI / 4)
    for (let i = 0; i < len; i++) {
      const k = s0 + i
      if (k < 0 || k >= n) continue
      const t = i / SAMPLE_RATE
      let env: number
      if (shape === 'pad') {
        const a = Math.min(1, t / (dur * 0.35))
        const rel = Math.min(1, (dur - t) / (dur * 0.35))
        env = Math.min(a, rel)
      } else env = Math.min(1, t / 0.008) * Math.exp(-t / (shape === 'bass' ? 0.5 : 0.28))
      const ph = 2 * Math.PI * f * t
      let v: number
      if (shape === 'pad') v = Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph + 0.3)
      else if (shape === 'bass') v = Math.sin(ph) + 0.15 * Math.sin(2 * ph)
      else v = (2 / Math.PI) * Math.asin(Math.sin(ph)) * 0.8 + 0.2 * Math.sin(2 * ph)
      L[k]! += v * env * gl
      R[k]! += v * env * gr
    }
  }

  for (let b = 0; b < bars; b++) {
    const degree = prog[b % prog.length]!
    const third = degree === 9 ? 3 : 4
    const chord = [0, third, 7].map((x) => root + 12 + degree + x)
    const t0 = b * bar
    // pad: chord tones a bit longer than the bar so bars blend
    chord.forEach((m, i) => add(t0 - bar * 0.15, bar * 1.3, hz(m + 12), 0.05, (i - 1) * 0.5, 'pad'))
    // bass on beats 1 and 3
    add(t0, beat * 2, hz(root + degree - (degree > 6 ? 12 : 0)), 0.11, 0, 'bass')
    add(t0 + beat * 2, beat * 2, hz(root + degree - (degree > 6 ? 12 : 0)), 0.08, 0, 'bass')
    // arpeggio: eighth notes from the chord, one octave up, a few rests
    for (let e = 0; e < 8; e++) {
      if (r() < 0.22) continue
      const tone = chord[Math.floor(r() * chord.length)]! + 24 + (r() < 0.2 ? 12 : 0)
      add(t0 + e * (beat / 2), beat * 1.5, hz(tone), 0.045, e % 2 ? 0.6 : -0.6, 'pluck')
    }
  }

  // fade in/out, then scale the peak to -6 dBFS (loudness is normalised by ffmpeg afterwards)
  const fadeIn = Math.min(1.5, seconds / 4) * SAMPLE_RATE
  const fadeOut = Math.min(2.5, seconds / 3) * SAMPLE_RATE
  let peak = 0
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fadeIn, (n - 1 - i) / fadeOut)
    L[i]! *= g
    R[i]! *= g
    peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!))
  }
  const k = peak > 0 ? 0.5 / peak : 0
  for (let i = 0; i < n; i++) {
    L[i]! *= k
    R[i]! *= k
  }
  return [L, R]
}

/** 16-bit PCM stereo WAV. */
export function musicWav(seconds: number, seed: number): Buffer {
  const [L, R] = musicSamples(seconds, seed)
  const n = L.length
  const data = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i]!)) * 32767), i * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i]!)) * 32767), i * 4 + 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(2, 22)
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 4, 28)
  h.writeUInt16LE(4, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
