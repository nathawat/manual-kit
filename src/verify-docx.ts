// verify docx: the Thai checks of the thai-docx skill's verify_thai_docx.py, plus package integrity and the
// schema-order rules Word is strict about. Microsoft Word does not guess Thai the way previews do.
import type { Unzipped } from 'fflate'
import { PPR_ORDER, RPR_ORDER, SECTPR_ORDER, SETTINGS_ORDER, STYLE_ORDER, W, all, child, orderProblems, packageProblems, parsePart, type XElement } from './build/ooxml.ts'

export interface VerifyOptions {
  /** Expected Thai (w:cs) font; any font is accepted when omitted. */
  thaiFont?: string
  /** Expected Latin (w:ascii) font; checked only when given. */
  latinFont?: string
}

export interface VerifyResult {
  ok: boolean
  problems: string[]
  warnings: string[]
  thaiRuns: number
  badRuns: number
  embeddedFonts: string[]
}

const THAI = /[฀-๿]/
const THAI_RUN = /[฀-๿]+/g
const THAI_SPACE = /(?<=[฀-๿]) (?=[฀-๿])/g
const INVISIBLE = /[‌‍﻿­⁠ ]/
const wAttr = (el: XElement | null, name: string) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || '' : '')
const runText = (r: XElement) => all(r, 't').map((t) => t.textContent ?? '').join('')

function runProblems(r: XElement, o: VerifyOptions): string[] {
  const out: string[] = []
  const rPr = child(r, 'rPr')
  const rFonts = rPr && child(rPr, 'rFonts')
  const cs = wAttr(rFonts, 'cs')
  if (!cs) out.push('no w:cs (Thai font): tone marks and vowels float or the wrong font shows')
  else if (o.thaiFont && cs !== o.thaiFont) out.push(`w:cs is "${cs}", expected "${o.thaiFont}"`)
  if (o.latinFont && rFonts) {
    const ascii = wAttr(rFonts, 'ascii')
    if (ascii && ascii !== o.latinFont && !/Consolas|Courier|Menlo|Mono/i.test(ascii)) out.push(`w:ascii is "${ascii}", expected "${o.latinFont}"`)
  }
  if (rPr && child(rPr, 'sz') && !child(rPr, 'szCs')) out.push('w:sz without w:szCs: Thai text shrinks')
  if (rPr && child(rPr, 'b') && !child(rPr, 'bCs')) out.push('w:b without w:bCs: Thai text is not bold')
  if (rPr && child(rPr, 'i') && !child(rPr, 'iCs')) out.push('w:i without w:iCs: Thai text is not italic')
  if (!wAttr(rPr && child(rPr, 'lang'), 'bidi')) out.push('no w:lang/@w:bidi: Thai line breaking and justification may go wrong')
  return out
}

export function verifyDocx(files: Unzipped, o: VerifyOptions = {}): VerifyResult {
  const problems: string[] = [...packageProblems(files), ...relationshipIdProblems(files)]
  const warnings: string[] = []
  let thaiRuns = 0
  let badRuns = 0
  let fragmented = 0
  let longUnbroken = 0
  let invisible = 0
  const contentParts = Object.keys(files).filter((k) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(k))
  for (const path of contentParts) {
    const doc = parsePart(files, path)
    if (!doc) continue
    for (const r of all(doc, 'r')) {
      const rPr = child(r, 'rPr')
      if (rPr) for (const p of orderProblems(rPr, RPR_ORDER)) problems.push(`${path}: ${p.replace(/^rPr/, 'rPr')}`)
      const text = runText(r)
      if (!THAI.test(text)) continue
      thaiRuns += 1
      const rp = runProblems(r, o)
      if (rp.length) {
        badRuns += 1
        if (badRuns <= 30) problems.push(`${path}: run "${text.slice(0, 40)}": ${rp.join('; ')}`)
      }
      const thaiChars = (text.match(THAI_RUN) ?? []).join('').length
      const spaces = (text.match(THAI_SPACE) ?? []).length
      if (thaiChars >= 20 && spaces / thaiChars > 0.125) fragmented += 1
      const longest = Math.max(0, ...(text.match(THAI_RUN) ?? []).map((m) => m.length))
      if (!text.includes('\u200B') && longest > 50) longUnbroken += 1
      if (INVISIBLE.test(text)) invisible += 1
    }
    for (const pPr of all(doc, 'pPr')) for (const p of orderProblems(pPr, PPR_ORDER)) problems.push(`${path}: ${p}`)
    for (const s of all(doc, 'sectPr')) for (const p of orderProblems(s, SECTPR_ORDER)) problems.push(`${path}: ${p}`)
  }
  if (badRuns > 30) problems.push(`... ${badRuns - 30} more Thai runs with missing settings`)
  if (fragmented) problems.push(`${fragmented} runs have Thai text split by many spaces (text copied from a PDF?)`)
  if (invisible) problems.push(`${invisible} runs contain invisible characters (no-break space, soft hyphen...)`)
  if (longUnbroken) warnings.push(`${longUnbroken} runs have long Thai text without word breaks (fine unless the paragraph is justified)`)

  const settings = parsePart(files, 'word/settings.xml')
  if (settings) {
    const root = settings.documentElement as unknown as XElement
    if (!wAttr(child(root, 'themeFontLang'), 'bidi')) problems.push('settings.xml: no themeFontLang/@w:bidi="th-TH"')
    for (const p of orderProblems(root, SETTINGS_ORDER)) problems.push(`settings.xml: ${p}`)
  }
  const styles = parsePart(files, 'word/styles.xml')
  if (styles) {
    for (const s of all(styles, 'style')) {
      for (const p of orderProblems(s, STYLE_ORDER)) problems.push(`styles.xml (${wAttr(s, 'styleId')}): ${p}`)
      const rPr = child(s, 'rPr')
      if (!rPr) continue
      for (const p of orderProblems(rPr, RPR_ORDER)) problems.push(`styles.xml (${wAttr(s, 'styleId')}): ${p}`)
      if (child(rPr, 'b') && !child(rPr, 'bCs')) problems.push(`styles.xml (${wAttr(s, 'styleId')}): w:b without w:bCs`)
      if (child(rPr, 'sz') && !child(rPr, 'szCs')) problems.push(`styles.xml (${wAttr(s, 'styleId')}): w:sz without w:szCs`)
    }
  }
  const table = parsePart(files, 'word/fontTable.xml')
  const embeddedFonts = table
    ? all(table, 'font')
        .filter((f) => ['embedRegular', 'embedBold', 'embedItalic', 'embedBoldItalic'].some((e) => child(f, e)))
        .map((f) => wAttr(f, 'name'))
    : []
  if (o.thaiFont && !embeddedFonts.includes(o.thaiFont)) warnings.push(`"${o.thaiFont}" is not embedded: readers need it installed`)
  return { ok: problems.length === 0, problems, warnings, thaiRuns, badRuns, embeddedFonts }
}

/** Every r:id / r:embed used in a part must exist in that part's .rels (Word "repairs" the file otherwise). */
export function relationshipIdProblems(files: Unzipped): string[] {
  const out: string[] = []
  for (const [name, bytes] of Object.entries(files)) {
    if (!/^word\/[^/]+\.xml$/.test(name)) continue
    const xml = new TextDecoder().decode(bytes)
    const used = new Set([...xml.matchAll(/\br:(?:id|embed|link|pict)="([^"]+)"/g)].map((m) => m[1]!))
    if (!used.size) continue
    const relsPath = name.replace(/^word\/([^/]+)$/, 'word/_rels/$1.rels')
    const rels = files[relsPath] ? new TextDecoder().decode(files[relsPath]) : ''
    const ids = new Set([...rels.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]!))
    for (const id of used) if (!ids.has(id)) out.push(`${name}: r:id "${id}" has no relationship in ${relsPath}`)
  }
  return out
}

export function formatVerify(r: VerifyResult): string {
  const lines = [...r.problems.map((p) => `error    ${p}`), ...r.warnings.map((w) => `warning  ${w}`)]
  lines.push(`Thai runs: ${r.thaiRuns}, with missing settings: ${r.badRuns}; embedded fonts: ${r.embeddedFonts.join(', ') || 'none'}`)
  lines.push(r.ok ? 'docx passed' : `docx failed: ${r.problems.length} problems`)
  return lines.join('\n')
}
