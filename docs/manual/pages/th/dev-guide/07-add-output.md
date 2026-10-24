---
id: dev.add-output
title: เพิ่มผลลัพธ์หรือช่องทางเผยแพร่
audience: [developer]
book: dev-guide
kind: how-to
group: extend
summary: เพิ่มรูปแบบผลลัพธ์หรือที่เผยแพร่ใหม่ โดยดู publish outline เป็นตัวอย่าง (render target ใหม่ + แผน + ไฟล์ mapping ที่ทำซ้ำได้)
routes: []
covers: []
sources: [src/render.ts, src/publish/outline.ts, src/cli.ts, src/config.ts, tests/publish-outline.test.ts, tests/helpers/outline-mock.ts]
---
ผลลัพธ์ทุกแบบ (PDF, DOCX, เว็บ, Outline) เริ่มจากที่เดียวกัน: `renderBook` ใน `src/render.ts` แปลงหน้า Markdown
พร้อม token ให้เป็นข้อความตาม **target** แล้วตัวสร้างแต่ละแบบนำไปใช้ต่อ การเพิ่มช่องทางใหม่จึงมีสามส่วน:
target ใน render, ตัวสร้างหรือตัวส่ง, และคำสั่งใน CLI

## ก่อนเริ่ม

- อ่าน API ของปลายทาง และหาวิธีทดสอบโดยไม่ยิงของจริง (Outline ใช้เซิร์ฟเวอร์จำลอง `tests/helpers/outline-mock.ts`)
- ความลับ (API key) อ่านจากตัวแปรสภาพแวดล้อมเท่านั้น ห้ามเขียนลงไฟล์ ห้ามพิมพ์ออกหน้าจอ

## ขั้นตอน

1. **เพิ่ม target** ใน `Target` ของ `src/render.ts` แล้วจัดการจุดที่ต่างกัน เช่น Outline ไม่มีวิดีโอในเอกสาร
   จึงแสดงภาพปกพร้อมลิงก์ MP4 และ callout กลายเป็น notice ของ Outline:

   ```ts
   export type Target = 'html' | 'web' | 'pandoc' | 'outline'
   // ...
   if (target === 'outline') return `\n${figure(f.poster, caption, 'clip', alt)}\n\n[▶ ${escMd(`${L.play}: ${caption}`)} (MP4)](${f.mp4})\n`
   ```

2. **วางแผนก่อนส่ง**: ฟังก์ชัน `plan` คืนรายการเอกสาร (เล่มละหนึ่ง หน้าละหนึ่ง) พร้อมไฟล์ที่ต้องแนบ โดยยังไม่ส่งอะไร
   ทั้ง `--dry-run` และการส่งจริงใช้แผนเดียวกัน สิ่งที่ dry-run แสดงจึงตรงกับสิ่งที่จะเกิดจริง
3. **ทำให้ส่งซ้ำได้ผลเดิม** (หลักการ #14): เก็บ mapping ไว้ในไฟล์ที่ commit ได้ (`manual/outline.json`: รหัสเอกสารต่อหน้า,
   hash ของข้อความที่ส่งล่าสุด, ไฟล์แนบตาม sha256 ของไฟล์) ส่งครั้งต่อไปจึงแก้เฉพาะที่เปลี่ยน อัปโหลดเฉพาะไฟล์ใหม่
   และกันการส่งผิดที่ด้วยการผูกไฟล์ไว้กับ wiki และ collection เดียว
4. **อ่าน key จากสภาพแวดล้อมเท่านั้น** และบอกวิธีแก้เมื่อไม่มี:

   ```ts
   export const TOKEN_ENV = 'OUTLINE_API_KEY'
   // ... throw new UsageError(`set the Outline API key in the environment variable ${TOKEN_ENV} (it is never read from a file)`)
   ```

5. **ต่อเข้า CLI** ใน `src/cli.ts` ใต้คำสั่งกลุ่ม `publish` (หรือเพิ่มรูปแบบให้ `build` ถ้าเป็นไฟล์):

   ```ts
   const publish = program.command('publish').description('publish the built manual somewhere people read it')
   publish
     .command('outline')
     .option('--collection <id>', 'collection id or urlId (default: config outline.collection)')
     .option('--dry-run', 'print what would be created, updated and uploaded; send nothing')
     .action(async (opts) => { await publishOutline(await openProject(manualDir()), opts) })
   ```

6. เพิ่มค่าใน `ConfigSchema` ถ้ามี (เช่น `outline: { baseUrl, collection, parent }`) เทสต์กับ mock (สร้าง แก้ ไม่ส่งซ้ำ
   สร้างใหม่เมื่อถูกลบ ไม่มี key) อัปเดต `docs/reference.md` และ CHANGELOG แล้ว `pnpm verify`
7. คำสั่งใหม่เป็นรายการ coverage ของคู่มือเล่มนี้โดยอัตโนมัติ (adapter ของเล่มนี้อ่าน `.command(...)` ใน `src/cli.ts`)
   check ของ `docs/manual` จะไม่ผ่านจนกว่าจะมีหน้าคู่มือพูดถึงคำสั่งนั้น

## ผลลัพธ์ที่ได้

ช่องทางใหม่ที่มี dry-run ส่งซ้ำได้ปลอดภัย ไม่รั่วความลับ และมีหน้าคู่มือกำกับ

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| ลิงก์ข้ามหน้าเสียบนปลายทาง | ลิงก์ชี้ anchor ภายในไฟล์ | เขียนลิงก์ใหม่หลังรู้ที่อยู่เอกสาร (`finalText` แทนลิงก์ด้วย URL ของเอกสาร) |
| ส่งซ้ำแล้วได้เอกสารซ้ำ | ไม่มี mapping หรือไม่ได้ commit | เก็บ mapping และ commit |
| ภาพไม่ขึ้น | ส่งที่อยู่ไฟล์ในเครื่อง | อัปโหลดเป็นไฟล์แนบก่อน แล้วแทนที่อยู่ด้วย URL ของไฟล์แนบ |

## หน้าที่เกี่ยวข้อง

- [[dev.themes]]
- [[dev.testing]]
