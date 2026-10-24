---
system: manual-kit
version: 0.1
updated: 2026-10-07
sources: discovery.json (generic: commands of src/cli.ts and bin/manual-kit as routes, command/option names as labels), README.md, docs/reference.md, docs/spec.md, CHANGELOG.md, plugins/manual-kit/skills/*
---

# สเปกคู่มือ: manual-kit

## 1. วัตถุประสงค์และผู้อ่าน (purpose and audience)

- **คู่มือการใช้งาน (`user-guide`)** ช่วยให้คนในทีมที่ต้องส่งคู่มือให้ลูกค้า ติดตั้ง plugin, สั่ง Claude ทำคู่มือ,
  ตรวจและส่งมอบ, ดูแลคู่มือให้ตามระบบ และเผยแพร่ขึ้น wiki ได้เอง โดยไม่ต้องรู้โครงสร้างภายใน
  (README.md §1–7)
  - ผู้อ่าน: เพื่อนร่วมทีมที่ทำคู่มือ (เคยเปิด Claude Code มาแล้ว), หัวหน้าทีมและ PM ที่อยากรู้ว่าเครื่องมือทำอะไรได้
    และต้องอนุมัติอะไร อ่านเมื่อเริ่มโครงการที่ต้องส่งคู่มือ และเมื่อจะส่งมอบ
- **คู่มือการพัฒนา (`dev-guide`)** ช่วยให้นักพัฒนาเข้าใจสถาปัตยกรรม เพิ่ม adapter, กฎตรวจ, action ถ่ายภาพ,
  ผลลัพธ์/ช่องทางเผยแพร่ ปรับธีม แก้ skill และปล่อยเวอร์ชันได้อย่างปลอดภัย (README.md "สำหรับคนพัฒนา manual-kit",
  docs/spec.md, docs/reference.md "Development")
  - ผู้อ่าน: นักพัฒนาที่เขียน TypeScript และใช้ Git เป็น อ่านก่อนแก้ repo ครั้งแรก

## 2. ภาพรวมระบบ (system overview)

manual-kit มีสองส่วน (docs/spec.md §1, §8):

- **เครื่องมือ (`manual-kit` CLI)**: งานกลไกทั้งหมด ผลเหมือนเดิมทุกครั้ง ไม่มีการเรียก AI ไม่ต้องใช้ API key
  (src/cli.ts, docs/reference.md บรรทัดแรก)
- **skill** `manual` (ขั้นตอนตั้งแต่ต้นจนจบ, โหมด spec/update/check) และ `building-product-manuals` (วิธีการและกติกา)
  ทำงานใน Claude Code และสั่งใช้เครื่องมือ (plugins/manual-kit/skills/manual/SKILL.md,
  plugins/manual-kit/skills/building-product-manuals/SKILL.md)

แจกจ่ายเป็น Claude Code plugin: repo นี้คือ marketplace `manual-kit` ที่มี plugin `manual-kit`
(.claude-plugin/marketplace.json) plugin มี CLI แบบ bundle ไฟล์เดียว (plugins/manual-kit/dist/manual-kit.mjs),
ตัวเรียก `bin/manual-kit` (คำสั่งย่อย `setup`, `doctor`), hook SessionStart ที่ติดตั้ง playwright, pagedjs,
typescript และ Chromium ลงโฟลเดอร์ข้อมูลของ plugin (plugins/manual-kit/hooks/hooks.json, plugins/manual-kit/scripts/setup.sh,
plugins/manual-kit/scripts/env.sh, plugins/manual-kit/runtime/package.json, CHANGELOG.md "Claude Code plugin")

ผลลัพธ์: PDF ทางการ, DOCX ที่ภาษาไทยถูกต้องใน Word, เว็บคู่มือ static (แถบบนสีแบรนด์ เมนูซ้าย "ในหน้านี้" ค้นหา ⌘K), เอกสารใน Outline wiki
(docs/reference.md "Output"; src/build/*.ts; src/publish/outline.ts)

## 3. ผู้ใช้และบทบาท (actors and roles)

ระบบไม่มีบัญชีผู้ใช้หรือสิทธิ์ (discovery: 0 roles, 0 permissions) บทบาทในการทำงาน:

| บทบาท | ทำอะไรได้ | สิทธิ์ | หลักฐาน |
|---|---|---|---|
| ผู้ขอคู่มือ (คนในทีม) | สั่ง `/manual`, อ่านสเปก, อ่านทวน, กรอก (รอระบุ), **รับรองหน้า** (`sign`) | เข้าถึง repo manual-kit ได้ | README.md §1, §5 |
| Claude (เอเจนต์) | ทำทุกขั้นตอนตามสกิล **ยกเว้นการรับรอง** | ตามที่ Claude Code อนุญาต (`allowed-tools: Bash(manual-kit:*)`) | plugins/manual-kit/skills/manual/SKILL.md, docs/reference.md "Signing" |
| CI (GitLab/GitHub) | รัน `check --allow-unsigned` ใน merge request | อ่านอย่างเดียว | src/init.ts (`GITLAB_JOB`, `CI_WORKFLOW`) |
| นักพัฒนา manual-kit | แก้ src/, skill, ปล่อยเวอร์ชัน | push repo | README.md "สำหรับคนพัฒนา manual-kit" |

## 4. รายการความสามารถ (feature inventory)

| # | ความสามารถ | ทำอะไร | ใครใช้ | คำสั่ง (route) | หลักฐาน |
|---|---|---|---|---|---|
| F1 | ติดตั้ง plugin | marketplace add + install, ติดตั้ง runtime ครั้งแรก, `doctor` บอกที่อยู่และเครื่องมือเสริม | ทีม | `setup`, `doctor` | README.md §1, plugins/manual-kit/bin/manual-kit |
| F2 | ทำคู่มือใหม่ด้วย `/manual` | อ่าน repo → discover → สเปก → init → รันระบบ → หน้า → ถ่ายภาพ → check → build → ดูผล → รายงาน | ทีม | `/manual` (skill `manual`) | plugins/manual-kit/skills/manual/SKILL.md |
| F3 | สแกนหลักฐาน | เอกสาร หน้าจอ บทบาท สถานะ ฟอร์ม ข้อความ API flag env → discovery.json/md | Claude | `discover` | src/discover.ts |
| F4 | สร้างโครงคู่มือ | config, shots.yaml, โฟลเดอร์เล่ม, งาน CI | Claude | `init` | src/init.ts |
| F5 | รายการที่ต้องมีหน้า | coverage.yaml จาก adapter | Claude | `inventory` | src/inventory.ts, src/coverage.ts |
| F6 | หน้าใหม่ตามชนิด | how-to / reference / concept | Claude | `new-page` | src/cli.ts, src/how-to.ts |
| F7 | ภาพหน้าจอ ภาพทีละขั้น คลิป | Playwright, allowlist, highlight, mask, terminal transcript, วิดีโอสำเร็จรูป | Claude | `shotlist`, `capture`, `encode` | src/capture.ts, src/encode.ts, src/terminal.ts, src/shots.ts |
| F8 | ตรวจ | กฎทั้งหมด exit 1 เมื่อผิด, `--docx` ตรวจไฟล์ Word | Claude, CI | `check` | src/check.ts, src/verify-docx.ts |
| F9 | รับรอง | บันทึก hash หน้าและ sources | คนเท่านั้น | `sign` | src/sign.ts, src/lock.ts |
| F10 | ออกไฟล์ | PDF, DOCX (+finalize), เว็บ | Claude | `build` | src/build/*.ts |
| F11 | ดูผล | ภาพเต็มหน้าที่หลายความกว้าง, เว็บในเครื่อง | Claude, ทีม | `snap`, `preview` | src/snap.ts, src/preview.ts |
| F12 | เผยแพร่ขึ้น wiki | Outline: เอกสารต่อเล่มและต่อหน้า, ไฟล์แนบ, outline.json, `--dry-run` | ทีม | `publish`, `outline` | src/publish/outline.ts |
| F13 | ตามระบบเมื่อโค้ดเปลี่ยน | `/manual update`, `/manual check`, CI | ทีม, CI | `/manual update`, `check` | plugins/manual-kit/skills/manual/SKILL.md, src/init.ts |

## 5. ขั้นตอนการทำงานตั้งแต่ต้นจนจบ (end-to-end workflows)

### 5.1 ทำคู่มือใหม่และส่งมอบ
- ผู้เกี่ยวข้อง: คนในทีม, Claude
- เริ่มเมื่อ: พิมพ์ `/manual <คำขอ>` ในโฟลเดอร์โครงการ · จบเมื่อ: ส่ง PDF/DOCX ที่รับรองแล้วให้ลูกค้า
- ขั้นตอน (plugins/manual-kit/skills/manual/SKILL.md "New manual" 1–12, README.md "Claude จะทำอะไรบ้าง"):
  1. Claude อ่าน README/CLAUDE.md → `discover` → เขียน `manual/manual-spec.md` → สรุปให้ดู
  2. `init` → `inventory` → รันระบบในเครื่องด้วยข้อมูลสมมติ → `new-page` → เขียนหน้า
  3. `capture` (+ `encode`) → `check --allow-unsigned` จนไม่มี error → `build` → เปิดดูผล → ปิดสิ่งที่เปิดไว้ → รายงาน
  4. คนอ่านทุกหน้า กรอก (รอระบุ) → `! manual-kit sign --all` → เปิด DOCX ใน Word จริงหนึ่งครั้ง → ส่งลูกค้า (README.md §5)
- สถานะของหน้า: ยังไม่รับรอง → รับรองแล้ว → เปลี่ยนหลังรับรอง (กลับไปต้องรับรองใหม่) (src/check.ts rule `signature`, src/lock.ts)

### 5.2 ดูแลคู่มือเมื่อระบบเปลี่ยน
- `/manual update`: discover ใหม่ → `git diff manual/discovery.json` → แก้สเปก → แก้เฉพาะหน้าที่ check ชี้ → `capture --changed` → build → คนรับรองใหม่ (SKILL.md "update")
- `/manual check`: รายงานอย่างเดียว ไม่แก้อะไร (SKILL.md "check")
- CI: `init --ci gitlab` เขียน `.gitlab/ci/manual-check.gitlab-ci.yml` ติดตั้งจาก `MANUAL_KIT_SPEC` ที่ตรึง commit แล้วรัน `check --allow-unsigned` (src/init.ts `GITLAB_JOB`, docs/reference.md "CI")
- สถานะ coverage: `mapped` / `unmapped` / `manual-later` / `ignored` / `removed` (docs/reference.md "Coverage", src/coverage.ts)

### 5.3 เผยแพร่ขึ้น wiki
- `build pdf docx` ก่อน → `publish outline --dry-run` ดูแผน → `OUTLINE_API_KEY=... manual-kit publish outline --collection <id>` → commit `manual/outline.json` (docs/reference.md "Outline wiki", src/publish/outline.ts)

### 5.4 พัฒนา manual-kit
- แก้ src/ ด้วย TDD → `pnpm verify` (typecheck + bundle + test + build) → commit bundle → push → ทีม `claude plugin update manual-kit@manual-kit` (package.json scripts, scripts/bundle-plugin.mjs, tests/plugin-bundle.test.ts, README.md "อัปเดต plugin")

## 6. กฎทางธุรกิจและการตรวจสอบข้อมูล (business rules and validations)

| กฎ | ใช้ที่ไหน | หลักฐาน |
|---|---|---|
| คนเท่านั้นที่รับรอง Claude/CI ไม่รัน `sign` | ทุกโครงการ | docs/reference.md "Signing", SKILL.md §6 |
| ถ่ายภาพเฉพาะ host ใน `capture.allowlist` (ค่าเริ่มต้น localhost, 127.0.0.1) ห้าม production/ข้อมูลจริง | capture | src/capture.ts:273–284, building-product-manuals §5 |
| รหัสผ่านจาก `{env:NAME}` เท่านั้น ห้ามอยู่ในไฟล์ | shots.yaml | src/capture.ts:57 |
| ไม่ใช้คำโอ้อวด (ดีที่สุด, อันดับ 1, best...) | check rule `wording` | src/check.ts `SUPERLATIVES` |
| ชื่อปุ่ม/ป้ายผ่าน `{{ui:...}}` เท่านั้น | check rule `ui` | docs/reference.md "Page tokens" |
| how-to มี 5 หัวข้อตามลำดับ | check rule `structure` (เตือน) | src/how-to.ts |
| ไม่ใช้ Microsoft Word อัตโนมัติ เว้นแต่ `--finalize word` | build docx | src/build/finalize.ts:44 |
| API key ของ Outline จาก `OUTLINE_API_KEY` เท่านั้น ไม่เขียนลงไฟล์ | publish outline | src/publish/outline.ts:128 |
| CI ติดตั้ง manual-kit จาก tarball + SHA256 หรือ git + commit SHA 40 ตัวเท่านั้น | CI | src/init.ts `GITLAB_JOB` |
| Node 22.17 ขึ้นไป (CLI และ plugin; พัฒนา repo 22.18 ขึ้นไป) | bin/manual-kit | plugins/manual-kit/scripts/env.sh `mk_check_node` |

## 7. ข้อความแจ้งเตือนที่ผู้ใช้อาจพบ (messages users can meet)

| ข้อความ | เกิดเมื่อ | ผู้ใช้ควรทำอย่างไร | หลักฐาน |
|---|---|---|---|
| `... has not been signed (a person reads it, then runs "manual-kit sign ...")` | หน้ายังไม่รับรอง | อ่านหน้า แล้ว `sign` | src/check.ts |
| `... changed since it was signed (sources changed: ...)` | โค้ดที่หน้าอ้างเปลี่ยน | แก้หน้า อ่านทวน รับรองใหม่ | src/check.ts |
| `shot "..." not captured yet` | ยังไม่ถ่ายภาพ | `capture` | src/check.ts |
| `<host> is not in capture.allowlist` | baseUrl/URL นอก allowlist | ใช้ระบบในเครื่องหรือ staging ที่อนุญาต | src/capture.ts:273 |
| `stylesheet blocked (...); add the host to capture.assetHosts` | CSS จาก CDN ถูกบล็อก | เพิ่ม host ใน `capture.assetHosts` | src/capture.ts:432 |
| `set the Outline API key in the environment variable OUTLINE_API_KEY` | publish โดยไม่มี key | ตั้งตัวแปรสภาพแวดล้อม | src/publish/outline.ts:128 |
| `outline.json belongs to ...` | เปลี่ยน wiki/collection | ย้ายไฟล์ออกก่อน | src/publish/outline.ts:130–132 |
| `ffmpeg not found` / `clips need media level "steps+video"` | ทำคลิป | ติดตั้ง ffmpeg / ตั้ง media | src/encode.ts:132–133 |
| `manual-kit: Node.js 22.17 or newer is needed` | Node เก่า | `brew upgrade node` | plugins/manual-kit/scripts/env.sh |
| `package "..." is not installed ...` | runtime ยังไม่ติดตั้ง | `manual-kit setup` | src/deps.ts:16 |

## 8. ระบบภายนอกและข้อจำกัด (integrations and limits)

- marketplace คือ repo git ของ manual-kit, Outline wiki ตามที่ตั้งใน `outline.baseUrl` (ไม่มีค่าเริ่มต้น) (src/config.ts, src/publish/outline.ts)
- โปรแกรมเสริม: pandoc (DOCX), ffmpeg (คลิป), LibreOffice (เลขหน้าสารบัญ DOCX, ไม่บังคับ) (SKILL.md "Ask only for...")
- ไม่มี feature flag (discovery: 0 flags)
- ตัวแปรสภาพแวดล้อม: `OUTLINE_API_KEY`, `MANUAL_KIT_HOME`, `FFMPEG`, `FFPROBE`, `MANUAL_KIT_SOFFICE` (discovery.md "Environment names", docs/reference.md)

## 9. ข้อมูลที่ผู้ใช้จัดการ (data the user handles)

- ข้อมูลเอกสาร (ลูกค้า เลขที่ ผู้อนุมัติ) ใน `manual.config.yaml` → ไม่รู้ให้เป็น `(รอระบุ)` (docs/reference.md "manual.config.yaml")
- ข้อมูลทดสอบ: ชื่อสมมติ อีเมล example.com ห้ามข้อมูลจริง (building-product-manuals §5)
- ความลับ: รหัสผ่านทดสอบ, `OUTLINE_API_KEY` อยู่ใน environment เท่านั้น

## 10. แผนคู่มือ (manual plan)

### เล่ม (books)
| เล่ม (folder) | ชื่อเล่ม | ผู้อ่าน |
|---|---|---|
| user-guide | คู่มือการใช้งาน | ทีมที่ทำคู่มือ, หัวหน้าทีม/PM |
| dev-guide | คู่มือการพัฒนา | นักพัฒนา manual-kit |

### บทและหน้า (chapters and pages)
| page id | ชื่อหน้า | ชนิด | ผู้อ่าน | routes / sources | ครอบคลุม |
|---|---|---|---|---|---|
| use.about | manual-kit คืออะไรและทำอะไรได้ | concept | team, lead | README.md, docs/spec.md | F1–F13 ภาพรวม, วิดีโอ |
| use.install | ติดตั้ง plugin | how-to | team | setup, doctor | F1 |
| use.new-manual | ทำคู่มือใหม่ด้วย /manual | how-to | team | discover, init, inventory, new-page, capture, encode, build | F2–F7, F10, 5.1 |
| use.spec | อ่านและแก้สเปกคู่มือ | how-to | team, lead | discover | F3, /manual spec |
| use.deliver | ส่งมอบให้ลูกค้า | how-to | team, lead | sign, snap, preview | F9, F11, 5.1 ข้อ 4 |
| use.keep-current | ทำให้คู่มือตามระบบ | how-to | team, lead | check, shotlist | F8, F13, 5.2 |
| use.publish-wiki | เผยแพร่ขึ้น Outline wiki | how-to | team | publish, outline | F12, 5.3 |
| use.options | ตัวเลือกของคู่มือ | reference | team, lead | (config) | ภาษา เล่ม สื่อ ข้อมูลเอกสาร แม่แบบลูกค้า |
| use.troubleshooting | ปัญหาที่พบบ่อย | reference | team | doctor, setup | ข้อ 7 |
| use.commands | ภาคผนวก: คำสั่งและกติกา | reference | team | ทุกคำสั่ง | coverage ทุกคำสั่ง, ข้อ 6 |
| dev.architecture | สถาปัตยกรรม | concept | developer | src/cli.ts, docs/spec.md | 2, 5.4 |
| dev.repo-layout | โครงสร้าง repo | reference | developer | ทุกโฟลเดอร์ | |
| dev.setup | ตั้งเครื่องสำหรับพัฒนา | how-to | developer | package.json, scripts/bundle-plugin.mjs | 5.4 |
| dev.add-adapter | เพิ่ม adapter | how-to | developer | src/adapters/* | |
| dev.add-check-rule | เพิ่มกฎตรวจ | how-to | developer | src/check.ts, src/how-to.ts | |
| dev.add-capture-action | เพิ่ม action ถ่ายภาพ | how-to | developer | src/shots.ts, src/capture.ts | |
| dev.add-output | เพิ่มผลลัพธ์หรือช่องทางเผยแพร่ | how-to | developer | src/publish/outline.ts, src/render.ts | |
| dev.themes | ธีม PDF/DOCX/เว็บ และกฎ DOCX ภาษาไทย | reference | developer | src/build/*.ts | |
| dev.skills | แก้และทดสอบ skill | how-to | developer | plugins/manual-kit/skills/* | |
| dev.testing | กลยุทธ์การทดสอบ | concept | developer | tests/* | |
| dev.release | การปล่อยเวอร์ชันและกติกาการทำงาน | how-to | developer | CHANGELOG.md, docs/engineering-principles.md | 5.4 |
| dev.lessons | บทเรียนที่ได้ | reference | developer | ตาม commit | |

### สื่อประกอบ (media plan)
| page id | shot / steps / clip | หน้าจอ | หมายเหตุ |
|---|---|---|---|
| use.about | shot `out-pdf`, `out-web` | หน้า PDF, เว็บ | จากคู่มือเล่มนี้เอง |
| use.install | steps `install` | terminal จริง (CLAUDE_CONFIG_DIR ชั่วคราว) | ไม่ใช้ config จริงของเจ้าของ |
| use.new-manual | steps `new-manual` | terminal | ตัวอย่าง (เรียบเรียงจากคำสั่งจริง) |
| use.deliver | shot `sign`, `out-web-mobile` | terminal จริงบน fixture, เว็บบนมือถือ | sign บนสำเนา fixture ไม่ใช่คู่มือนี้ |
| use.keep-current | shot `check-drift` | terminal จริงบน fixture | |
| use.publish-wiki | shot `publish-dry-run` | terminal จริงของคู่มือนี้ | ไม่ publish จริง |
| use.options | shot `out-web-search`, `out-steps` | เว็บของคู่มือเล่มนี้ | |
| use.troubleshooting | shot `check-errors` | terminal จริงบน fixture | |
| dev.setup | shot `verify` | terminal จริง (`pnpm verify`) | |

### การครอบคลุม (coverage mapping)
| รายการจาก discovery | หน้า | หมายเหตุ |
|---|---|---|
| route:setup, route:doctor | use.install, use.troubleshooting | คำสั่งของตัวเรียก plugin |
| route:discover, init, inventory, new-page, capture, encode, build | use.new-manual | |
| route:check, shotlist | use.keep-current | |
| route:sign, snap, preview | use.deliver | |
| route:publish, outline | use.publish-wiki | |
| ทุก route | use.commands | ภาคผนวก |

## 11. คำถามที่ต้องยืนยัน (to confirm)
- [ ] (รอระบุ) เลขที่เอกสาร ระดับชั้นความลับ ผู้อนุมัติ และช่องทางติดต่อผู้ดูแล manual-kit (manual.config.yaml `document`)
- [ ] (รอระบุ) จะปล่อยเวอร์ชันแบบมีเลข (tag) หรือให้ทีมใช้ commit ล่าสุดของ main ตลอด (ตอนนี้ plugin ใช้ commit เป็นเวอร์ชัน: `claude plugin list` แสดง `Version: 06f97978c290`)
- [ ] (รอระบุ) แม่แบบของลูกค้า (DOCX reference / CSS) ใครเป็นคนทำ เมื่อไร (docs/spec.md §2 "ทำทีหลัง")

## 12. ปัญหาของระบบที่พบระหว่างทำคู่มือ (product issues found)
- `discover` นับบรรทัดคอมเมนต์ในโค้ดบล็อก (`# ...` ใน ```bash) เป็นหัวข้อเอกสาร: README.md และ docs/reference.md
  ได้หัวข้อปลอมเช่น "--books user-guide,admin-guide ..." และ "a person reads every page, then: manual-kit sign --all" (discovery.md) — แก้แล้ว: ข้ามบรรทัดในโค้ดบล็อก
- Node ที่ต้องใช้ไม่ตรงกัน: README.md และ env.sh บอก 22 ขึ้นไป, docs/reference.md บอก Node 24, package.json `engines: >=24`
  (สำหรับนักพัฒนา 24 สำหรับ plugin 22 ควรเขียนให้ชัด) — แก้แล้ว: ขั้นต่ำ 22.17 ทุกที่ (ทดสอบ bundle บน Node 22.17)
- `Rule` ใน src/check.ts มี `'book'` ซ้ำสองครั้ง (ไม่กระทบการทำงาน)
- `manual-kit doctor` มีเฉพาะในตัวเรียก plugin (`bin/manual-kit`) ไม่มีใน `dist/cli.js` คนที่รันจาก repo จะได้ `unknown command 'doctor'`
- `init` ตั้ง `projectRoot: ..` เสมอ เมื่อคู่มืออยู่ลึกกว่าหนึ่งชั้น (`-m docs/manual`) ต้องแก้เป็น `../..` เอง และ `discover`
  ก่อน `init` จะสแกนโฟลเดอร์แม่ของคู่มือ (docs/) แทนทั้ง repo — แก้แล้ว
- `init` ใส่ `dist/` ใน `manual/.gitignore` แต่ README.md §4 บอกให้ commit ผลลัพธ์ใน `manual/dist/` (ขัดกัน) — แก้แล้ว

## 13. นอกขอบเขต (out of scope)
- การใช้งานระบบของลูกค้าแต่ละโครงการ: เป็นเนื้อหาของคู่มือที่ manual-kit สร้าง ไม่ใช่ของคู่มือนี้
- `--finalize word`: กล่าวถึงเป็นคำเตือนเท่านั้น ไม่สอนให้ใช้ (กฎ "ไม่ใช้ Word อัตโนมัติ")
