---
id: dev.architecture
title: สถาปัตยกรรม
audience: [developer]
book: dev-guide
kind: concept
group: design
summary: เครื่องมือทำงานกลไกโดยไม่มี AI ส่วน skill ใช้วิจารณญาณ ทั้งสองต่อกันเป็นสายงาน discover → spec → pages → capture → encode → build → check → publish
info: { ใช้เวลาอ่าน: 7 นาที }
routes: []
covers: []
sources: [docs/spec.md, src/cli.ts, src/project.ts, src/adapters/types.ts, src/render.ts, plugins/manual-kit/skills/manual/SKILL.md]
---
manual-kit แบ่งงานเป็นสองฝั่งที่ไม่ก้าวก่ายกัน การเข้าใจเส้นแบ่งนี้คือกุญแจของการแก้ repo:
งานไหนต้อง **ให้ผลเหมือนเดิมทุกครั้ง** อยู่ในเครื่องมือ งานไหนต้อง **ใช้วิจารณญาณ** อยู่ใน skill

## สองฝั่ง: เครื่องมือกับ skill

| | เครื่องมือ `manual-kit` (src/) | skill (plugins/manual-kit/skills/) |
|---|---|---|
| ทำอะไร | สแกนโค้ด ตรวจ ถ่ายภาพ ทำวิดีโอ ออกไฟล์ เผยแพร่ | อ่านโครงการ เขียนสเปก เลือกโครงเล่ม เขียนเนื้อหา ดูภาพแล้วตัดสินว่าถูก |
| ลักษณะ | deterministic: รันซ้ำได้ผลเดิม ไม่มี timestamp ในผลที่ commit ไม่เรียก AI ไม่ใช้ API key | ทำตามกติกาใน SKILL.md ด้วยวิจารณญาณของ Claude |
| ทดสอบอย่างไร | vitest รัน CLI จริงกับโครงการตัวอย่าง | เทียบผลการทำงานของ Claude แบบไม่มีและมี skill ([[dev.skills]]) |
| ทำไม | ใช้ใน CI ได้ ผล diff ได้ เชื่อถือได้ | ความเข้าใจผู้อ่านและภาษาที่อ่านง่ายเขียนเป็นสคริปต์ไม่ได้ |

กฎข้อเดียวที่ห้ามข้าม: **ไม่มีการเรียก AI ในเครื่องมือ** ถ้างานไหนต้องใช้วิจารณญาณ ให้เครื่องมือรวบรวมหลักฐานหรือตรวจผล
แล้วให้ skill เป็นคนตัดสิน เช่น `discover` เก็บหลักฐานแต่ไม่เขียนสเปก `check` ชี้หน้าที่ต้องแก้แต่ไม่แก้

## สายงาน

| ลำดับ | ขั้น | ใครทำ | คำสั่ง | ผลลัพธ์ |
|---|---|---|---|---|
| 1 | discover | เครื่องมือ | `manual-kit discover` | `discovery.json` + `discovery.md` (เรียงลำดับ ไม่มีเวลา จึง diff ได้) |
| 2 | spec | skill | | `manual-spec.md` ทุกข้ออ้างไฟล์ |
| 3 | pages | skill (+ `init`, `inventory`, `new-page`) | | `pages/<lang>/<book>/NN-slug.md`, `coverage.yaml` |
| 4 | capture | เครื่องมือ (spec จาก skill) | `manual-kit capture` | `media/<lang>/*.png`, `manifest.json` (hash ของ spec ต่อภาพ) |
| 5 | encode | เครื่องมือ | `manual-kit encode` | MP4 + ภาพปก + WebVTT |
| 6 | build | เครื่องมือ | `manual-kit build` | PDF, DOCX, เว็บ ใน `dist/` |
| 7 | check | เครื่องมือ (skill อ่านผลแล้วแก้) | `manual-kit check` | รายการ error/warning, exit 1 เมื่อผิด |
| 8 | publish | เครื่องมือ | `manual-kit publish outline` | เอกสารใน Outline + `outline.json` |

ลำดับจริงวนกลับได้: check ชี้ปัญหา → แก้หน้าหรือ shots.yaml → capture `--changed` → build ใหม่ และ **คน** รับรอง (`sign`)
ระหว่าง check กับการส่งมอบ เครื่องมือมีคำสั่งรับรองให้คนเรียก แต่ skill ห้ามเรียก

## แกนกลางที่ทุกคำสั่งใช้ร่วม

- **Project** (`src/project.ts`): `openProject(manualDir)` อ่าน config (ตรวจด้วย zod ที่ขอบ `src/config.ts`) หน้าทั้งหมด
  (`src/pages.ts`) และสร้าง adapter ทุกคำสั่งหลัง `init` เริ่มจากตรงนี้ ภายในเชื่อ type ได้
- **Adapter** (`src/adapters/types.ts`): อินเทอร์เฟซเดียวที่อ่านโค้ดของโครงการ ไม่รันโค้ดนั้น

```ts
export interface Adapter {
  /** Routes, roles, permissions, sections and flags, sorted by id, no duplicates. */
  items(): InventoryItem[]
  /** UI string key -> text for one language (empty map when the language is unknown). */
  uiStrings(lang: string): Map<string, string>
  /** A scalar value from the project (`ns.path.to.value`), or undefined. */
  data(key: string): string | undefined
}
```

- **Tokens** (`src/pages.ts` `mapTokens`): ตัวสแกนของ check และตัวแทนค่าของ build ใช้ฟังก์ชันเดียวกัน
  token ที่ check เห็นจึงเป็น token เดียวกับที่ build แทนค่า (ข้ามเฉพาะในโค้ดบล็อกแบบรั้ว)
- **Render** (`src/render.ts`): หน้า Markdown → ผลลัพธ์ตาม target `html` (PDF), `web`, `pandoc` (DOCX), `outline`
  ผลลัพธ์ใหม่จึงมักเริ่มจากการเพิ่ม target ([[dev.add-output]])
- **Lock** (`src/lock.ts`): `manual.lock.json` เก็บ hash ของไฟล์หน้าและ `sources` ตอนรับรอง check เทียบกับปัจจุบัน

## สองแบบของการแจกจ่าย

1. **repo** (นักพัฒนา): `node dist/cli.js` หลัง `pnpm build` หรือรัน `src/cli.ts` ตรงด้วย Node 22.18 ขึ้นไป (เทสต์ทำแบบนี้)
2. **plugin** (ทีม): `plugins/manual-kit/dist/manual-kit.mjs` ไฟล์เดียวที่ bundle แล้ว แพ็กเกจหนัก (playwright, pagedjs,
   typescript) ไม่ bundle แต่ติดตั้งลงโฟลเดอร์ข้อมูลของ plugin ตอนเปิดครั้งแรก ([[dev.repo-layout]], [[dev.release]])

## หน้าที่เกี่ยวข้อง

- [[dev.repo-layout]]
- [[dev.setup]]
