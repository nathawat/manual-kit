import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'

/** Parts of a DOCX (zip) as text, by path. */
export function docxParts(file: string): Record<string, string> {
  const files = unzipSync(readFileSync(file))
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.endsWith('.xml') || k.endsWith('.rels') ? strFromU8(v) : `<binary ${v.length}>`]))
}
/** Visible text of a WordprocessingML part. */
export const xmlText = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
