---
id: dev.skills
title: แก้และทดสอบ skill
audience: [developer]
book: dev-guide
kind: how-to
group: quality
summary: skill คือโค้ดที่ Claude รัน แก้แล้วต้องพิสูจน์ด้วยการเทียบงานของ Claude แบบไม่มีกับมี skill ในโครงการทดสอบ
routes: []
covers: []
sources: [plugins/manual-kit/skills/manual/SKILL.md, plugins/manual-kit/skills/building-product-manuals/SKILL.md, plugins/manual-kit/skills/building-product-manuals/spec-template.md, docs/spec.md, scripts/bundle-plugin.mjs]
---
skill สองตัวของ manual-kit คือคำสั่งที่ Claude อ่านแล้วทำตาม: {{ui:"manual"}} บอก **ลำดับงาน** ของ `/manual`
(โหมดใหม่ spec update check) ส่วน {{ui:"building-product-manuals"}} เป็น **ที่เดียว** ของกติกาการเขียนคู่มือ
การแก้ skill จึงเหมือนแก้โค้ด: ต้องมีหลักฐานว่า Claude ทำตามจริง ไม่ใช่แค่อ่านแล้วดูดี

## ก่อนเริ่ม

- รู้ว่ากำลังแก้ปัญหาอะไร โดยมีตัวอย่างงานที่ Claude ทำผิด (เช่น เดาชื่อผู้อนุมัติ, ลืมปิดเซิร์ฟเวอร์ที่เปิด)
- ถามก่อนว่าปัญหานั้นเป็นกฎตรวจได้ไหม ([[dev.add-check-rule]]) กฎที่เครื่องตรวจได้แข็งแรงกว่าข้อความใน skill
- มีโครงการทดสอบที่รันได้ในเครื่องและมีข้อมูลสมมติเท่านั้น (เช่น สำเนาของ `tests/fixtures/discover-app` หรือแอปตัวอย่างของทีม)

## ขั้นตอน

1. **วางกฎไว้ที่เดียว**: กติกาและวิธีการอยู่ใน `building-product-manuals/SKILL.md` ส่วน `manual/SKILL.md` อ้างไปที่นั่น
   อย่าคัดลอกกฎซ้ำสองที่ เพราะวันหนึ่งจะขัดกัน รายละเอียดคำสั่งอยู่ใน `docs/reference.md` ซึ่ง `pnpm bundle` คัดลอกไปเป็น
   `building-product-manuals/reference.md` (แก้ที่ `docs/reference.md` เท่านั้น)
2. **วัดก่อนแก้ (baseline)**: ติดตั้ง plugin รุ่นปัจจุบันใน `CLAUDE_CONFIG_DIR` ชั่วคราว ([[dev.setup]]) เปิด Claude Code
   ในสำเนาโครงการทดสอบ สั่งงานเดียวกับที่เคยผิด แล้วบันทึกว่า Claude ทำอะไร (คำสั่งที่รัน ไฟล์ที่ได้ สิ่งที่ผิด)
3. **แก้ skill** ให้สั้นและเป็นคำสั่ง: บอกว่าทำอะไร **และทำไม** ระบุสิ่งที่ห้ามทำตรง ๆ เพิ่มลงหัวข้อ "Common mistakes" ถ้าเป็นความผิดที่พบบ่อย
4. **วัดหลังแก้ (with skill)**: ล้างสำเนาโครงการทดสอบ ใช้ plugin ที่แก้แล้ว (`marketplace add` ชี้ที่ repo ในเครื่อง)
   สั่งงานเดิมด้วยข้อความเดิม แล้วเทียบกับ baseline: ความผิดเดิมหายไหม มีความผิดใหม่ไหม
5. ทดสอบโหมดอื่นที่อาจกระทบ (`/manual spec`, `/manual update`, `/manual check`) อย่างน้อยหนึ่งรอบ
6. ลบโฟลเดอร์ config ชั่วคราวและสำเนาโครงการ ปิดทุกโปรเซสที่ตัวเองเปิด แล้ว commit skill พร้อมบันทึกผลเทียบสั้น ๆ ในข้อความ commit

## ผลลัพธ์ที่ได้

skill ที่มีหลักฐานว่าทำให้ Claude ทำงานถูกขึ้น และไม่มีกฎที่ขัดกันระหว่างไฟล์ ทีมได้รับเมื่อ `claude plugin update`

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| Claude ยังทำผิดเหมือนเดิม | กฎอยู่ลึกในข้อความยาว หรือไม่มีเหตุผลกำกับ | ย้ายขึ้นที่ที่ Claude อ่านก่อน บอกเหตุผล หรือเปลี่ยนเป็นกฎของ check |
| ทดสอบแล้ว plugin จริงของตัวเองเปลี่ยน | ไม่ได้ตั้ง `CLAUDE_CONFIG_DIR` | ตั้งทุกครั้ง ใช้โฟลเดอร์ทิ้งได้ |
| `reference.md` ใน skill ถูกเขียนทับ | แก้ที่สำเนา | แก้ `docs/reference.md` แล้ว `pnpm bundle` |
| Claude รับรองหน้าเอง | กฎ "คนเท่านั้นที่รับรอง" ไม่ชัด | กฎนี้ต้องอยู่ทั้งใน skill และในข้อความของ check (มีแล้ว) ห้ามลบ |

## หน้าที่เกี่ยวข้อง

- [[dev.testing]]
- [[dev.release]]
