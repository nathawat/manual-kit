/* manual-kit search (generated) */
(function () {
const tokenize = function tokenize(text        )           {
  const norm = text.normalize('NFC').toLowerCase()
  const out           = []
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    for (const s of new Intl.Segmenter('th', { granularity: 'word' }).segment(norm)) if (s.isWordLike) out.push(s.segment)
  } else {
    for (const w of norm.split(/[^\p{L}\p{N}\p{M}]+/u)) if (w) out.push(w)
  }
  return out
};
const search = function search(index             , query        , words                            )              {
  const q = words(query)
  if (!q.length) return []
  const phrase = query.normalize('NFC').toLowerCase().trim()
  const keys = Object.keys(index.terms)
  let scores                             = null
  for (const token of q) {
    const hit = new Map                ()
    for (const d of index.terms[token] ?? []) hit.set(d, 3)
    for (const k of keys)
      if (k !== token && k.startsWith(token)) for (const d of index.terms[k] ?? []) hit.set(d, Math.max(hit.get(d) ?? 0, 2))
    index.docs.forEach((d, i) => {
      if (!hit.has(i) && `${d.t} ${d.x}`.toLowerCase().includes(token)) hit.set(i, 1)
    })
    if (scores === null) scores = hit
    else {
      const next = new Map                ()
      for (const [d, s] of scores) if (hit.has(d)) next.set(d, s + (hit.get(d) ?? 0))
      scores = next
    }
  }
  const out              = []
  for (const [doc, s] of scores ?? new Map                ()) {
    const d = index.docs[doc]
    if (!d) continue
    let score = s
    if (d.t.toLowerCase().includes(phrase)) score += 5
    else if (d.x.toLowerCase().includes(phrase)) score += 2
    out.push({ doc, score })
  }
  return out.sort((a, b) => b.score - a.score || a.doc - b.doc)
};
window.ManualKitSearch = { tokenize, search: (index, q) => search(index, q, tokenize) };
})();
