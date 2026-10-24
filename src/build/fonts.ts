// DOCX fonts: resolve the Thai and Latin fonts, put them in the theme and the font table, and embed their files
// (ECMA-376 Part 1 §17.8.1: obfuscated TrueType, first 32 bytes XOR-ed with the reversed GUID fontKey).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { strFromU8, strToU8, type Unzipped } from 'fflate'
import type { Project } from '../project.ts'
import { UsageError } from '../sign.ts'
import { ASSETS } from './html.ts'
import { A, R, SETTINGS_ORDER, W, all, child, children, ensureChild, parsePart, writePart, type XElement } from './ooxml.ts'

export type Face = 'regular' | 'bold' | 'italic' | 'boldItalic'
const FACES: Face[] = ['regular', 'bold', 'italic', 'boldItalic']
const EMBED_TAG: Record<Face, string> = { regular: 'embedRegular', bold: 'embedBold', italic: 'embedItalic', boldItalic: 'embedBoldItalic' }

export interface FontFamily {
  family: string
  /** Absolute paths of the TrueType files we have. */
  files: Partial<Record<Face, string>>
}

export interface DocxFonts {
  thai: FontFamily
  latin: FontFamily
  /** Thai (complex script) body size in pt. */
  size: number
  /** Latin body size in pt. */
  latinSize: number
  fallback: string
}

const BUNDLED: FontFamily = {
  family: 'Sarabun',
  files: {
    regular: new URL('fonts/Sarabun-Regular.ttf', ASSETS).pathname,
    bold: new URL('fonts/Sarabun-Bold.ttf', ASSETS).pathname,
    italic: new URL('fonts/Sarabun-Italic.ttf', ASSETS).pathname,
    boldItalic: new URL('fonts/Sarabun-BoldItalic.ttf', ASSETS).pathname,
  },
}

/** "TH ..." fonts (TH Sarabun New, TH SarabunPSK...) are drawn small: Thai documents set them at 16pt. */
export const defaultSize = (family: string) => (/^TH\s?/i.test(family) ? 16 : 11)

/** The DOCX fonts for this build, or null when a project template is used without fonts.docx. */
export function resolveDocxFonts(project: Project): DocxFonts | null {
  const cfg = project.config.fonts.docx
  if (!cfg) {
    if (project.config.templates.docx) return null
    return { thai: BUNDLED, latin: BUNDLED, size: 11, latinSize: 11, fallback: 'Tahoma' }
  }
  const family = (f: { family: string; files: Partial<Record<Face, string | undefined>> }, path: string): FontFamily => {
    const files: Partial<Record<Face, string>> = {}
    for (const face of FACES) {
      const rel = f.files[face]
      if (!rel) continue
      const abs = isAbsolute(rel) ? rel : join(project.manualDir, rel)
      if (!existsSync(abs)) throw new UsageError(`${path}.files.${face}: ${rel} does not exist`)
      files[face] = abs
    }
    return { family: f.family, files }
  }
  const thai = family(cfg.thai, 'fonts.docx.thai')
  const latin = cfg.latin ? family(cfg.latin, 'fonts.docx.latin') : thai
  const size = cfg.size ?? defaultSize(thai.family)
  return { thai, latin, size, latinSize: cfg.latinSize ?? size, fallback: cfg.fallback }
}

/** fontKey GUID derived from the font bytes, so rebuilding gives the same file. */
export function fontKeyFor(data: Uint8Array): string {
  const h = createHash('sha256').update(data).digest('hex').toUpperCase()
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}}`
}

function xorHead(data: Uint8Array, fontKey: string): Uint8Array<ArrayBuffer> {
  const key = Buffer.from(fontKey.replace(/[{}-]/g, ''), 'hex').reverse()
  const out = new Uint8Array(data.length)
  out.set(data)
  for (let i = 0; i < 32 && i < out.length; i++) out[i] = out[i]! ^ key[i % 16]!
  return out
}
export const obfuscateFont = xorHead
export const deobfuscateFont = xorHead

/** Theme: headings (major) and body (minor) use the Latin font; the cs slot and the Thai script slot the Thai font. */
function applyTheme(files: Unzipped, fonts: DocxFonts) {
  const theme = parsePart(files, 'word/theme/theme1.xml')
  if (!theme) return
  for (const tag of ['majorFont', 'minorFont']) {
    for (const block of all(theme, tag, A)) {
      const set = (local: string, typeface: string) => {
        let el = child(block, local, A)
        if (!el) {
          el = theme.createElementNS(A, `a:${local}`)
          block.insertBefore(el, children(block).find((c) => c.localName === 'font') ?? null)
        }
        for (const a of Array.from(el.attributes)) el.removeAttribute(a.name)
        el.setAttribute('typeface', typeface)
      }
      set('latin', fonts.latin.family)
      set('cs', fonts.thai.family)
      for (const f of children(block).filter((c) => c.localName === 'font' && c.getAttribute('script') === 'Thai')) block.removeChild(f)
      const thai = theme.createElementNS(A, 'a:font')
      thai.setAttribute('script', 'Thai')
      thai.setAttribute('typeface', fonts.thai.family)
      const cs = child(block, 'cs', A)!
      block.insertBefore(thai, cs.nextSibling)
    }
  }
  writePart(files, 'word/theme/theme1.xml', theme)
}

/** Font table entries (with altName fallback) and, when embedding, the obfuscated faces. Returns warnings. */
function applyFontTable(files: Unzipped, fonts: DocxFonts, embed: boolean): string[] {
  const table = parsePart(files, 'word/fontTable.xml')
  if (!table) return []
  const root = table.documentElement as unknown as XElement
  if (!root.getAttribute('xmlns:r')) root.setAttribute('xmlns:r', R)
  const families = fonts.thai.family === fonts.latin.family ? [fonts.thai] : [fonts.thai, fonts.latin]
  // Faces embedded by someone else (Word embeds every font it has when it re-saves) are dropped with their parts:
  // only the configured fonts travel with the file, and no r:id is left pointing at a removed relationship.
  for (const f of all(table, 'font'))
    for (const e of children(f).filter((c) => /^embed(Regular|Bold|Italic|BoldItalic)$/.test(c.localName ?? ''))) f.removeChild(e)
  const rels: string[] = []
  const warnings: string[] = []
  let n = 0
  for (const fam of families) {
    for (const old of all(table, 'font').filter((f) => (f.getAttributeNS(W, 'name') || f.getAttribute('w:name')) === fam.family)) root.removeChild(old)
    const font = table.createElementNS(W, 'w:font')
    font.setAttributeNS(W, 'w:name', fam.family)
    const add = (local: string, attrs: Record<string, string>) => {
      const el = table.createElementNS(W, `w:${local}`)
      for (const [k, v] of Object.entries(attrs)) el.setAttributeNS(k.startsWith('r:') ? R : W, k, v)
      font.appendChild(el)
    }
    add('altName', { 'w:val': fonts.fallback })
    add('charset', { 'w:val': '00' })
    add('family', { 'w:val': 'auto' })
    add('pitch', { 'w:val': 'variable' })
    if (embed) {
      const faces = FACES.filter((f) => fam.files[f])
      if (!faces.length) warnings.push(`DOCX: no font files for "${fam.family}" to embed (fonts.docx.*.files); readers need it installed.`)
      for (const face of faces) {
        n += 1
        const data = new Uint8Array(readFileSync(fam.files[face]!))
        const key = fontKeyFor(data)
        files[`word/fonts/font${n}.odttf`] = obfuscateFont(data, key)
        rels.push(`<Relationship Id="rIdMkFont${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font${n}.odttf"/>`)
        add(EMBED_TAG[face], { 'r:id': `rIdMkFont${n}`, 'w:fontKey': key })
      }
    }
    root.appendChild(font)
  }
  writePart(files, 'word/fontTable.xml', table)
  if (rels.length) {
    files['word/_rels/fontTable.xml.rels'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    )
    const types = strFromU8(files['[Content_Types].xml']!)
    if (!/Extension="odttf"/i.test(types))
      files['[Content_Types].xml'] = strToU8(types.replace('</Types>', '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/></Types>'))
  }
  return warnings
}

function applyEmbedSettings(files: Unzipped, embed: boolean) {
  const settings = parsePart(files, 'word/settings.xml')
  if (!settings) return
  const root = settings.documentElement as unknown as XElement
  for (const name of ['embedTrueTypeFonts', 'saveSubsetFonts']) {
    const el = child(root, name)
    if (el) root.removeChild(el)
  }
  if (embed) {
    ensureChild(root, 'embedTrueTypeFonts', SETTINGS_ORDER)
    ensureChild(root, 'saveSubsetFonts', SETTINGS_ORDER).setAttributeNS(W, 'w:val', '0')
  }
  writePart(files, 'word/settings.xml', settings)
}

/**
 * Theme, font table and embedded faces. Styles and runs get their fonts from the Thai rules (thai.ts).
 * Idempotent: earlier embedded faces and entries are replaced. Returns warnings for the build output.
 */
export function applyDocxFonts(files: Unzipped, fonts: DocxFonts, embed: boolean): string[] {
  for (const k of Object.keys(files)) if (k.startsWith('word/fonts/')) delete files[k]
  delete files['word/_rels/fontTable.xml.rels']
  applyTheme(files, fonts)
  const warnings = applyFontTable(files, fonts, embed)
  applyEmbedSettings(files, embed && Object.keys(files).some((k) => k.startsWith('word/fonts/')))
  if (!embed) {
    const names = [...new Set([fonts.thai.family, fonts.latin.family])].map((f) => `"${f}"`).join(' and ')
    warnings.push(
      `DOCX: fonts are not embedded (fonts.embedFonts: false). Readers need ${names} installed, or Word substitutes another font; for files that must look the same everywhere, embed the fonts or use a widely installed font such as Tahoma (fonts.docx.thai.family).`,
    )
  }
  return warnings
}
