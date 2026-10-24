// "ทำได้ N วิธี" cards (web): a how-to whose "วิธี…" / "How to …" section holds two or more ### ways of doing the task
// gets a row of cards at the top of that section, each linking to one way. Paper shows the sub-headings alone.

const WORDS = {
  th: { head: 'ทำได้ {n} วิธี', way: 'วิธีที่ {k}' },
  en: { head: '{n} ways to do this', way: 'Method {k}' },
}

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
/** The section a task's steps live in: "วิธี<งาน>" / "How to <task>". */
const isMethodSection = (text: string) => /^(วิธี|how to\b)/i.test(text)
/** A number the writer already put in front of a way ("วิธีที่ 1:", "Method 2 –"): the card shows its own. */
const NUMBERED = /^(วิธีที่|method|way|option)\s*\d+\s*[:：.)\-–—]?\s*/i

/** A page's rendered HTML with the method cards inserted under each "วิธี…" heading that has two or more ### ways. */
export function methodCards(html: string, lang: string): string {
  const w = lang === 'th' ? WORDS.th : WORDS.en
  return html
    .split(/(?=<h2[ >])/)
    .map((part) => {
      const h2 = /^<h2(?: id="([^"]*)")?[^>]*>([\s\S]*?)<\/h2>\n?/.exec(part)
      if (!h2 || !isMethodSection(strip(h2[2]!))) return part
      const ways = [...part.matchAll(/<h3 id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => ({ id: m[1]!, text: strip(m[2]!).replace(NUMBERED, '') }))
      if (ways.length < 2) return part
      const headId = `${h2[1] ?? 'methods'}-ways`
      const cards = ways
        .map((x, i) => `<li><a href="#${x.id}"><span class="methods-n">${w.way.replace('{k}', String(i + 1))}</span><span class="methods-title">${x.text}</span></a></li>`)
        .join('')
      const nav = `<nav class="methods" aria-labelledby="${headId}"><p class="methods-head" id="${headId}">${w.head.replace('{n}', String(ways.length))}</p><ol class="methods-list">${cards}</ol></nav>\n`
      return part.slice(0, h2[0].length) + nav + part.slice(h2[0].length)
    })
    .join('')
}
