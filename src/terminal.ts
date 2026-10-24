// Terminal transcripts as screens: a command-line session (commands + output text, ANSI colours) rendered into a
// terminal window that capture photographs like any app page, with the same highlight, steps and clip system.
// A transcript is plain text: a line that starts with the prompt (default "$ ") is a command, the lines after it are
// its output. Lines before the first command are a preamble (block 0).
import { readFileSync } from 'node:fs'
import { ASSETS } from './paths.ts'

export interface Line {
  /** 1-based line number in the transcript file: `[data-line="n"]` in a highlight. */
  n: number
  text: string
}
export interface Block {
  /** Undefined for the preamble. */
  command?: string
  /** Line number of the command. */
  line?: number
  output: Line[]
}
export interface Transcript {
  /** blocks[0] is the preamble (maybe empty); blocks[i] is the i-th command. */
  blocks: Block[]
}

export function parseTranscript(text: string, prompt = '$ '): Transcript {
  const blocks: Block[] = [{ output: [] }]
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  lines.forEach((raw, i) => {
    const plain = stripAnsi(raw)
    if (plain.startsWith(prompt)) blocks.push({ command: raw.slice(raw.indexOf(prompt) + prompt.length), line: i + 1, output: [] })
    else blocks.at(-1)!.output.push({ n: i + 1, text: raw })
  })
  return { blocks }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// CSI (ESC [ ... final), OSC (ESC ] ... BEL or ESC \), other two-byte escapes
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f]/g
export const stripAnsi = (s: string) => s.replace(ESCAPES, '').replace(CONTROLS, '')

/** xterm 256-colour palette entry (16..255) as #rrggbb. */
function xterm(n: number): string {
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  if (n >= 232) {
    const v = 8 + 10 * (n - 232)
    return `#${hex(v)}${hex(v)}${hex(v)}`
  }
  const c = n - 16
  const lv = [0, 95, 135, 175, 215, 255]
  return `#${hex(lv[Math.floor(c / 36)]!)}${hex(lv[Math.floor(c / 6) % 6]!)}${hex(lv[c % 6]!)}`
}

interface Style {
  b?: boolean
  dim?: boolean
  i?: boolean
  u?: boolean
  /** 0-15: palette class; string: a colour */
  fg?: number | string
  bg?: number | string
}

function sgr(state: Style, params: number[]): Style {
  const s = { ...state }
  if (!params.length) params = [0]
  for (let k = 0; k < params.length; k++) {
    const p = params[k]!
    if (p === 0) for (const key of Object.keys(s)) delete s[key as keyof Style]
    else if (p === 1) s.b = true
    else if (p === 2) s.dim = true
    else if (p === 3) s.i = true
    else if (p === 4) s.u = true
    else if (p === 22) (delete s.b, delete s.dim)
    else if (p === 23) delete s.i
    else if (p === 24) delete s.u
    else if (p >= 30 && p <= 37) s.fg = p - 30
    else if (p >= 90 && p <= 97) s.fg = p - 90 + 8
    else if (p === 39) delete s.fg
    else if (p >= 40 && p <= 47) s.bg = p - 40
    else if (p >= 100 && p <= 107) s.bg = p - 100 + 8
    else if (p === 49) delete s.bg
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'fg' : 'bg'
      if (params[k + 1] === 5 && params[k + 2] !== undefined) {
        const n = params[k + 2]!
        s[key] = n < 16 ? n : xterm(n)
        k += 2
      } else if (params[k + 1] === 2 && params[k + 4] !== undefined) {
        const [r, g, b] = [params[k + 2]!, params[k + 3]!, params[k + 4]!].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
        s[key] = `#${r}${g}${b}`
        k += 4
      }
    }
  }
  return s
}

function open(s: Style): string {
  const cls = [s.b && 'b', s.dim && 'dim', s.i && 'i', s.u && 'u', typeof s.fg === 'number' && `fg-${s.fg}`, typeof s.bg === 'number' && `bg-${s.bg}`].filter(Boolean)
  const style = [typeof s.fg === 'string' && `color:${s.fg}`, typeof s.bg === 'string' && `background:${s.bg}`].filter(Boolean)
  if (!cls.length && !style.length) return ''
  return `<span${cls.length ? ` class="${cls.join(' ')}"` : ''}${style.length ? ` style="${style.join(';')}"` : ''}>`
}

/** One line of terminal text -> HTML: SGR colours and weights become spans, everything else is escaped once. */
export function ansiToHtml(line: string): string {
  let out = ''
  let state: Style = {}
  let at = 0
  const text = (t: string) => {
    const clean = t.replace(ESCAPES, '').replace(CONTROLS, '')
    if (!clean) return
    const o = open(state)
    out += o ? `${o}${esc(clean)}</span>` : esc(clean)
  }
  for (const m of line.matchAll(/\u001b\[([0-9;]*)m/g)) {
    text(line.slice(at, m.index))
    state = sgr(state, m[1] ? m[1].split(';').map((x) => Number(x || 0)) : [])
    at = m.index + m[0].length
  }
  text(line.slice(at))
  return out
}

export interface TerminalOptions {
  title?: string
  /** A label in the title bar, e.g. "ตัวอย่าง" for an illustrative session. */
  badge?: string
  prompt?: string
}

const PALETTE = ['#2e3440', '#ff6b6b', '#4fd18b', '#f5c542', '#6aa8ff', '#d48cff', '#4fd1d1', '#d8dee9', '#7b8597', '#ff8f8f', '#7ee2a8', '#ffd76a', '#8fbcff', '#e2a8ff', '#7ee2e2', '#ffffff']

const font = (file: string) => readFileSync(new URL(`fonts/${file}`, ASSETS)).toString('base64')
let fontCss: string | undefined
/** Sarabun (bundled) for Thai text in the monospace window; inlined, so the page loads nothing. */
const fonts = () =>
  (fontCss ??= ['Regular:400', 'Bold:700']
    .map((f) => f.split(':'))
    .map(([face, weight]) => `@font-face{font-family:"MK Sarabun";font-weight:${weight};src:url(data:font/ttf;base64,${font(`Sarabun-${face}.ttf`)}) format("truetype")}`)
    .join(''))

/** The whole page capture loads for a terminal spec. `window.__mkShow(n, output)` reveals the session up to command n. */
export function terminalHtml(t: Transcript, o: TerminalOptions = {}): string {
  const prompt = o.prompt ?? '$ '
  const line = (l: Line) => `<div class="mk-line" data-line="${l.n}">${ansiToHtml(l.text) || '&#8203;'}</div>`
  const blocks = t.blocks
    .map((b, i) => {
      if (i === 0 && !b.output.length) return ''
      const cmd = b.command === undefined ? '' : `<div class="mk-cmd" data-cmd="${i}" data-line="${b.line}"><span class="mk-prompt">${esc(prompt)}</span>${ansiToHtml(b.command)}</div>`
      return `<div class="mk-block" data-block="${i}">${cmd}<div class="mk-out" data-out="${i}">${b.output.map(line).join('')}</div></div>`
    })
    .join('')
  const colors = PALETTE.map((c, i) => `.fg-${i}{color:${c}}.bg-${i}{background:${c}}`).join('')
  const css = `${fonts()}
*{box-sizing:border-box}html,body{margin:0;background:#fff}
.mk-term{width:100vw;background:#11161f;border-radius:10px;overflow:hidden;color:#d8dee9;font:15px/1.6 ui-monospace,Menlo,"SF Mono","DejaVu Sans Mono",Consolas,"MK Sarabun",monospace}
html.mk-fill .mk-term{height:100vh;display:flex;flex-direction:column}
.mk-term-bar{height:34px;background:#1c2330;display:flex;align-items:center;gap:8px;padding:0 14px;flex:none}
.mk-term-bar i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.mk-term-bar i:nth-child(2){background:#febc2e}.mk-term-bar i:nth-child(3){background:#28c840}
.mk-term-title{margin-left:10px;color:#8b97ab;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mk-term-badge{margin-left:auto;background:#f5c542;color:#1b1b1b;font:700 13px/1 "MK Sarabun",sans-serif;padding:4px 12px;border-radius:999px}
.mk-term-body{padding:12px 18px 16px;flex:1;overflow:hidden}
html.mk-fill .mk-term-body{display:flex;flex-direction:column;justify-content:flex-end}
.mk-cmd,.mk-line{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.6em}
.mk-cmd{color:#fff;font-weight:700}.mk-block+.mk-block .mk-cmd{margin-top:6px}.mk-prompt{color:#6aa8ff}
.b{font-weight:700}.dim{opacity:.6}.i{font-style:italic}.u{text-decoration:underline}
.mk-hidden{display:none}${colors}`
  const script = `window.__mkShow=function(n,output){document.querySelectorAll('.mk-block').forEach(function(b){var i=Number(b.dataset.block);b.classList.toggle('mk-hidden',i>n);var o=b.querySelector('.mk-out');if(o)o.classList.toggle('mk-hidden',i===n&&output===false)})}`
  const title = o.title ? `<span class="mk-term-title">${esc(o.title)}</span>` : ''
  const badge = o.badge ? `<span class="mk-term-badge">${esc(o.badge)}</span>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><script>${script}</script></head><body><div class="mk-term"><div class="mk-term-bar"><i></i><i></i><i></i>${title}${badge}</div><div class="mk-term-body">${blocks}</div></div></body></html>`
}
