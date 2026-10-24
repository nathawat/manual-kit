# Manual spec template (manual/manual-spec.md)

The spec is what the manual is written from: what the system is, who uses it, every feature and workflow, and the
plan of books and pages. It lives in the repository next to the manual and is updated with it (`/manual-kit:manual
update`). Write it in the manual's primary language (Thai first for a Thai client); keep page ids, routes, file paths
and code names as they are.

Rules:

- **Every claim cites its evidence**: a file path (with line when you have one) from `discovery.md`, a document, or
  what you saw in the running app (`(seen: /orders/new, 2026-10-06)`). No path, no claim.
- **Unknowns are questions, never guesses.** A business rule, a contact, an approver or a number you cannot find goes
  into "คำถามที่ต้องยืนยัน" and shows as `(รอระบุ)` in the manual.
- **Cover the evidence.** Every route, role, permission and feature flag in `discovery.md` appears here: as a feature,
  inside a workflow, or under "นอกขอบเขต" with the reason. `manual-kit check` warns about any it cannot find. A route
  glob in backticks names a group of screens at once: `` `/settings/roles*` `` covers every route under it.
- Plain words. Name screens and buttons by their on-screen labels (quoted), not by component names.

Copy the headings below (Thai, with the English meaning in brackets for the team).

```markdown
---
system: <ชื่อระบบ>
version: <spec version, e.g. 0.1>
updated: <YYYY-MM-DD>
sources: discovery.json (<adapter>), <key documents read>
---

# สเปกคู่มือ: <ชื่อระบบ>

## 1. วัตถุประสงค์และผู้อ่าน (purpose and audience)
- คู่มือนี้ช่วยให้ใครทำอะไรได้ (one or two sentences per reader)
- ผู้อ่านแต่ละกลุ่ม: ใคร รู้อะไรมาก่อน อ่านเมื่อไร

## 2. ภาพรวมระบบ (system overview)
ระบบทำอะไร ให้ใคร ส่วนหลักมีอะไรบ้าง (cite README / requirement documents)

## 3. ผู้ใช้และบทบาท (actors and roles)
| บทบาท | ทำอะไรได้ | สิทธิ์ (permissions) | หลักฐาน |
|---|---|---|---|

## 4. รายการความสามารถ (feature inventory)
| # | ความสามารถ | ทำอะไร | ใครใช้ | หน้าจอ / route | หลักฐาน |
|---|---|---|---|---|---|

## 5. ขั้นตอนการทำงานตั้งแต่ต้นจนจบ (end-to-end workflows)
### 5.1 <ชื่อ workflow>
- ผู้เกี่ยวข้อง:
- เริ่มเมื่อ / จบเมื่อ:
- ขั้นตอน:
  1. <ใคร> ทำ <อะไร> ที่ <หน้าจอ> → สถานะ `<from>` → `<to>`
- สถานะ (states / transitions): `draft` → `paid` → ... (cite the enum / type)
- หลักฐาน:

## 6. กฎทางธุรกิจและการตรวจสอบข้อมูล (business rules and validations)
| กฎ | ใช้ที่ไหน | หลักฐาน |
|---|---|---|

## 7. ข้อความแจ้งเตือนที่ผู้ใช้อาจพบ (messages users can meet)
| ข้อความ | เกิดเมื่อ | ผู้ใช้ควรทำอย่างไร | หลักฐาน |
|---|---|---|---|

## 8. ระบบภายนอกและข้อจำกัด (integrations and limits)
บริการภายนอกที่ผู้ใช้เห็นผล (ชำระเงิน อีเมล การเข้าสู่ระบบ) ขีดจำกัด (ขนาดไฟล์ จำนวน) และ feature flag ที่เปิด/ปิดความสามารถ

## 9. ข้อมูลที่ผู้ใช้จัดการ (data the user handles)
ข้อมูลที่กรอก นำเข้า ส่งออก ข้อมูลส่วนบุคคลที่ต้องระวัง (อ้างฟิลด์จากฟอร์ม)

## 10. แผนคู่มือ (manual plan)
### เล่ม (books)
| เล่ม (folder) | ชื่อเล่ม | ผู้อ่าน |
|---|---|---|

### บทและหน้า (chapters and pages)
เรียงตามเมนูของระบบ ตามลำดับที่ผู้ใช้ทำงานจริง หน้า how-to หนึ่งหน้าคืองานเดียว ชื่อหน้าคือชื่องาน (เช่น "รับหนังสือเข้าระบบ")

| page id | ชื่อหน้า | ชนิด (how-to / reference / concept) | ผู้อ่าน | routes / sources | ครอบคลุม (features, workflows) |
|---|---|---|---|---|---|

### สื่อประกอบ (media plan)
| page id | shot / steps / clip | หน้าจอ | หมายเหตุ (login, ข้อมูลทดสอบ, mask) |
|---|---|---|---|

### การครอบคลุม (coverage mapping)
| รายการจาก discovery (route / role / permission / flag) | หน้า | หมายเหตุ |
|---|---|---|

## 11. คำถามที่ต้องยืนยัน (to confirm)
- [ ] (รอระบุ) ...

## 12. ปัญหาของระบบที่พบระหว่างทำคู่มือ (product issues found)
- ...

## 13. นอกขอบเขต (out of scope)
- <item>: เหตุผล
```
