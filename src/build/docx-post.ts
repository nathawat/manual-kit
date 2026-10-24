// DOCX post-processing after pandoc: structural fixes Word is strict about, then fonts.
import { strFromU8, strToU8, type Unzipped } from 'fflate'
import { applyDocxFonts, type DocxFonts } from './fonts.ts'
import { applyThaiRules } from './thai.ts'
import { prefillLists } from './toc.ts'
import { PPR_ORDER, RPR_ORDER, SECTPR_ORDER, all, parsePart, reorder, writePart } from './ooxml.ts'

export interface PostOptions {
  fonts: DocxFonts | null
  embedFonts: boolean
  thaiJustify: boolean
}

/**
 * Section, paragraph and run properties must follow schema order, or Word offers to "repair" the file. Pandoc's
 * output only needs the section fixed; a file LibreOffice re-saved can have runs out of order too.
 */
export function fixSchemaOrder(files: Unzipped) {
  const parts = Object.keys(files).filter((k) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes|styles)\.xml$/.test(k))
  for (const path of parts) {
    const doc = parsePart(files, path)
    if (!doc) continue
    for (const s of all(doc, 'sectPr')) reorder(s, SECTPR_ORDER)
    for (const p of all(doc, 'pPr')) reorder(p, PPR_ORDER)
    for (const r of all(doc, 'rPr')) reorder(r, RPR_ORDER)
    writePart(files, path, doc)
  }
}

/** Content-type overrides for parts that are no longer in the package (fonts a word processor embedded, then dropped). */
export function dropDanglingOverrides(files: Unzipped) {
  const types = files['[Content_Types].xml']
  if (!types) return
  const text = strFromU8(types)
  const kept = text.replace(/<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g, (m, part: string) => (files[part] ? m : ''))
  if (kept !== text) files['[Content_Types].xml'] = strToU8(kept)
}

/** `prefill`: fill list fields with entries (only on pandoc output; a finalizer's output already has real ones). */
export function postProcessDocx(files: Unzipped, opts: PostOptions, prefill = true): string[] {
  if (prefill) prefillLists(files)
  applyThaiRules(files, { fonts: opts.fonts ? { thai: opts.fonts.thai.family, latin: opts.fonts.latin.family } : null, thaiJustify: opts.thaiJustify })
  const warnings = opts.fonts ? applyDocxFonts(files, opts.fonts, opts.embedFonts) : []
  fixSchemaOrder(files)
  dropDanglingOverrides(files)
  return warnings
}
