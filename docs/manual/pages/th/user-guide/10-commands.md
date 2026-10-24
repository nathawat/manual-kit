---
id: use.commands
title: "ภาคผนวก: คำสั่งและกติกา"
audience: [team, lead]
book: user-guide
kind: reference
group: reference
summary: คำสั่งทั้งหมดของ /manual และ manual-kit ในที่เดียว พร้อมกติกาที่ทุกโครงการต้องทำตาม
routes: [init, discover, inventory, check, sign, new-page, build, shotlist, capture, encode, snap, publish, outline, preview, setup, doctor]
covers: []
sources: [src/cli.ts, plugins/manual-kit/bin/manual-kit, plugins/manual-kit/skills/manual/SKILL.md, README.md, docs/reference.md]
---
ส่วนใหญ่คุณใช้แค่ `/manual` ใน Claude Code ตารางคำสั่งของ manual-kit มีไว้ให้เข้าใจว่า Claude กำลังทำอะไร
และสำหรับคำสั่งที่คนต้องรันเอง (`sign`) ใน Claude Code ให้นำหน้าด้วย `!` เช่น `! manual-kit sign --all`
manual-kit รุ่นที่เอกสารนี้อธิบาย: {{data:pkg.version}}

## คำสั่งใน Claude Code

| พิมพ์ | ได้อะไร |
|---|---|
| `/manual <สิ่งที่ต้องการ>` | ทำคู่มือใหม่ทั้งเล่ม (หรือทำต่อ/อัปเดตถ้ามีอยู่แล้ว) |
| `/manual spec` | สแกนและเขียนสเปกอย่างเดียว |
| `/manual update` | ระบบเปลี่ยน ให้คู่มือตาม แก้เฉพาะหน้าที่กระทบ |
| `/manual check` | รายงานว่าคู่มือยังตรงกับระบบไหม ไม่แก้อะไร |

ชื่อเต็มคือ `/manual-kit:manual` ใช้เมื่อชื่อสั้นไม่ขึ้น

## คำสั่งของ manual-kit

| คำสั่ง | ทำอะไร | ใครรัน |
|---|---|---|
| {{ui:"init"}} | สร้างโฟลเดอร์ `manual/` config และ shots.yaml (ไม่เขียนทับของเดิม) {{ui:"--books"}} หลายเล่ม {{ui:"--ci"}} งาน CI | Claude |
| {{ui:"discover"}} | สแกนหลักฐานสำหรับสเปก → `discovery.json` + `discovery.md` | Claude |
| {{ui:"inventory"}} | รายการสิ่งที่ต้องมีหน้า → `coverage.yaml` | Claude |
| {{ui:"new-page"}} | เริ่มหน้าใหม่ตามชนิด ({{ui:"--kind"}} how-to / reference / concept) | Claude |
| {{ui:"shotlist"}} | รายการภาพทั้งหมดและสถานะ | Claude |
| {{ui:"capture"}} | ถ่ายภาพหน้าจอ ภาพทีละขั้น และเฟรมวิดีโอ (เฉพาะที่อยู่ที่อนุญาต) | Claude |
| {{ui:"encode"}} | ทำวิดีโอ MP4 พร้อมคำบรรยายและเพลง | Claude |
| {{ui:"check"}} | ตรวจทุกกฎ ไม่ผ่านเมื่อมีข้อผิด {{ui:"--allow-unsigned"}} ให้หน้าที่ยังไม่รับรองเป็นคำเตือน {{ui:"--docx"}} ตรวจไฟล์ Word | Claude, CI |
| {{ui:"sign"}} | รับรองหน้าที่อ่านแล้ว ({{ui:"--all"}} ทุกหน้า) | **คนเท่านั้น** |
| {{ui:"build"}} | ออก PDF / Word / เว็บ ({{ui:"--book"}}, {{ui:"--lang"}}, {{ui:"--finalize"}}) | Claude |
| {{ui:"snap"}} | ภาพเต็มหน้าของเว็บคู่มือที่หลายความกว้าง ({{ui:"--width"}}) | Claude, คน |
| {{ui:"preview"}} | เปิดเว็บคู่มือบนเครื่องตัวเอง | คน |
| {{ui:"publish"}} {{ui:"outline"}} | ส่งขึ้น Outline wiki ({{ui:"--collection"}}, {{ui:"--dry-run"}}) | คน |
| {{ui:"setup"}} | ติดตั้งแพ็กเกจและ Chromium ที่ plugin ต้องใช้ | plugin เอง, คน |
| {{ui:"doctor"}} | บอกที่อยู่ของ plugin และโปรแกรมเสริมที่มี/ขาด | คน |

ทุกคำสั่งรับ {{ui:"--manual"}} `<dir>` เมื่อคู่มือไม่ได้อยู่ในโฟลเดอร์ `manual/` (เช่นเล่มนี้อยู่ที่ `docs/manual`)

## ตัวอ้างอิงในหน้าคู่มือ

Claude เขียนหน้าด้วยตัวอ้างอิงแทนการพิมพ์ชื่อปุ่มหรือแปะภาพเอง เพื่อให้ check จับได้เมื่อระบบเปลี่ยน:

```text
{{ui:"ข้อความบนปุ่ม"}}   ชื่อปุ่ม/ป้ายตามที่อยู่ในโค้ด (หายจากโค้ดเมื่อไร check ไม่ผ่าน)
{{data:limits.max}}      ค่าจากไฟล์ข้อมูลของโครงการ
{{shot:id}} {{steps:id}} {{clip:id}}   ภาพหน้าจอ ภาพทีละขั้น วิดีโอ
[[page-id]]              ลิงก์ไปหน้าอื่น
```

## กติกา

- ถ่ายภาพจากเครื่องตัวเองหรือ staging ด้วย **ข้อมูลสมมติเท่านั้น** ห้ามข้อมูลจริงของลูกค้าหรือบุคคล
- ห้ามใส่ password หรือ API key ในไฟล์คู่มือ รหัสผ่านทดสอบมาจากตัวแปรสภาพแวดล้อม
- ไม่ใช้คำโอ้อวดหรือจัดอันดับตัวเอง ระบบตรวจให้
- ไม่แต่งข้อมูล: สิ่งที่ไม่รู้เป็น `(รอระบุ)`
- **คนเท่านั้นที่รับรอง** Claude และ CI ไม่รับรองแทน
- ไม่ใช้ Microsoft Word อัตโนมัติ เปิด Word เองหนึ่งครั้งก่อนส่ง
- แก้ฟีเจอร์ไหน สั่ง `/manual update` ใน merge request เดียวกัน
- ปัญหาของระบบที่เจอ แจ้งทีมพัฒนา ไม่เขียนลงคู่มือเหมือนเป็นฟีเจอร์

## หน้าที่เกี่ยวข้อง

- [[use.troubleshooting]]
- [[use.about]]
