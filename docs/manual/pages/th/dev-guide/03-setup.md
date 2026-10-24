---
id: dev.setup
title: ตั้งเครื่องสำหรับพัฒนา
audience: [developer]
book: dev-guide
kind: how-to
group: design
summary: ติดตั้ง ตรวจทั้งหมดด้วย pnpm verify สร้าง bundle และทดสอบ plugin โดยไม่แตะ config จริงของ Claude Code
routes: []
covers: []
sources: [package.json, scripts/bundle-plugin.mjs, tests/plugin-bundle.test.ts, plugins/manual-kit/scripts/env.sh, README.md]
---
หน้านี้พาตั้งเครื่องให้รันเทสต์ทั้งหมดผ่าน และลอง plugin ที่แก้แล้วใน Claude Code แบบแยกจาก config จริง

## ก่อนเริ่ม

- Node {{data:pkg.engines.node}} คือขั้นต่ำของ CLI และ plugin (ใช้ `fs.globSync` ที่เสถียรตั้งแต่ 22.17) แต่การพัฒนา repo รันไฟล์ `.ts` ตรง
  จึงต้อง Node 22.18 ขึ้นไป (แนะนำ Node 24) เลขขั้นต่ำต้องตรงกันใน package.json, `scripts/env.sh`, README และ docs/reference.md
  (เทสต์ `tests/node-version.test.ts` ตรวจให้)
- pnpm, git, สิทธิ์ push repo manual-kit (หรือ fork ของคุณ)
- สำหรับเทสต์บางชุด: pandoc (DOCX), ffmpeg (คลิป), poppler `pdftotext` (อ่านข้อความใน PDF)

## ขั้นตอน

1. ติดตั้งแพ็กเกจและ Chromium ของ Playwright:

   ```bash
   pnpm install && pnpm exec playwright install chromium
   ```

2. ตรวจทั้งหมดก่อนเริ่มแก้ เพื่อรู้ว่าเริ่มจากสถานะที่ผ่าน:

   ```bash
   pnpm verify   # = pnpm check && pnpm bundle && pnpm test && pnpm build
   ```

{{shot:verify}}

3. รัน CLI จาก repo: `node dist/cli.js <คำสั่ง>` หลัง `pnpm build` หรือ `node src/cli.ts <คำสั่ง>` ตรงจากซอร์ส
   ใช้ {{ui:"--manual"}} ชี้โฟลเดอร์คู่มือ เช่น `node dist/cli.js -m docs/manual check --allow-unsigned`
4. หลังแก้ `src/` ทุกครั้ง รัน `pnpm bundle` แล้ว commit `plugins/manual-kit/dist/manual-kit.mjs` ไปด้วย
5. ทดสอบ plugin ใน Claude Code **ด้วยโฟลเดอร์ config ชั่วคราวเสมอ** เพื่อไม่ให้ไปเปลี่ยน plugin หรือการตั้งค่าที่ใช้ทำงานจริง:

   ```bash
   export CLAUDE_CONFIG_DIR=/tmp/mk-plugin-test     # โฟลเดอร์ทิ้งได้
   claude plugin marketplace add /path/to/manual-kit  # ชี้ที่ repo ในเครื่อง ไม่ต้อง push ก่อน
   claude plugin install manual-kit@manual-kit
   claude                                            # แล้วลอง /manual ในโครงการทดสอบ
   ```

   เมื่อเสร็จ ลบโฟลเดอร์นั้นทิ้ง ห้ามใช้ `~/.claude` ของตัวเองหรือของคนอื่นเป็นที่ทดสอบ

## ผลลัพธ์ที่ได้

`pnpm verify` ผ่าน (ทุกไฟล์เทสต์ผ่าน) และ plugin ที่แก้แล้วทำงานใน Claude Code ชุดทดสอบ

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| เทสต์ `is committed as built from the current source (run: pnpm bundle)` ไม่ผ่าน | แก้ `src/` แต่ bundle เก่า | `pnpm bundle` แล้ว commit |
| เทสต์ DOCX หรือคลิปถูกข้าม/ไม่ผ่าน | ไม่มี pandoc หรือ ffmpeg | `brew install pandoc ffmpeg` |
| `unknown command 'doctor'` | `doctor` และ `setup` อยู่ในตัวเรียก plugin (`bin/manual-kit`) ไม่อยู่ใน CLI | รัน `plugins/manual-kit/bin/manual-kit doctor` |
| `bin/manual-kit` พังบน macOS | bash 3.2 ของ macOS ไม่รับ `case` ใน `$(...)` | ดู [[dev.lessons]] |

## หน้าที่เกี่ยวข้อง

- [[dev.testing]]
- [[dev.release]]
