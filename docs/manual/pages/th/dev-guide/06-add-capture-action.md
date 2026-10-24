---
id: dev.add-capture-action
title: เพิ่ม action ถ่ายภาพ
audience: [developer]
book: dev-guide
kind: how-to
group: extend
summary: เพิ่มการกระทำบนหน้าเว็บก่อนถ่ายภาพ (เช่น hover, press) ใน shots.yaml โดยเพิ่ม schema หนึ่งแถวและตัวรันหนึ่งบรรทัด
routes: []
covers: []
sources: [src/shots.ts, src/capture.ts, tests/capture.test.ts, tests/helpers/server.ts, docs/reference.md]
---
action คือสิ่งที่ capture ทำบนหน้าเว็บก่อนวาดกรอบแดงและถ่ายภาพ เช่น กด กรอก เลือก ชี้เมาส์ ทุก action มีสองที่:
schema ใน `src/shots.ts` (ตรวจ shots.yaml ที่ขอบ) และตัวรันใน `src/capture.ts` ฟังก์ชัน `run`

## ก่อนเริ่ม

- action ใหม่ต้องทำซ้ำได้ผลเดิม และไม่ออกนอก allowlist (การเปิดหน้าใหม่ต้องผ่าน `goto` ที่ตรวจ host เสมอ)
- ถ้ารับข้อความจากผู้ใช้ ให้ผ่าน `fill(value, lang)` เพื่อรองรับ `{lang}` และ `{env:NAME}` (รหัสผ่านไม่อยู่ในไฟล์)

## ขั้นตอน

1. **เขียนเทสต์ก่อน** ใน `tests/capture.test.ts`: หน้า HTML เล็ก ๆ ที่เซิร์ฟจาก `tests/helpers/server.ts` บันทึกผลของ action
   ลงหน้าเอง (เช่น `onmouseenter="this.dataset.hover = '1'"`) แล้วตรวจจากภาพหรือ DOM ว่า action ทำงานก่อนถ่าย
2. **เพิ่ม schema** หนึ่งแถวใน union `Action` (ใช้ `.strict()` เพื่อให้พิมพ์ผิดแล้ว shots.yaml ไม่ผ่าน แทนการถูกข้ามเงียบ ๆ):

   ```ts
   export const Action = z.union([
     z.object({ click: Selector }).strict(),
     z.object({ fill: Selector, value: z.string() }).strict(),
     /** A key (Playwright name: Enter, Escape, Control+A...), on the focused element or on `on`. */
     z.object({ press: z.string().min(1), on: Selector.optional() }).strict(),
     z.object({ hover: Selector }).strict(),
     // ...
   ])
   ```

3. **เพิ่มตัวรัน** หนึ่งบรรทัดใน `run` ของ `src/capture.ts`:

   ```ts
   else if ('press' in a) await (a.on ? page.press(a.on, a.press) : page.keyboard.press(a.press))
   else if ('hover' in a) await page.hover(a.hover)
   ```

4. ถ้า action ใช้ได้เฉพาะบางชนิดของ spec (เช่น `show` ใช้ได้กับหน้าต่าง terminal เท่านั้น) ให้ตรวจใน `loadShots`
   แล้วโยนข้อความที่บอกวิธีแก้ เช่น `"show" works only in a terminal spec`
5. action เป็นส่วนของ spec hash อยู่แล้ว (`specHash`) การแก้ action ใน shots.yaml จึงทำให้ `capture --changed` ถ่ายภาพนั้นใหม่เอง
6. เพิ่มแถวในตาราง action ของ `docs/reference.md` (หัวข้อ shots.yaml) แล้ว `pnpm verify`

## ผลลัพธ์ที่ได้

ผู้เขียนคู่มือใช้ action ใหม่ใน shots.yaml ได้ทันที ทั้งใน `shots`, `steps`, `clips` และ `logins`

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| ภาพไม่มีสไตล์ | CSS หรือฟอนต์จาก CDN ถูกบล็อกเพราะไม่อยู่ใน allowlist | capture ไม่ผ่านพร้อม `stylesheet blocked` ให้เพิ่ม host ใน `capture.assetHosts` (ดู [[dev.lessons]]) |
| action กดโดนแถบเครื่องมือ dev ของเฟรมเวิร์ก | overlay ของ Next.js / Vite บังปุ่ม | overlay ที่รู้จักถูกซ่อนตั้งแต่โหลดหน้า (`DEV_OVERLAYS` ใน `src/config.ts`) เพิ่มตัวใหม่ที่นั่น |
| กรอบแดงอยู่ใต้ modal | ปุ่มอยู่ใน `dialog:modal` | capture วาดกรอบเป็น popover เหนือ top layer ให้แล้ว |

## หน้าที่เกี่ยวข้อง

- [[dev.add-output]]
- [[dev.testing]]
