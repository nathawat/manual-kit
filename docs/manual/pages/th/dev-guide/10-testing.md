---
id: dev.testing
title: กลยุทธ์การทดสอบ
audience: [developer]
book: dev-guide
kind: concept
group: quality
summary: เทสต์รัน CLI จริงกับโครงการตัวอย่าง แล้วตรวจสิ่งที่ผู้ใช้เห็น (ข้อความใน PDF, XML ใน DOCX, ภาพ, ผล check)
routes: []
covers: []
sources: [tests/helpers/cli.ts, tests/helpers/fixture.ts, tests/helpers/server.ts, tests/helpers/outline-mock.ts, tests/plugin-bundle.test.ts, vitest.config.ts, package.json]
---
ผู้ใช้ manual-kit เห็นสองอย่าง: ผลของคำสั่ง (ข้อความ exit code) และไฟล์ที่ได้ (PDF DOCX เว็บ ภาพ) เทสต์จึงตรวจสองอย่างนั้น
ไม่ตรวจไส้ในของฟังก์ชัน (หลักการ #20) ถ้าเทสต์ยังผ่านแม้ฟังก์ชันที่ import มาคืน `undefined` เทสต์นั้นไม่ได้พิสูจน์อะไร

## รันอย่างไร

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm test` | vitest ทุกไฟล์ใน `tests/` |
| `pnpm exec vitest run tests/check.test.ts` | ไฟล์เดียว |
| `pnpm verify` | typecheck + bundle + test + build (ต้องผ่านก่อน push) |

## ส่วนประกอบ

| ส่วน | หน้าที่ |
|---|---|
| `tests/helpers/cli.ts` | `runCli(args, cwd)` รัน `src/cli.ts` ด้วย Node แบบที่ผู้ใช้รัน (ไม่มีขั้น build) และ `runCliAsync` เมื่อเทสต์ต้องเซิร์ฟ HTTP พร้อมกัน |
| `tests/fixtures/project` | โครงการตัวอย่างสองภาษาที่มีคู่มือครบ ผ่านทุกกฎ (`cleanFixture()` คัดลอกไป temp ทุกเทสต์) |
| `tests/fixtures/next-app`, `next-pages`, `nuxt-app`, `nuxt-plain`, `discover-app` | โครงการเล็กของแต่ละเฟรมเวิร์ก สำหรับ adapter และ discover |
| `tests/helpers/server.ts` | เว็บเซิร์ฟเวอร์ในเครื่องสำหรับ capture |
| `tests/helpers/outline-mock.ts` | Outline API จำลองสำหรับ publish |
| `tests/helpers/pdf.ts`, `docx.ts`, `png.ts` | อ่านข้อความ PDF ด้วย `pdftotext`, แตก DOCX เป็น XML, อ่านขนาด/พิกเซลภาพ |

## สิ่งที่ตรวจในแต่ละแบบ

- **check**: ทำ fixture ให้ผิดหนึ่งจุด รัน `check --json` ตรวจชื่อกฎ ความรุนแรง ไฟล์ และข้อความ ([[dev.add-check-rule]])
- **PDF**: ข้อความไทยออกมาถูก (ไม่มีกล่องสี่เหลี่ยม) สารบัญมีเลขหน้า หัว-ท้ายกระดาษ คำบรรยายภาพ
- **DOCX**: XML ทุก run มี `cs`, `szCs`, `bCs` ตามกฎภาษาไทย ฟอนต์ฝัง แพ็กเกจครบ ลำดับ element ตาม schema
- **เว็บ**: หน้าที่สร้าง ค้นหาภาษาไทย และ axe-core ผ่านทั้งโหมดสว่างและมืด
- **capture**: ภาพมีกรอบแดงที่ตำแหน่งถูก ส่วนที่ปิดบังเป็นสีเทา action ทำงานก่อนถ่าย host นอก allowlist ถูกปฏิเสธ
- **plugin**: bundle ตรงกับซอร์ส (`is committed as built from the current source`), ตัวเรียก bash รันบน `/bin/bash` ของ macOS
  และหาโฟลเดอร์ข้อมูลจากโครงของ plugin cache ถูก แพ็กเกจ runtime โหลดจาก `MANUAL_KIT_HOME`

## หลักการเพิ่มเทสต์

1. เขียนเทสต์ที่ไม่ผ่านก่อน แล้วค่อยแก้โค้ด (TDD) ข้อความ `it(...)` อ่านเป็นประโยคพฤติกรรม เช่น
   `select (by value or label), check, uncheck, hover and press on an element run before the image`
2. ใช้ fixture ที่มีอยู่ก่อนสร้างใหม่ fixture ใหม่ต้องเล็ก มีเฉพาะกรณีที่ต้องการ และเป็นข้อมูลสมมติ
3. เทสต์ที่ต้องใช้โปรแกรมภายนอก (pandoc, ffmpeg) ให้ข้ามพร้อมเหตุผลเมื่อไม่มีโปรแกรม ไม่ใช่ล้ม
4. เทสต์ต้องให้ผลเดิมทุกครั้ง: ไม่พึ่งเวลา เครือข่ายภายนอก หรือ config ของ Claude Code บนเครื่อง

## หน้าที่เกี่ยวข้อง

- [[dev.setup]]
- [[dev.release]]
