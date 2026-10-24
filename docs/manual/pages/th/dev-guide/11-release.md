---
id: dev.release
title: ปล่อยเวอร์ชันและกติกาการทำงาน
audience: [developer]
book: dev-guide
kind: how-to
group: quality
summary: จาก commit ถึงเครื่องของเพื่อนร่วมทีม (push main → claude plugin update) และกติกาการทำงานใน repo นี้
routes: []
covers: []
sources: [CHANGELOG.md, README.md, package.json, scripts/bundle-plugin.mjs, docs/engineering-principles.md, src/init.ts]
---
ทีมติดตั้ง manual-kit จาก repo บน GitLab โดยตรง สิ่งที่อยู่บน `main` จึงคือสิ่งที่ทีมได้เมื่ออัปเดต
หน้านี้บอกขั้นตอนตั้งแต่แก้โค้ดจนทีมได้ใช้ และกติกาที่ทำให้ `main` ใช้งานได้ตลอด

## ก่อนเริ่ม

- งานผ่าน `pnpm verify` และทดสอบ plugin ใน `CLAUDE_CONFIG_DIR` ชั่วคราวแล้วเมื่อแก้ skill หรือตัวเรียก ([[dev.setup]], [[dev.skills]])
- อ่าน `docs/engineering-principles.md` (สรุป 23 หลักการ เครดิต pstack ของ Lauren Tan สัญญาอนุญาต MIT)

## ขั้นตอน

1. **commit ทีละเรื่อง** แต่ละ commit มีเทสต์ โค้ด bundle และเอกสารของเรื่องนั้นครบ ข้อความขึ้นต้นด้วยชนิด
   (`feat(capture): ...`, `fix(docx): ...`, `docs: ...`) และบอกพฤติกรรมที่เปลี่ยน
2. **บันทึกใน CHANGELOG.md** หัวข้อ `Unreleased` หนึ่งย่อหน้าต่อความสามารถ อัปเดต `docs/reference.md` ถ้าคำสั่งหรือ config เปลี่ยน
   และ **อัปเดตคู่มือเล่มนี้** (`docs/manual`): รัน `node dist/cli.js -m docs/manual check --allow-unsigned`
   check จะชี้หน้าที่ไฟล์ต้นทางเปลี่ยนและคำสั่งใหม่ที่ยังไม่มีหน้า
3. **push `main`** plugin ใช้ commit เป็นเวอร์ชัน (`claude plugin list` แสดง `Version: <commit>`) ทีมได้ของใหม่เมื่อ:

   ```bash
   claude plugin update manual-kit@manual-kit
   ```

   หรือเปิดอัปเดตอัตโนมัติใน `/plugin` → Marketplaces → manual-kit → Enable auto-update
4. ถ้าแพ็กเกจ runtime เปลี่ยนรุ่น (`plugins/manual-kit/runtime/package.json`) เครื่องของทีมจะติดตั้งรุ่นใหม่เองครั้งถัดไปที่เปิด Claude Code
5. **CI ของโครงการลูกค้า** ตรึง manual-kit ด้วย `MANUAL_KIT_SPEC` (commit SHA เต็ม) จึงไม่เปลี่ยนตาม `main`
   แจ้งทีมเมื่อมีกฎตรวจใหม่ที่ควรเลื่อน SHA (กฎใหม่อาจทำให้ merge request ที่เคยผ่านไม่ผ่าน)
6. ตัดเวอร์ชันแบบมีเลข: `package.json` ตอนนี้คือ {{data:pkg.version}} และ CHANGELOG มีหัวข้อ `0.1.0` นโยบาย tag และเลขรุ่นต่อจากนี้: (รอระบุ)

## ผลลัพธ์ที่ได้

ทีมได้ความสามารถใหม่ด้วยคำสั่งเดียว `main` ผ่าน verify ทุก commit และ CHANGELOG กับคู่มือบอกสิ่งที่เปลี่ยน

## กติกาการทำงานใน repo นี้

- **TDD**: เทสต์ที่ไม่ผ่านก่อน แล้วโค้ด ([[dev.testing]])
- **commit เล็ก ทีละเรื่อง** ลำดับ commit อ่านแล้วเข้าใจได้ (หลักการ #19)
- **ไม่มี AI ในเครื่องมือ** งานที่ต้องใช้วิจารณญาณอยู่ใน skill ([[dev.architecture]])
- **ทำซ้ำได้ผลเดิม**: ไม่มี timestamp ในไฟล์ที่ commit, mapping ที่ทำให้ส่งซ้ำไม่สร้างซ้ำ (หลักการ #14)
- **ความปลอดภัย**: ถ่ายภาพเฉพาะ host ใน allowlist, ความลับจากตัวแปรสภาพแวดล้อมเท่านั้น, ไม่ใช้ Word อัตโนมัติ,
  ไม่ทดสอบด้วย config จริงของ Claude Code
- **บทเรียนกลายเป็นโครงสร้าง**: เจอปัญหาซ้ำ → เทสต์หรือกฎตรวจ ไม่ใช่ข้อความเตือน (หลักการ #23, [[dev.lessons]])

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| ทีมอัปเดตแล้วได้ของเก่า | marketplace cache | `claude plugin marketplace update manual-kit` แล้ว `plugin update` |
| CI ของโครงการล้มหลังอัปเดต | กฎตรวจใหม่ | แก้คู่มือตามที่ check บอก หรือคง SHA เดิมไว้ก่อน |
| `main` ใช้ไม่ได้บนเครื่องทีม | push โดยไม่ bundle | เทสต์ bundle กันไว้แล้ว: ห้ามข้าม `pnpm verify` |

## หน้าที่เกี่ยวข้อง

- [[dev.lessons]]
- [[use.install]]
