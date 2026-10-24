---
id: use.keep-current
title: ดูแลคู่มือให้ตามระบบ
audience: [team, lead]
book: user-guide
kind: how-to
group: deliver
summary: เมื่อระบบเปลี่ยน ให้ /manual update แก้เฉพาะหน้าที่กระทบ ใช้ /manual check ดูว่าอะไรเปลี่ยน และให้ CI ตรวจทุก merge request
routes: [check, shotlist]
covers: []
sources: [plugins/manual-kit/skills/manual/SKILL.md, src/check.ts, src/init.ts, src/coverage.ts, docs/reference.md]
---
คู่มือที่ส่งไปแล้วจะผิดทันทีที่ระบบเปลี่ยน manual-kit จึงเก็บ "ลายนิ้วมือ" ของไฟล์ต้นทางของทุกหน้าไว้ตอนรับรอง
แล้วคอยเทียบกับโค้ดปัจจุบัน หน้านี้อธิบายสามเครื่องมือ: `/manual update` (ให้ Claude แก้), `/manual check` (ดูอย่างเดียว)
และงาน CI ที่ตรวจทุก merge request

## ก่อนเริ่ม

- โครงการมีคู่มือใน `manual/` แล้ว (ทำด้วย [[use.new-manual]])
- ควรแก้คู่มือใน merge request เดียวกับที่แก้ฟีเจอร์ คู่มือจะไม่ตามหลัง

## ขั้นตอน

1. **ดูว่าอะไรเปลี่ยน**: พิมพ์ `/manual check` Claude จะไม่แก้อะไร แต่รายงานเป็นภาษาธรรมดาว่ามีหน้าจอ ป้าย บทบาท หรือ flag
   อะไรเปลี่ยน หน้าไหนยังไม่รับรอง ภาพไหนเก่า และ `/manual update` จะทำอะไรให้ ภายในใช้คำสั่ง {{ui:"check"}}
   ภาพด้านล่างเป็นผลจริงบนโครงการทดสอบ หลังแก้ไฟล์ `src/routes.ts` ที่สองหน้าอ้างถึง:

{{shot:check-drift}}

2. **ให้ Claude แก้**: พิมพ์ `/manual update` Claude จะสแกนใหม่ เทียบกับครั้งก่อน แก้สเปก แก้เฉพาะหน้าที่ check ชี้
   (ไฟล์ต้นทางเปลี่ยน ป้ายบนหน้าจอหายไป หน้าจอใหม่ที่ยังไม่มีหน้า) ถ่ายภาพใหม่เฉพาะที่เปลี่ยน
   ({{ui:"capture"}} {{ui:"--changed"}}) แล้วออกไฟล์ใหม่ จะบอกเจาะจงก็ได้ เช่น "ฟีเจอร์อนุมัติเอกสารเพิ่งเปลี่ยน ช่วยอัปเดตบทนั้น"
3. **อ่านและรับรองหน้าที่เปลี่ยน** เหมือนตอนส่งมอบ ([[use.deliver]])
4. **เปิดการตรวจใน CI (ครั้งเดียวต่อโครงการ)** ให้ Claude รัน `manual-kit init --ci gitlab` หรือบอกว่า "เพิ่มงานตรวจคู่มือใน GitLab CI"
   จะได้ไฟล์ `.gitlab/ci/manual-check.gitlab-ci.yml` (งานชื่อ `manual-check` รันใน merge request)
   ถ้าโครงการมี `.gitlab-ci.yml` อยู่แล้ว manual-kit ไม่แก้ไฟล์นั้น แต่บอกบรรทัดที่ต้องเพิ่ม:

   ```yaml
   include:
     - local: .gitlab/ci/manual-check.gitlab-ci.yml
   ```

5. ตั้งตัวแปร CI/CD ชื่อ `MANUAL_KIT_SPEC` ใน GitLab (Settings → CI/CD → Variables) เป็นที่อยู่ของ manual-kit
   แบบตรึงรุ่น เพื่อให้ CI ใช้เครื่องมือรุ่นเดียวกันทุกครั้งและไม่ดึงแพ็กเกจชื่อเดียวกันจากที่อื่น:
   - `git+https://<ที่อยู่ repo manual-kit>.git#<commit SHA 40 ตัว>` หรือ
   - ที่อยู่ไฟล์ `.tgz` พร้อมตัวแปร `MANUAL_KIT_SHA256` (ค่า sha256 ของไฟล์)

   ค่าแบบอื่นทำให้งานหยุดพร้อมข้อความ `MANUAL_KIT_SPEC must be a .tgz URL ...` (ที่อยู่ที่ใช้จริงสำหรับทีม: (รอระบุ))

## ผลลัพธ์ที่ได้

ทุก merge request รัน `manual-kit check --allow-unsigned`: ถ้าโค้ดเปลี่ยนจนคู่มือไม่ตรง (ไฟล์ต้นทางเปลี่ยน ป้ายหายไป
หน้าจอใหม่ไม่มีหน้า) งานจะไม่ผ่านพร้อมรายการที่ต้องแก้ หน้าที่รอคนรับรองจะแสดงเป็นรายการแต่ไม่ทำให้งานล้ม
เพราะ CI ไม่มีวันรับรองแทนคน ส่วนที่ยังไม่เขียนตอนนี้ตั้ง `status: manual-later` ใน `manual/coverage.yaml` ได้
งานจะผ่าน แต่ check รายงานค้างทุกครั้งจนกว่าจะเขียน

ถ้าอยากรู้ว่ายังมีภาพไหนต้องถ่าย ให้ Claude รัน {{ui:"shotlist"}} จะได้รายการภาพทั้งหมดพร้อมหน้าที่ใช้และสถานะ

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| งาน `manual-check` ล้มด้วย `MANUAL_KIT_SPEC must end with a full 40-character commit SHA` | ใส่ชื่อ branch หรือ SHA แบบสั้น | ใส่ commit SHA เต็ม 40 ตัว |
| `... has no manual page` | มีหน้าจอ บทบาท หรือคำสั่งใหม่ที่ไม่มีหน้า | สั่ง `/manual update` หรือตั้ง `manual-later` / `ignored` (พร้อม `note`) ใน coverage.yaml |
| อยากได้ PDF จาก CI ด้วย | ค่าเริ่มต้นตรวจอย่างเดียว | ในไฟล์งาน CI มีส่วน `artifacts` ที่ปิดไว้ เปิดได้ (image ต้องมี pandoc และ Chromium) |

## หน้าที่เกี่ยวข้อง

- [[use.deliver]]
- [[use.commands]]
