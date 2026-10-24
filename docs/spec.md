# manual-kit — Design spec

- วันที่: 2026-10-05 · สถานะ: v0 (ผู้ตัดสินใจ: เจ้าของโครงการ)
- ที่มา: วิธีทำคู่มือต้นแบบภายใน + ผลทดสอบเอเจนต์ที่ไม่มี skill (2026-10-05)

## 1. เป้าหมาย

เครื่องมือให้ **ทุกโครงการ** สร้างและดูแล **คู่มือการใช้งานระบบแบบทางการสำหรับส่งมอบลูกค้า** ได้ โดยคู่มือ:
- ตรงกับระบบจริงเสมอ (ตรวจอัตโนมัติใน CI เมื่อโค้ดเปลี่ยน)
- มีภาพจากระบบจริง (ถ่ายด้วยสคริปต์)
- ส่งออกเป็น **PDF และ/หรือ Word (DOCX)**; เว็บ, ภาพทีละขั้น, วิดีโอ เป็นตัวเลือก

แบ่งเป็นสองส่วน:
- **`manual-kit` (tool):** งานกลไกทั้งหมด ผลเหมือนเดิมทุกครั้ง **ไม่มีการเรียก AI และไม่ต้องใช้ API key**
- **skill `building-product-manuals`:** งานที่ต้องใช้วิจารณญาณ (คนอ่าน, โครงเล่ม, เขียนเนื้อหา) ทำงานใน Claude Code และสั่งใช้ `manual-kit`

## 2. การตัดสินใจของเจ้าของ

| เรื่อง | ตัดสินใจ |
|---|---|
| รูปแบบ | tool + skill |
| การใช้หลัก | คู่มือทางการส่งมอบลูกค้า |
| ส่งออก | PDF และ/หรือ DOCX ต่อโครงการ; เว็บ/วิดีโอเป็นตัวเลือก |
| แม่แบบ/ดีไซน์ | **ต่อโครงการ ทำทีหลัง**: tool มีแม่แบบกลางเรียบ ๆ + รับแม่แบบของโครงการ (DOCX reference, HTML/CSS) |
| AI | ไม่อยู่ใน tool; การเขียนเนื้อหาเป็นหน้าที่ของ skill/คน |

## 3. โครงในโครงการที่ใช้

```
manual/
  manual.config.ts        ข้อมูลเอกสาร (ลูกค้า โครงการ เลขที่ เวอร์ชัน ผู้อนุมัติ), ภาษา, ผลลัพธ์, ระดับสื่อ, adapter
  pages/<lang>/<book>/NN-slug.md      หน้าเนื้อหา (Markdown + front matter)
  shots.yaml              สเปกภาพ/ขั้นตอน/คลิป
  coverage.yaml           แผนผังสิ่งที่ต้องมีคู่มือ → หน้า (สร้างโดย inventory, คนแก้ mapping)
  manual.lock.json        ลายเซ็นการรับรอง (hash ของ sources ต่อหน้า)
  templates/              (ไม่บังคับ) reference.docx, pdf.css/pdf.html ของโครงการ
  media/                  ผลถ่ายภาพ/คลิป (สร้างโดย tool)
```

### หน้าเนื้อหา
```markdown
---
id: teacher.create-class
title: สร้างห้องเรียน
audience: [teacher]
book: user-guide            # เล่ม (เช่น user-guide / admin-guide)
kind: how-to                # how-to | reference | concept
routes: [/teacher]
sources: [src/portal/teacher-console.ts]
---
กด {{ui:portal.cc.submit}} เพื่อ...
{{shot:class-ready}}
{{steps:teacher-create-class}}
```
- `{{ui:key}}` แทนด้วยข้อความจริงของแอปตามภาษา (ไม่พิมพ์ชื่อปุ่มเอง)
- `{{shot:id}}`, `{{steps:id}}`, `{{clip:id}}` อ้างสเปกใน `shots.yaml`
- `{{data:key}}` ค่าจากโค้ด/ไฟล์ข้อมูลผ่าน adapter (ไม่คัดลอกตารางด้วยมือ)

## 4. คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `manual-kit init` | สร้างโครง `manual/`, config, ตัวอย่างหน้า, ใส่ `check` ใน CI (แนะนำ) |
| `manual-kit inventory` | ใช้ adapter อ่านโค้ด → รายการหน้าจอ/route, สิทธิ์/บทบาท, ข้อความ UI, feature flag → อัปเดต `coverage.yaml` (เพิ่มของใหม่เป็น `unmapped`, ทำเครื่องหมายของที่หายไป) |
| `manual-kit check` | (CI) โครง front matter, ลิงก์, `{{ui}}` มีจริงทุกภาษา, คู่ภาษามีโครงตรงกัน, coverage ครบ, **sources เปลี่ยนตั้งแต่รับรองล่าสุด**, สเปกภาพครบ/ภาพค้างถ่าย, กฎคำ (config: คำต้องห้าม, superlatives) — exit code ≠ 0 เมื่อผิด, `--json` สำหรับบอทคอมเมนต์ PR |
| `manual-kit sign <page...>` | รับรองหน้า (บันทึก hash ของ sources ลง lock) หลังคนอ่านทวน |
| `manual-kit new-page <id>` | สร้างหน้าจากแม่แบบตาม `kind` |
| `manual-kit shotlist` | สร้างรายการถ่ายภาพ (Markdown) จากสเปก |
| `manual-kit capture [--changed]` | Playwright: ภาพหน้าจอ, ภาพทีละขั้นพร้อมกรอบชี้, คลิป; รันกับ URL ที่ config อนุญาตเท่านั้น; seed บัญชีทดสอบผ่าน hook ของโครงการ; ปิดบังข้อมูลตามสเปก; `--changed` ถ่ายเฉพาะที่กระทบ |
| `manual-kit encode` | คลิป → MP4/WebP + คำบรรยายบนภาพ + เพลงต้นฉบับ (ffmpeg); ไม่มีเสียงพากย์โดยค่าเริ่มต้น |
| `manual-kit build pdf\|docx\|web` | ประกอบเอกสาร: front matter ทางการ + เนื้อหา + ภาพ → ไฟล์ส่งมอบ |
| `manual-kit preview` | เปิดดูผลลัพธ์ในเครื่อง |

## 5. Adapter (อ่านโค้ดของแต่ละชนิดโครงการ)
อินเทอร์เฟซเดียว: `routes()`, `roles()`, `uiStrings(lang)`, `flags()`, `data(key)` ไม่รันโค้ดของแอป (อ่านด้วย parser)
- v0: **generic** (กำหนด glob/regex ใน config) + **json-i18n** (vue-i18n / i18next / ไฟล์ JSON) + adapter เฉพาะโครงการ 1 ตัว (ถูกลบภายหลัง)
- เพิ่มแล้ว: **nextjs** (App Router + Pages Router) และ **nuxt** (`pages/**/*.vue` + i18n) อ่านข้อความ UI จาก JSX/template ด้วย parser เมื่อไม่มีไฟล์ i18n; `sections:` ทำให้ส่วนย่อยในหน้า (ขั้นตอน ลิ้นชัก modal) เป็นรายการ coverage
- เพิ่มแล้ว: **react-spa** (Vite + React Router / wouter / TanStack Router) อ่าน route จาก `<Route path>`, route object (`createBrowserRouter`, `useRoutes`) และ file route ของ TanStack ด้วย TypeScript parser พร้อมไฟล์และบรรทัดที่ประกาศ; ข้อความ UI แบบเดียวกับ nextjs
- ภายหลัง: Laravel/Django routes

## 6. เอกสารส่งมอบ (build)
ส่วนหน้าแบบทางการสร้างจาก config: ปก, ข้อมูลเอกสาร (เลขที่ เวอร์ชัน วันที่ ระดับชั้นความลับ), ประวัติการแก้ไข (จาก git tag/changelog หรือ config), หน้าอนุมัติ/ลงนามรับ, สารบัญ/สารบัญภาพ/สารบัญตาราง, บทนำ (วัตถุประสงค์ ขอบเขต กลุ่มผู้ใช้ คำศัพท์), ภาคผนวก (ข้อความ error, FAQ, ติดต่อ) — แต่ละส่วนเปิด/ปิดได้ใน config

- **DOCX:** pandoc + `--reference-doc` (แม่แบบของโครงการ หรือแม่แบบกลาง) เลขหัวข้อ 1/1.1/1.1.1 คำบรรยายภาพ "ภาพที่ n-m"
- **PDF:** HTML + CSS พิมพ์ (Playwright `page.pdf`) ฟอนต์ไทย, หัว-ท้ายกระดาษ "หน้า X จาก Y", ไม่ตัดภาพข้ามหน้า; วิดีโอแทนด้วยภาพปก + QR (ถ้ามีเว็บ)
- **web:** เว็บ static มีค้นหา (ตัวเลือก)
- อ้างอิงโครงตามแนวมาตรฐานเอกสารผู้ใช้ ISO/IEC/IEEE 26514 (ตรวจเนื้อหามาตรฐานก่อนอ้างในเอกสารลูกค้า)

## 7. การดูแลเมื่อระบบเปลี่ยน
1. PR แก้โค้ด → `check` ใน CI: หน้าที่ sources เปลี่ยน, `{{ui}}` ที่หายไป, หน้าจอ/สิทธิ์ใหม่ที่ไม่มีหน้า → fail พร้อมรายการ
2. คน/เอเจนต์แก้เฉพาะหน้าที่ถูกชี้ → `capture --changed` → `sign` → ผ่าน
3. ป้าย `manual-later` ให้ผ่านชั่วคราวได้ แต่ `check` รายงานค้างเสมอ

## 8. หลักออกแบบ
- ไม่มี AI ใน tool; ทุกคำสั่งทำซ้ำได้ (idempotent) ผลเหมือนเดิม
- ห้ามถ่ายภาพจากระบบที่มีข้อมูลจริง: capture รันได้เฉพาะ URL ใน allowlist ของ config (ค่าเริ่มต้น localhost/staging)
- ข้อความภาษาไทยเป็นภาษาหลัก ภาษาอื่นเป็นคู่ที่มีโครงเดียวกัน
- โครงการเลือกเปิดเฉพาะส่วนที่ต้องการ (เช่น PDF อย่างเดียว ไม่มีภาพ)

## 9. ขอบเขต v0
`init`, `inventory` (generic + json-i18n + adapter เฉพาะโครงการ), `check`, `sign`, `new-page`, `shotlist`, `capture` (ภาพหน้าจอ + ภาพทีละขั้น), `build pdf`, `build docx`, แม่แบบกลาง 1 แบบ — ทดสอบจริงกับระบบภายในหนึ่งระบบ (สร้างคู่มือ 2–3 หน้าจนได้ PDF + DOCX)

ภายหลัง: `encode` + คลิป, `build web`, adapter Nuxt/Next, บอทคอมเมนต์ PR, ธีมเพิ่ม
