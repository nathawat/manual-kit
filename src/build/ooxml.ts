// Small OOXML toolkit: parse/serialize parts, insert children in schema order, check package integrity.
import { DOMParser, XMLSerializer, type Document as XDocument, type Element as XElement, type Node as XNode } from '@xmldom/xmldom'
import { strFromU8, strToU8, type Unzipped } from 'fflate'

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export type { XDocument, XElement }

export function parsePart(files: Unzipped, path: string): XDocument | null {
  const bytes = files[path]
  if (!bytes) return null
  return new DOMParser().parseFromString(strFromU8(bytes), 'text/xml') as unknown as XDocument
}
export function writePart(files: Unzipped, path: string, doc: XDocument) {
  let xml = new XMLSerializer().serializeToString(doc as unknown as XNode)
  if (!xml.startsWith('<?xml')) xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`
  files[path] = strToU8(xml)
}

export const children = (el: XElement): XElement[] => {
  const out: XElement[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as XElement)
  return out
}
export const child = (el: XElement, local: string, ns = W) => children(el).find((c) => c.localName === local && c.namespaceURI === ns) ?? null
export const all = (doc: XDocument | XElement, local: string, ns = W): XElement[] => Array.from((doc as XElement).getElementsByTagNameNS(ns, local))
export const wAttr = (el: XElement, name: string) => el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || null
export const setW = (el: XElement, name: string, value: string) => el.setAttributeNS(W, `w:${name}`, value)

/** Insert (or return) a w: child at its schema position, given the element's child order. */
export function ensureChild(parent: XElement, local: string, order: readonly string[]): XElement {
  const existing = child(parent, local)
  if (existing) return existing
  const el = parent.ownerDocument!.createElementNS(W, `w:${local}`)
  const idx = order.indexOf(local)
  const anchor = idx < 0 ? null : (children(parent).find((c) => c.namespaceURI === W && order.indexOf(c.localName!) > idx) ?? null)
  parent.insertBefore(el, anchor)
  return el
}

/** Re-sort w: children into schema order (unknown children keep their relative place at the end). */
export function reorder(parent: XElement, order: readonly string[]) {
  const kids = children(parent)
  const rank = (c: XElement) => (c.namespaceURI === W && order.includes(c.localName!) ? order.indexOf(c.localName!) : order.length)
  const sorted = kids.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
  for (const { c } of sorted) parent.appendChild(c)
}

/** Elements out of schema order, as "parent: a before b" messages. */
export function orderProblems(parent: XElement, order: readonly string[]): string[] {
  const ranks = children(parent)
    .filter((c) => c.namespaceURI === W && order.includes(c.localName!))
    .map((c) => ({ name: c.localName!, r: order.indexOf(c.localName!) }))
  const out: string[] = []
  for (let i = 1; i < ranks.length; i++) if (ranks[i]!.r < ranks[i - 1]!.r) out.push(`${parent.localName}: ${ranks[i - 1]!.name} before ${ranks[i]!.name}`)
  return out
}

export const SECTPR_ORDER = [
  'headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType',
  'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange',
] as const
export const RPR_ORDER = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof',
  'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd',
  'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath',
] as const
export const PPR_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
  'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
  'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
  'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange',
] as const
export const STYLE_ORDER = [
  'name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden', 'unhideWhenUsed', 'qFormat', 'locked',
  'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr', 'tblPr', 'trPr', 'tcPr', 'tblStylePr',
] as const
export const SETTINGS_ORDER = [
  'writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape',
  'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts',
  'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges', 'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop',
  'hideSpellingErrors', 'hideGrammaticalErrors', 'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate', 'linkStyles',
  'stylePaneFormatFilter', 'stylePaneSortMethod', 'documentType', 'mailMerge', 'revisionView', 'trackRevisions', 'doNotTrackMoves',
  'doNotTrackFormatting', 'documentProtection', 'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation',
  'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle',
  'defaultTableStyle', 'evenAndOddHeaders', 'bookFoldRevPrinting', 'bookFoldPrinting', 'bookFoldPrintingSheets',
  'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing', 'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery',
  'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin', 'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning',
  'characterSpacingControl', 'printTwoOnOne', 'strictFirstAndLastChars', 'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture',
  'doNotValidateAgainstSchema', 'saveInvalidXml', 'ignoreMixedContent', 'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml',
  'saveXmlDataOnly', 'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags', 'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults',
  'footnotePr', 'endnotePr', 'compat', 'docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping',
  'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions', 'readModeInkLockDown', 'smartTagType', 'schemaLibrary',
  'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator',
] as const

/** Every XML part parses, every internal relationship target exists, every part has a content type. */
export function packageProblems(files: Unzipped): string[] {
  const problems: string[] = []
  const types = files['[Content_Types].xml'] ? strFromU8(files['[Content_Types].xml']) : ''
  const defaults = [...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase())
  const overrides = new Set([...types.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1]!))
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('/')) continue
    const ext = name.split('.').pop()!.toLowerCase()
    if (name !== '[Content_Types].xml' && !defaults.includes(ext) && !overrides.has(`/${name}`)) problems.push(`${name}: no content type`)
    if (ext === 'xml' || ext === 'rels') {
      const errors: string[] = []
      new DOMParser({ onError: (level, msg) => void (level !== 'warning' && errors.push(msg)) }).parseFromString(strFromU8(bytes), 'text/xml')
      if (errors.length) problems.push(`${name}: not well-formed (${errors[0]})`)
    }
    if (ext === 'rels') {
      const base = name.replace(/_rels\/[^/]*\.rels$/, '')
      const ids = new Set<string>()
      for (const m of strFromU8(bytes).matchAll(/<Relationship\b[^>]*>/g)) {
        const id = /\bId="([^"]+)"/.exec(m[0])?.[1] ?? ''
        if (ids.has(id)) problems.push(`${name}: duplicate relationship id ${id}`)
        ids.add(id)
        if (/TargetMode="External"/.test(m[0])) continue
        const target = /\bTarget="([^"]+)"/.exec(m[0])![1]!
        const path = target.startsWith('/') ? target.slice(1) : normalize(base + target)
        if (!files[path]) problems.push(`${name}: ${id} -> ${target} is missing`)
      }
    }
  }
  for (const o of overrides) if (!files[o.slice(1)]) problems.push(`[Content_Types].xml: override for missing part ${o}`)
  return problems
}
const normalize = (p: string) => {
  const out: string[] = []
  for (const s of p.split('/')) s === '..' ? out.pop() : s && s !== '.' && out.push(s)
  return out.join('/')
}
