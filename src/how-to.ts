// The parts of a how-to page, in order (the building-product-manuals skill's reader-first template).
// One list feeds `new-page --kind how-to`, the `structure` and step rules of `check`, and the FAQ.

export type HowToLang = 'th' | 'en'
export type HowToPartId = 'intro' | 'how' | 'notes' | 'problems' | 'related'

export interface HowToPart {
  id: HowToPartId
  /** The heading as messages name it; `…` stands for the task. */
  name: Record<HowToLang, string>
  /** True when a `##` heading (trimmed) is this part. Some headings carry the task, so this is not always equality. */
  match: Record<HowToLang, (heading: string) => boolean>
  required: boolean
  /** Writing hint left as an HTML comment in a new page. */
  hint: Record<HowToLang, string>
}

const exact = (want: string) => (h: string) => h.toLowerCase() === want.toLowerCase()

export const HOW_TO_PARTS: HowToPart[] = [
  {
    id: 'intro',
    name: { th: '…คืออะไร', en: 'What is …' },
    match: { th: (h) => /คืออะไร\s*\??$/.test(h), en: (h) => /^what (?:is|are)\b/i.test(h) },
    required: true,
    hint: {
      th: 'เมื่อไรใช้งานนี้ ระบบทำอะไรให้ และต้องมีสิทธิ์อะไร (เรียกชื่อสิทธิ์ตามที่หน้าจัดการบทบาทแสดง) คำอธิบายทั้งหมดอยู่ที่นี่หรือใน "ข้อควรทราบ" ไม่อยู่ในขั้นตอน',
      en: 'When to use this task, what the system does, and the permission it needs (named as the role screen shows it). All explanation goes here or in "Good to know", never in the steps.',
    },
  },
  {
    id: 'how',
    name: { th: 'วิธี…', en: 'How to …' },
    match: { th: (h) => /^วิธี(?!แก้(?:ไข)?ปัญหา)/.test(h), en: (h) => /^how to\b/i.test(h) },
    required: true,
    hint: {
      th: 'ใช้ภาพทีละขั้น (โทเค็น steps ที่อ้างชุดภาพใน shots.yaml) ให้ทุกขั้นมีภาพพร้อมกรอบที่ปุ่ม ข้อละหนึ่งการกระทำสั้น ๆ ด้วยคำกริยาคงที่: เข้าเมนู “X” / คลิกปุ่ม “Y” / เลือก … / ระบุ … สิ่งที่ระบบแสดงก็นับเป็นขั้น ช่องที่ต้องกรอกเป็นข้อย่อยสั้น ๆ พร้อม (จำเป็นต้องระบุ) หรือ (ถ้ามี) ถ้าทำได้หลายวิธี เขียน "ทำได้ 2 วิธี" แล้วแยกเป็น ### วิธีที่ 1 … และ ### วิธีที่ 2 …',
      en: 'Use step images (a steps token naming a set in shots.yaml) so every step has an image with a frame on the control. One short action per step with fixed verbs: Go to “X” / Click “Y” / Select … / Enter … What the system shows counts as a step. Fields are short sub-bullets marked (required) or (optional). If there are several ways, write "There are 2 ways" and add ### Method 1 … and ### Method 2 ….',
    },
  },
  {
    id: 'notes',
    name: { th: 'ข้อควรทราบ', en: 'Good to know' },
    match: { th: exact('ข้อควรทราบ'), en: exact('Good to know') },
    required: false,
    hint: { th: 'ข้อสั้น ๆ: เงื่อนไข ข้อจำกัด หรือสิ่งที่เกิดขึ้นหลังทำเสร็จ (ลบหัวข้อนี้ถ้าไม่มี)', en: 'Short bullets: conditions, limits, or what happens afterwards (delete this part if there are none).' },
  },
  {
    id: 'problems',
    name: { th: 'ปัญหาที่อาจพบและวิธีแก้ไข', en: 'Problems and fixes' },
    match: { th: exact('ปัญหาที่อาจพบและวิธีแก้ไข'), en: exact('Problems and fixes') },
    required: true,
    hint: {
      th: 'ข้อละหนึ่งปัญหา บรรทัดแรก - ปัญหา: “ข้อความที่ระบบแสดง ตรงตามจริงทุกตัวอักษร” บรรทัดถัดไปย่อหน้าเข้าสองช่อง วิธีแก้ไข: สิ่งที่ผู้อ่านต้องทำ',
      en: 'One problem per item. First line - Problem: “the message exactly as the system shows it”; next line, indented two spaces, Fix: what the reader does.',
    },
  },
  {
    id: 'related',
    name: { th: 'คำถามที่เกี่ยวข้อง', en: 'Related questions' },
    match: { th: exact('คำถามที่เกี่ยวข้อง'), en: exact('Related questions') },
    required: false,
    hint: { th: 'ลิงก์ไปคำถามและหน้าที่เกี่ยวข้องด้วย [[รหัสหน้า]] (ลบหัวข้อนี้ถ้าไม่มี)', en: 'Links to related questions and pages, written [[page id]] (delete this part if there are none).' },
  },
]

/** Headings of the previous template: pages still build and the FAQ still reads them, but `structure` names the new ones. */
export const OLD_HOW_TO_HEADINGS: { th: string; en: string; now?: HowToPartId }[] = [
  { th: 'ก่อนเริ่ม', en: 'Before you start', now: 'intro' },
  { th: 'ขั้นตอน', en: 'Steps', now: 'how' },
  { th: 'ผลลัพธ์ที่ได้', en: 'Result' },
  { th: 'ปัญหาที่พบบ่อย', en: 'Common problems', now: 'problems' },
  { th: 'หน้าที่เกี่ยวข้อง', en: 'Related pages', now: 'related' },
]

/** Languages the structure rule knows headings for. */
export const howToLangs = (lang: string): lang is HowToLang => lang === 'th' || lang === 'en'

const part = (id: HowToPartId) => HOW_TO_PARTS.find((p) => p.id === id)!

/** The body of a new how-to page. `task` (the page title) fills the headings that name it. */
export function howToTemplate(lang: HowToLang, task?: string): string {
  const t = task?.trim()
  const heading: Record<HowToPartId, string> = {
    intro: lang === 'th' ? `${t || 'งานนี้'}คืออะไร` : `What is ${t || 'this task'}`,
    how: lang === 'th' ? `วิธี${t || 'ทำงานนี้'}` : `How to ${t ? t.charAt(0).toLowerCase() + t.slice(1) : 'do this task'}`,
    notes: part('notes').name[lang],
    problems: part('problems').name[lang],
    related: part('related').name[lang],
  }
  return HOW_TO_PARTS.map((p) => `## ${heading[p.id]}\n\n<!-- ${p.hint[lang]} -->`).join('\n\n') + '\n'
}

export interface HowToSection {
  /** The part this `##` heading is, if any. */
  part?: HowToPartId
  heading: string
  /** 0-based line of the heading in the body. */
  line: number
  /** The section's lines after the heading, up to the next `##`. */
  lines: string[]
}

/** The `##` sections of a page body; a `##` inside fenced code is not a heading. */
export function howToSections(body: string, lang: HowToLang): HowToSection[] {
  const out: HowToSection[] = []
  let fence = false
  body.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = !fence && /^##[ \t]+(.+?)[ \t#]*$/.exec(line)
    if (h) {
      const heading = h[1]!.trim()
      out.push({ part: HOW_TO_PARTS.find((p) => p.match[lang](heading))?.id, heading, line: i, lines: [] })
    } else out.at(-1)?.lines.push(line)
  })
  return out
}

/** Structure problems of a how-to page body: required parts missing, parts out of order, old headings. */
export function howToProblems(body: string, lang: HowToLang): string[] {
  const sections = howToSections(body, lang)
  const problems: string[] = []
  let last = -1
  for (const p of HOW_TO_PARTS) {
    const at = sections.findIndex((s) => s.part === p.id)
    if (at < 0) {
      if (p.required) problems.push(`missing "${p.name[lang]}"`)
    } else if (at < last) problems.push(`"${p.name[lang]}" is out of order`)
    else last = at
  }
  const old = OLD_HOW_TO_HEADINGS.filter((o) => sections.some((s) => !s.part && s.heading.toLowerCase() === o[lang].toLowerCase()))
  const instead = (o: (typeof OLD_HOW_TO_HEADINGS)[number]) => (o.now ? `"${part(o.now).name[lang]}"` : lang === 'th' ? 'the last step or "ข้อควรทราบ"' : 'the last step or "Good to know"')
  if (old.length) problems.push(`old template headings: ${old.map((o) => `"${o[lang]}" -> ${instead(o)}`).join(', ')}`)
  return problems
}

/** The `##` headings (lower case) that hold problems: the new one and the old "Common problems", both languages. */
export const PROBLEM_HEADINGS: ReadonlySet<string> = new Set(
  [part('problems').name, ...OLD_HOW_TO_HEADINGS.filter((o) => o.now === 'problems')].flatMap((n) => [n.th, n.en].map((h) => h.toLowerCase())),
)
