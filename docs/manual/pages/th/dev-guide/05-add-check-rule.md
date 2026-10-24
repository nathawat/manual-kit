---
id: dev.add-check-rule
title: เพิ่มกฎตรวจ
audience: [developer]
book: dev-guide
kind: how-to
group: extend
summary: เพิ่มกฎใน manual-kit check โดยดูกฎ structure (หัวข้อของหน้า how-to) เป็นตัวอย่าง
routes: []
covers: []
sources: [src/check.ts, src/how-to.ts, tests/check.test.ts, tests/helpers/fixture.ts, docs/reference.md]
---
`check` คือหัวใจที่ทำให้คู่มือตามระบบ ทุกครั้งที่ทีมเจอความผิดพลาดซ้ำในคู่มือ (คำผิดแบบเดิม หัวข้อขาด ภาพเก่า)
ให้คิดก่อนว่าเปลี่ยนเป็นกฎได้ไหม แทนการเขียนเตือนเพิ่มใน skill (หลักการ #23) `src/check.ts` เป็นฟังก์ชันบริสุทธิ์
อ่านไฟล์ของโครงการแล้วคืนรายการ finding ไม่เขียนอะไรเลย จึงทดสอบง่ายและใช้ใน CI ได้

## ก่อนเริ่ม

- ตัดสินว่าเป็น **error** (ผิดแน่ ต้องแก้ก่อนส่ง เช่น ป้ายหายจากโค้ด) หรือ **warning** (ควรแก้ แต่มีเหตุผลที่จะยอมได้ เช่น หัวข้อ how-to)
- ถ้ากฎต้องใช้ข้อมูลร่วมกับคำสั่งอื่น ให้วางข้อมูลนั้นไว้ที่เดียว (ตัวอย่าง: หัวข้อ how-to อยู่ใน `src/how-to.ts`
  ใช้ทั้ง `new-page` ที่เขียนหัวข้อ และ check ที่ตรวจหัวข้อ)

## ขั้นตอน

1. **เขียนเทสต์ก่อน** ใน `tests/check.test.ts`: คัดลอก fixture ที่ผ่านทุกกฎ ทำให้ผิดหนึ่งจุด แล้วรัน CLI จริงด้วย `--json`:

   ```ts
   it('structure: a how-to page missing a required part (or with parts out of order) is a warning naming them', async () => {
     const root = await cleanFixture()
     edit(root, EN1, (s) => s.replace('## Common problems', '## Troubles'))
     edit(root, TH1, (s) => s.replace(/## ผลลัพธ์ที่ได้[\s\S]*?(?=## ปัญหาที่พบบ่อย)/, ''))
     await signAll(root)
     const r = check(root)
     expect(r.code).toBe(0)
     const s = r.findings.filter((f) => f.rule === 'structure')
     expect(s[0]!.message).toMatch(/missing "Common problems"/)
   })
   ```

2. **เพิ่มชื่อกฎ** ใน union `Rule` ของ `src/check.ts` (ชื่อนี้ขึ้นในคอลัมน์ที่สองของผล check และใน `--json`)
3. **เพิ่มการตรวจ** ใน `runCheck` ด้วย `err(rule, message, file, line?)` หรือ `warn(rule, message, file)`
   ข้อความต้องบอกทั้ง **อะไรผิด** และ **ทำอย่างไรต่อ** เพราะคนที่อ่านคือ Claude หรือเพื่อนร่วมทีมใน CI:

   ```ts
   if (p.meta.kind === 'how-to' && howToLangs(p.lang)) {
     const problems = howToProblems(p.body, p.lang)
     if (problems.length)
       warn('structure', `how-to page ${p.id}: ${problems.join(', ')} (a how-to has ${HOW_TO_PARTS.map((h) => `"${h[p.lang as 'th' | 'en']}"`).join(', ')} as ## headings)`, p.rel)
   }
   ```

4. ถ้ากฎตั้งค่าได้ ให้เพิ่มช่องใน `ConfigSchema` (`src/config.ts`) พร้อมค่าเริ่มต้น เช่น `wording.forbidden`
   กฎของโครงการหนึ่ง (เช่น "ใช้คำว่า กด") ควรเป็นค่าใน config ไม่ใช่โค้ดใหม่
5. อัปเดตหัวข้อ "What `check` verifies" ใน `docs/reference.md` และ CHANGELOG แล้ว `pnpm verify`

## ผลลัพธ์ที่ได้

check รายงานกฎใหม่ในทุกโครงการ ทั้งบนเครื่องและใน CI โดยไม่มีใครต้องจำ ตัวอย่างจริง: ระหว่างเขียนคู่มือเล่มนี้
กฎ `wording` จับคำโอ้อวดที่หลุดมาในประโยคธรรมดาได้สามที่ และกฎ `ui` จับป้ายของคำสั่งที่ adapter ยังไม่รู้จักได้

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| เทสต์ของกฎอื่นพังตาม | fixture กลางไม่ผ่านกฎใหม่ | แก้ fixture ให้ถูกตามกฎ (fixture กลางต้องผ่านทุกกฎ) |
| กฎตรวจโค้ดในโค้ดบล็อกด้วย | อ่าน `p.body` ตรง | ถ้ากฎเกี่ยวกับ token ใช้ `p.tokens` ซึ่งข้ามโค้ดบล็อกแล้ว |
| คำต้องห้ามโดนในประโยคที่อธิบายกฎเอง | regex ไม่รู้บริบท | เขียนประโยคใหม่ หรือจำกัดภาษาด้วย `lang` |

## หน้าที่เกี่ยวข้อง

- [[dev.testing]]
- [[dev.add-capture-action]]
