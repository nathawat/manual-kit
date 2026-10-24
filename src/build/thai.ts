// Thai correctness rules for Microsoft Word (ported from the thai-docx skill's enforce_thai):
// Word picks fonts per character, and Thai lives in the complex-script slot. Every run and style needs
// w:rFonts/@w:cs (Thai font), w:szCs = w:sz, w:bCs / w:iCs next to w:b / w:i, and w:lang/@w:bidi="th-TH";
// settings.xml needs themeFontLang/@w:bidi. Justified Thai paragraphs get zero-width spaces at word boundaries
// so Word never stretches a line letter by letter.
import type { Unzipped } from 'fflate'
import { PPR_ORDER, RPR_ORDER, SETTINGS_ORDER, STYLE_ORDER, W, all, child, ensureChild, parsePart, writePart, type XElement } from './ooxml.ts'

export const THAI_LANG = 'th-TH'
const THAI = /[฀-๿]/
const ZWSP = '\u200B'
const MONO = /Consolas|Courier|Menlo|Mono/i
const CODE_STYLES = /^(VerbatimChar|SourceCode)$/
/** Paragraph styles that carry body text (pandoc names). */
export const BODY_STYLES = ['BodyText', 'FirstParagraph']
const JUSTIFIED = new Set(['both', 'distribute', 'thaiDistribute', 'lowKashida', 'mediumKashida', 'highKashida'])

export interface ThaiFonts {
  thai: string
  latin: string
}

export interface ThaiOptions {
  /** null: keep the families already in the file, only fill the missing complex-script slot. */
  fonts: ThaiFonts | null
  thaiJustify: boolean
}

const wAttr = (el: XElement | null, name: string) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || '' : '')
const setW = (el: XElement, name: string, value: string) => el.setAttributeNS(W, `w:${name}`, value)
const removeAttr = (el: XElement, name: string) => {
  el.removeAttributeNS(W, name)
  el.removeAttribute(`w:${name}`)
}

/** Apply the rules to one rPr. `code`: keep the monospace Latin font. */
export function enforceRPr(rPr: XElement, fonts: ThaiFonts | null, code = false) {
  const rFonts = ensureChild(rPr, 'rFonts', RPR_ORDER)
  for (const t of ['asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme']) removeAttr(rFonts, t)
  const mono = code || MONO.test(wAttr(rFonts, 'ascii'))
  if (fonts) {
    if (!mono) {
      setW(rFonts, 'ascii', fonts.latin)
      setW(rFonts, 'hAnsi', fonts.latin)
    }
    setW(rFonts, 'eastAsia', fonts.thai)
    setW(rFonts, 'cs', fonts.thai)
  } else if (!wAttr(rFonts, 'cs') && wAttr(rFonts, 'ascii')) setW(rFonts, 'cs', wAttr(rFonts, 'ascii'))
  for (const [base, cs] of [
    ['b', 'bCs'],
    ['i', 'iCs'],
  ] as const) {
    const b = child(rPr, base)
    if (b && !child(rPr, cs)) {
      const el = ensureChild(rPr, cs, RPR_ORDER)
      const v = wAttr(b, 'val')
      if (v) setW(el, 'val', v)
    }
  }
  const sz = child(rPr, 'sz')
  if (sz && !child(rPr, 'szCs')) setW(ensureChild(rPr, 'szCs', RPR_ORDER), 'val', wAttr(sz, 'val'))
  const lang = ensureChild(rPr, 'lang', RPR_ORDER)
  setW(lang, 'bidi', THAI_LANG)
  if (!wAttr(lang, 'val')) setW(lang, 'val', 'en-US')
}

/** Insert ZWSP between Thai words (Intl.Segmenter); existing ZWSP are removed first, so it is idempotent. */
export function breakThaiWords(text: string): string {
  const clean = text.replace(/\u200B/g, '')
  if (!THAI.test(clean)) return clean
  const segs = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(clean)].map((s) => s.segment)
  let out = ''
  for (let i = 0; i < segs.length; i++) {
    const prev = segs[i - 1]
    const cur = segs[i]!
    if (prev && THAI.test(prev.slice(-1)) && THAI.test(cur[0]!)) out += ZWSP
    out += cur
  }
  return out
}

function ensureRunRPr(r: XElement): XElement {
  const existing = child(r, 'rPr')
  if (existing) return existing
  const rPr = r.ownerDocument!.createElementNS(W, 'w:rPr')
  r.insertBefore(rPr, r.firstChild)
  return rPr
}

function styleIdOf(p: XElement): string {
  const pPr = child(p, 'pPr')
  return wAttr(pPr && child(pPr, 'pStyle'), 'val')
}

function applyToContentPart(files: Unzipped, path: string, opts: ThaiOptions, justifiedStyles: Set<string>) {
  const doc = parsePart(files, path)
  if (!doc) return
  for (const r of all(doc, 'r')) {
    const rPr = ensureRunRPr(r)
    const rStyle = wAttr(child(rPr, 'rStyle'), 'val')
    const p = r.parentNode as XElement | null
    const code = CODE_STYLES.test(rStyle) || (p?.localName === 'p' && CODE_STYLES.test(styleIdOf(p)))
    enforceRPr(rPr, opts.fonts, code)
  }
  if (opts.thaiJustify) {
    for (const p of all(doc, 'p')) {
      const pPr = child(p, 'pPr')
      const jc = wAttr(pPr && child(pPr, 'jc'), 'val')
      if (!(JUSTIFIED.has(jc) || (!jc && justifiedStyles.has(styleIdOf(p))))) continue
      for (const t of all(p, 't')) t.textContent = breakThaiWords(t.textContent ?? '')
    }
  }
  writePart(files, path, doc)
}

export function applyThaiRules(files: Unzipped, opts: ThaiOptions) {
  const styles = parsePart(files, 'word/styles.xml')
  if (styles) {
    for (const def of all(styles, 'rPrDefault')) {
      let rPr = child(def, 'rPr')
      if (!rPr) rPr = def.appendChild(styles.createElementNS(W, 'w:rPr')) as XElement
      enforceRPr(rPr, opts.fonts)
    }
    for (const style of all(styles, 'style')) {
      const id = wAttr(style, 'styleId')
      enforceRPr(ensureChild(style, 'rPr', STYLE_ORDER), opts.fonts, CODE_STYLES.test(id))
      if (opts.thaiJustify && BODY_STYLES.includes(id)) setW(ensureChild(ensureChild(style, 'pPr', STYLE_ORDER), 'jc', PPR_ORDER), 'val', 'thaiDistribute')
    }
    writePart(files, 'word/styles.xml', styles)
  }
  const justified = new Set(opts.thaiJustify ? BODY_STYLES : [])
  for (const path of Object.keys(files).filter((k) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(k)))
    applyToContentPart(files, path, opts, justified)

  const settings = parsePart(files, 'word/settings.xml')
  if (settings) {
    const root = settings.documentElement as unknown as XElement
    const tfl = ensureChild(root, 'themeFontLang', SETTINGS_ORDER)
    if (!wAttr(tfl, 'val')) setW(tfl, 'val', 'en-US')
    setW(tfl, 'bidi', THAI_LANG)
    writePart(files, 'word/settings.xml', settings)
  }
}
