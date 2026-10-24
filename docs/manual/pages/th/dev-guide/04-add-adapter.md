---
id: dev.add-adapter
title: เพิ่ม adapter
audience: [developer]
book: dev-guide
kind: how-to
group: extend
summary: สอน manual-kit ให้อ่านโครงการชนิดใหม่ (หน้าจอ ป้ายบนหน้าจอ บทบาท) โดยดู adapter nextjs เป็นตัวอย่าง
routes: []
covers: []
sources: [src/adapters/types.ts, src/adapters/index.ts, src/adapters/frameworks.ts, src/adapters/generic.ts, src/config.ts, tests/frameworks.test.ts]
---
adapter คือส่วนที่อ่านโค้ดของโครงการแล้วตอบสามคำถาม: มีหน้าจอ/บทบาท/flag อะไรที่ต้องมีหน้าคู่มือ (`items`)
ป้ายบนหน้าจอแต่ละภาษาคืออะไร (`uiStrings`) และค่าข้อมูลจากไฟล์ (`data`) เพิ่ม adapter เมื่อเฟรมเวิร์กใหม่มีโครงที่ regex
ของ adapter `generic` อธิบายไม่ได้ดี เช่น router แบบไฟล์ ก่อนเขียนใหม่ ลองตั้ง `generic` ใน config ก่อนเสมอ (หลักการข้อ 1 ขี้เกียจอย่างมีวินัย)

## ก่อนเริ่ม

- อ่าน [[dev.architecture]] หัวข้อ Adapter
- มีโครงการตัวอย่างขนาดเล็กของเฟรมเวิร์กนั้น (ไม่กี่ไฟล์) สำหรับเป็น fixture

## ขั้นตอน

1. **สร้าง fixture** ใน `tests/fixtures/<ชื่อ>/` ที่มีทุกกรณีที่ต้องรองรับ เช่น `tests/fixtures/next-app` มี route group
   `(marketing)`, parallel slot `@modal`, โฟลเดอร์ private `_private`, `api/`, dynamic `[id]` และ `[...slug]`
2. **เขียนเทสต์ก่อน** (TDD) ใน `tests/frameworks.test.ts` เรียก adapter แบบที่ผู้ใช้เรียกผ่าน config:

   ```ts
   const adapter = (cfg: unknown, root: string) => createAdapter(AdapterConfig.parse(cfg), root)

   it('App Router: page files become routes; groups stripped, dynamic kept, parallel/intercepting/private ignored', () => {
     const a = adapter({ type: 'nextjs' }, fx('next-app'))
     expect(ids(a.items())).toEqual(['route:/', 'route:/about', 'route:/blog', 'route:/dashboard/[id]', 'route:/docs/[...slug]'])
     expect(a.items().find((i) => i.id === 'route:/about')).toMatchObject({ source: 'app/(marketing)/about/page.tsx' })
   })
   ```

3. **เพิ่ม schema** ใน `src/config.ts`: วัตถุ zod ที่มี `type: z.literal('<ชื่อ>')` ใส่ `...Common` (roles, flags, sections, data)
   แล้วเพิ่มเข้า `AdapterConfig` (discriminated union) และตัวเลือก `--adapter` ของ `init` ใน `src/cli.ts`
4. **เขียน adapter** อ่านไฟล์เป็นข้อความหรือ AST เท่านั้น **ห้ามรันโค้ดของโครงการ** ตัวอย่างการหา route จาก App Router:

   ```ts
   function nextRoutes(root: string): InventoryItem[] {
     const list = new ItemList()
     const app = firstDir(root, ['app', 'src/app'])
     if (app) {
       for (const rel of files(root, [`${app}/**/page.{tsx,jsx,ts,js,mdx}`])) {
         const segs = rel.slice(app.length + 1).split('/').slice(0, -1)
         // private folders (_x) are not routable; slots and intercepting routes render inside another page
         if (segs.some((s) => s.startsWith('_') || isSlotOrIntercept(s))) continue
         list.add('route', toRoute(segs), { source: rel })
       }
     }
     // ... Pages Router
     return list.list()
   }
   ```

   `ItemList` เรียงลำดับและตัดซ้ำให้ (ผลต้องเหมือนเดิมทุกครั้ง) ใส่ `source` ทุกรายการเพื่อให้ discovery และ coverage บอกที่มาได้
   ป้ายบนหน้าจอ: ถ้ามีไฟล์ i18n ใช้ไฟล์นั้น ถ้าไม่มี nextjs ใช้ TypeScript parser อ่านข้อความใน JSX (`src/adapters/literals.ts`)
   โดยให้ข้อความเป็น key ของตัวเอง หน้าคู่มือจึงอ้างแบบมีเครื่องหมายคำพูดได้
5. **ต่อเข้ากับ `baseAdapter`** ใน `src/adapters/index.ts` (เพิ่ม `case` ใหม่ TypeScript จะเตือนถ้าลืมเพราะ union ครบทุกชนิด)
   `sections` ทำงานให้ทุก adapter อยู่แล้วผ่าน `createAdapter`
6. ถ้าเฟรมเวิร์กมีสัญญาณให้เดา ให้ `discover` เสนอ adapter นี้ (ดู `src/discover.ts`) และเพิ่มแถวในตาราง Adapters ของ `docs/reference.md`
7. `pnpm verify` แล้ว commit เทสต์ + โค้ด + bundle + เอกสาร ในเรื่องเดียว

## ผลลัพธ์ที่ได้

`init --adapter <ชื่อ>` ใช้ได้ `inventory` ได้หน้าจอของโครงการ และตัวอ้างอิงป้าย (ui) ในหน้าคู่มืออ้างป้ายบนหน้าจอจริงได้
เมื่อมีคนเปลี่ยนชื่อปุ่มในโค้ด check ของโครงการนั้นจะไม่ผ่าน

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| ผล `items()` สลับลำดับระหว่างเครื่อง | วนไฟล์ตามลำดับของระบบไฟล์ | ผ่าน `ItemList` เสมอ |
| ป้ายที่มีตัวแปรปน (เช่น จำนวนรายการ) หายไป | ข้อความที่ติดกับ expression ไม่ใช่ป้ายคงที่ | ตั้งใจ: คู่มือควรอ้างป้ายคงที่ |
| โหลด typescript ไม่ได้ใน plugin | typescript ไม่ได้ bundle | โหลดผ่าน `lazyDep` / `dep` จาก `src/deps.ts` |

## หน้าที่เกี่ยวข้อง

- [[dev.add-check-rule]]
- [[dev.testing]]
