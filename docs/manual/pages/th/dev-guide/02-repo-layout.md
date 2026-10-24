---
id: dev.repo-layout
title: โครงสร้าง repo
audience: [developer]
book: dev-guide
kind: reference
group: design
summary: แต่ละโฟลเดอร์ของ repo มีหน้าที่อะไร ไฟล์ไหนสร้างจากไฟล์ไหน และไฟล์ไหนต้อง commit
routes: []
covers: []
sources: [package.json, .gitignore, .claude-plugin/marketplace.json, scripts/bundle-plugin.mjs, plugins/manual-kit/hooks/hooks.json, plugins/manual-kit/runtime/package.json, tools/demo/README.md]
---
repo เดียวทำสามหน้าที่: เป็นซอร์สของเครื่องมือ เป็น marketplace ของ Claude Code และเป็นตัว plugin ที่ทีมติดตั้ง
ตารางด้านล่างบอกว่าโฟลเดอร์ไหนแก้มือ โฟลเดอร์ไหนสร้างจากสคริปต์ (แก้มือแล้วจะถูกเขียนทับ)

## ระดับบนสุด

| ที่อยู่ | คืออะไร | แก้มือ? |
|---|---|---|
| `src/` | ซอร์ส TypeScript ของ CLI ทั้งหมด (ESM, Node 22.18 ขึ้นไปรัน `.ts` ได้ตรง) | ใช่ |
| `assets/` | ฟอนต์ Sarabun (OFL), `pdf.css`, ธีมเว็บ `web/site.css` + `site.js`, `libreoffice/finalize.py` | ใช่ |
| `templates/pages/` | แม่แบบหน้า concept / reference ต่อภาษา (how-to มาจาก `src/how-to.ts`) | ใช่ |
| `tests/` | เทสต์ vitest, `fixtures/` โครงการตัวอย่าง, `helpers/` | ใช่ |
| `scripts/bundle-plugin.mjs` | สร้างสำเนาของ plugin จากซอร์ส | ใช่ |
| `.claude-plugin/marketplace.json` | ประกาศ marketplace `manual-kit` ที่มี plugin `manual-kit` | ใช่ |
| `plugins/manual-kit/` | ตัว plugin (ดูตารางถัดไป) | บางส่วน |
| `docs/` | `reference.md` (คู่มืออ้างอิงคำสั่ง), `spec.md` (สเปกการออกแบบ), `examples/`, `images/`, `media/` (วิดีโอแนะนำ), `manual/` (คู่มือเล่มนี้), `engineering-principles.md` | ใช่ |
| `dist/` | ผลของ `pnpm build` (tsc) สำหรับรันจาก repo | ไม่ (ignore) |

## ภายใน `plugins/manual-kit/`

| ที่อยู่ | คืออะไร | มาจาก |
|---|---|---|
| `dist/manual-kit.mjs` | CLI ไฟล์เดียว bundle ด้วย esbuild (target node22) | `pnpm bundle` **commit ด้วย** |
| `assets/`, `templates/` | สำเนาจากระดับบน | `pnpm bundle` |
| `runtime/package.json` (+ lock) | แพ็กเกจที่ไม่ bundle: playwright, pagedjs, typescript รุ่นที่ตรงกับ `node_modules` | `pnpm bundle` |
| `bin/manual-kit` | ตัวเรียก bash: `setup`, `doctor`, แล้วรัน bundle | แก้มือ |
| `scripts/env.sh`, `scripts/setup.sh` | หาโฟลเดอร์ข้อมูล (`MANUAL_KIT_HOME`), ตรวจ Node, ติดตั้ง runtime และ Chromium | แก้มือ |
| `hooks/hooks.json` | SessionStart: รัน `setup.sh --background` ตอนเปิด Claude Code | แก้มือ |
| `skills/manual/SKILL.md` | คำสั่ง `/manual` (ขั้นตอน) | แก้มือ |
| `skills/building-product-manuals/` | `SKILL.md` (กติกา), `spec-template.md`, `reference.md` | `reference.md` คัดลอกจาก `docs/reference.md` โดย `pnpm bundle` |

ทำไม bundle ต้อง commit: ทีมติดตั้ง plugin ด้วยการ clone repo ไม่มีขั้น build บนเครื่องของเพื่อนร่วมทีม
ไฟล์ที่รันได้จึงต้องอยู่ใน git เทสต์ `tests/plugin-bundle.test.ts` สร้าง bundle ใหม่แล้วเทียบกับที่ commit ไว้
ถ้าแก้ `src/` แล้วลืม `pnpm bundle` เทสต์จะไม่ผ่าน

## โฟลเดอร์ข้อมูลของ plugin

แพ็กเกจ runtime และ Chromium อยู่นอก plugin ที่ `~/.claude/plugins/data/manual-kit-manual-kit` (หรือ `MANUAL_KIT_HOME`)
จึงไม่ต้องติดตั้งใหม่ทุกครั้งที่อัปเดต plugin `src/deps.ts` โหลดแพ็กเกจเหล่านี้จากที่นั่นเมื่อใช้ครั้งแรก
คำสั่งที่ไม่ต้องใช้ (เช่น `--version`, `check`) จึงรันได้แม้ยังไม่ติดตั้ง

## หน้าที่เกี่ยวข้อง

- [[dev.architecture]]
- [[dev.setup]]
- [[dev.release]]
