// Help-center parts of the web site, read from the HTML the web build already renders for each page:
// the problem items (FAQ page), the clips (video gallery) and the first screenshot (task cards).
import { PROBLEM_HEADINGS } from '../how-to.ts'

/** One problem from a page: what the reader sees, and the fix (with the cause when the page gives one). HTML. */
export interface Problem {
  symptom: string
  cause?: string
  fix: string
  /** Id of the section heading the problem sits under ('' = the page's lead). */
  anchor: string
}

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const norm = (s: string) => strip(s).toLowerCase()

/** True when a heading (or page title) names a problems section: "Problems and fixes" or the old "Common problems". */
export const isProblemHeading = (text: string) => PROBLEM_HEADINGS.has(norm(text))

// Items, the first alternative that matches at a place wins:
// 1. the template's pair, a list item or paragraph "Problem: <message>" then "Fix: <what to do>" (labels may be bold):
//      - ปัญหา: “กรุณาเพิ่มหนังสือหลัก”
//        วิธีแก้ไข: แนบไฟล์หนังสือหลัก แล้วคลิกปุ่ม “บันทึก” อีกครั้ง
// 2. a 3-column table row (what you see | cause | fix)
// 3. a paragraph / list item that starts with the symptom in bold
const label = (words: string) => String.raw`(?:<strong>)?\s*(?:${words})\s*[:：]\s*(?:<\/strong>)?\s*`
const ITEM = new RegExp(
  [
    String.raw`<(li|p)>\s*${label('ปัญหา|Problem')}((?:(?!<\/?(?:li|p|ul|ol)[ >])[\s\S])*?)${label('วิธีแก้ไข|วิธีแก้|Fix')}([\s\S]*?)<\/\1>`,
    String.raw`<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>`,
    String.raw`<(li|p)>\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/\7>`,
  ].join('|'),
  'g',
)

/**
 * Problems in a page's rendered HTML: every item under a problems heading ("ปัญหาที่อาจพบและวิธีแก้ไข", or the old
 * "ปัญหาที่พบบ่อย"), or every item on the page when the page itself is the problems page (`wholePage`).
 */
export function problemsIn(html: string, wholePage = false): Problem[] {
  const out: Problem[] = []
  for (const part of html.split(/(?=<h2[ >])/)) {
    const h2 = /^<h2(?: id="([^"]*)")?[^>]*>([\s\S]*?)<\/h2>/.exec(part)
    if (!wholePage && !(h2 && isProblemHeading(h2[2]!))) continue
    const anchor = h2?.[1] ?? ''
    for (const m of part.matchAll(ITEM)) {
      if (m[1] !== undefined) {
        const fix = m[3]!.trim()
        if (fix) out.push({ symptom: m[2]!.replace(/(\s|<br\s*\/?>)+$/, ''), fix, anchor })
      } else if (m[4] !== undefined) out.push({ symptom: m[4].trim(), cause: m[5]!.trim(), fix: m[6]!.trim(), anchor })
      else {
        const fix = m[9]!.replace(/^(\s|<br\s*\/?>|[:：—–-])+/, '').trim()
        if (fix) out.push({ symptom: m[8]!.trim(), fix, anchor })
      }
    }
  }
  return out
}

/**
 * Symptom types for the FAQ filter, first match wins. Tested on the symptom's HTML, so a symptom that is only a
 * system message (one code span, or text in quotes) counts as a message.
 */
export const SYMPTOM_TYPES = [
  {
    id: 'message',
    label: { th: 'ข้อความแจ้งเตือน', en: 'Error or message' },
    test: /^\s*<code>[^<]*<\/code>\s*$|^\s*(?:&quot;|[“"])[\s\S]*(?:&quot;|[”"])\s*$|ข้อความ|ขึ้นว่า|แจ้งว่า|ระบบแจ้ง|แจ้งเตือน|คำเตือน|ล้มด้วย|\berror\b|\bmessages?\b|\bsays\b|\bwarning\b/i,
  },
  {
    id: 'missing',
    label: { th: 'ไม่เห็นปุ่มหรือเมนู', en: 'Missing button or menu' },
    test: /ไม่เห็น|ไม่มีปุ่ม|ไม่มีเมนู|ไม่มีลิงก์|กดไม่ได้|ใช้ไม่ได้|ไม่ขึ้น|หายไป|can'?t see|cannot see|\bmissing\b|\bdisabled\b|greyed|grayed|doesn'?t (show|appear)/i,
  },
  {
    id: 'notfound',
    label: { th: 'หาหนังสือหรือข้อมูลไม่เจอ', en: "Can't find a document or data" },
    test: /ไม่เจอ|หาไม่|ไม่พบ|ไม่แสดง|ไม่ปรากฏ|not found|can'?t find|cannot find|no results|\bempty\b/i,
  },
  { id: 'other', label: { th: 'อื่น ๆ', en: 'Other' }, test: /(?:)/ },
] as const
export type SymptomType = (typeof SYMPTOM_TYPES)[number]['id']

export const symptomType = (symptomHtml: string): SymptomType => SYMPTOM_TYPES.find((t) => t.test.test(symptomHtml))!.id

/** A clip player as the page renders it: what the gallery needs to show and play it. Paths as in the page. */
export interface ClipCard {
  id: string
  title: string
  thumb: string
  video: string
  vtt: string
  len: string
}

export function clipsIn(html: string): ClipCard[] {
  return [...html.matchAll(/<figure data-clip="([^"]+)"[\s\S]*?<\/figure>/g)].flatMap((m) => {
    const fig = m[0]
    const video = /<source src="([^"]+)"/.exec(fig)?.[1]
    const cover = /class="clip-cover" aria-label="[^":]*: ([^"]*)"><img src="([^"]+)"/.exec(fig)
    if (!video || !cover) return []
    return [{ id: m[1]!, title: cover[1]!, thumb: cover[2]!, video, vtt: /<track [^>]*src="([^"]+)"/.exec(fig)?.[1] ?? '', len: /<span class="len">([^<]+)<\/span>/.exec(fig)?.[1] ?? '' }]
  })
}

/** The first screenshot or step image of a page (not a clip cover), for a task card. */
export const firstShot = (html: string): string | undefined => /<figure (?!data-clip)[^>]*>(?:(?!<\/figure>)[\s\S])*?<img src="([^"]+)"/.exec(html)?.[1]
