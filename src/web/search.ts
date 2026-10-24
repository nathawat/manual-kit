// Search for the web build. The same two functions run at build time (Node, to make the index) and in the
// browser (their source is written into search-core.js with Function#toString), so tokens always match.
// Both must stay self-contained: no imports, no references to anything outside the function body.

/** One searchable section: a chapter's lead text or one of its h2 sections. */
export interface SearchDoc {
  /** URL relative to the book's folder, e.g. `teacher.sign-in.html#sec-1-2`. */
  u: string
  /** Section title (chapter title for the lead). */
  t: string
  /** Chapter title with its number. */
  c: string
  /** Plain text. */
  x: string
  /** Labels of the roles the page is for (front matter audience); absent for a page for everyone. */
  r?: string[]
}
export interface SearchIndex {
  docs: SearchDoc[]
  /** token -> indexes into docs */
  terms: Record<string, number[]>
}
export interface SearchHit {
  doc: number
  score: number
}

/** Words of a text: Thai has no spaces, so Intl.Segmenter('th') finds the word boundaries. Lower case, NFC. */
export function tokenize(text: string): string[] {
  const norm = text.normalize('NFC').toLowerCase()
  const out: string[] = []
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    for (const s of new Intl.Segmenter('th', { granularity: 'word' }).segment(norm)) if (s.isWordLike) out.push(s.segment)
  } else {
    for (const w of norm.split(/[^\p{L}\p{N}\p{M}]+/u)) if (w) out.push(w)
  }
  return out
}

/**
 * Every query word must appear in a section (exact word 3, word prefix 2, inside the text 1 — the last one
 * covers words the segmenter split differently). Title matches and the whole phrase rank higher.
 */
export function search(index: SearchIndex, query: string, words: (text: string) => string[]): SearchHit[] {
  const q = words(query)
  if (!q.length) return []
  const phrase = query.normalize('NFC').toLowerCase().trim()
  const keys = Object.keys(index.terms)
  let scores: Map<number, number> | null = null
  for (const token of q) {
    const hit = new Map<number, number>()
    for (const d of index.terms[token] ?? []) hit.set(d, 3)
    for (const k of keys)
      if (k !== token && k.startsWith(token)) for (const d of index.terms[k] ?? []) hit.set(d, Math.max(hit.get(d) ?? 0, 2))
    index.docs.forEach((d, i) => {
      if (!hit.has(i) && `${d.t} ${d.x}`.toLowerCase().includes(token)) hit.set(i, 1)
    })
    if (scores === null) scores = hit
    else {
      const next = new Map<number, number>()
      for (const [d, s] of scores) if (hit.has(d)) next.set(d, s + (hit.get(d) ?? 0))
      scores = next
    }
  }
  const out: SearchHit[] = []
  for (const [doc, s] of scores ?? new Map<number, number>()) {
    const d = index.docs[doc]
    if (!d) continue
    let score = s
    if (d.t.toLowerCase().includes(phrase)) score += 5
    else if (d.x.toLowerCase().includes(phrase)) score += 2
    out.push({ doc, score })
  }
  return out.sort((a, b) => b.score - a.score || a.doc - b.doc)
}

/** Build the index from sections (build time). */
export function buildIndex(docs: SearchDoc[]): SearchIndex {
  const terms: Record<string, number[]> = {}
  docs.forEach((d, i) => {
    for (const t of new Set(tokenize(`${d.t} ${d.x}`))) (terms[t] ??= []).push(i)
  })
  const sorted = Object.fromEntries(Object.keys(terms).sort().map((k) => [k, terms[k]!]))
  return { docs, terms: sorted }
}

/** The browser copy of tokenize + search, exposed as window.ManualKitSearch. */
export function searchCoreScript(): string {
  return `/* manual-kit search (generated) */\n(function () {\nconst tokenize = ${tokenize.toString()};\nconst search = ${search.toString()};\nwindow.ManualKitSearch = { tokenize, search: (index, q) => search(index, q, tokenize) };\n})();\n`
}
