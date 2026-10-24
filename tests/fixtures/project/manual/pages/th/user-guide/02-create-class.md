---
id: teacher.create-class
title: สร้างห้องเรียน
audience: [teacher]
book: user-guide
kind: how-to
routes: [/classes]
sources: [src/routes.ts, src/limits.json]
---

## ห้องเรียนคืออะไร

ห้องหนึ่งมีนักเรียนได้ {{data:limits.class.maxStudents}} คน เข้าสู่ระบบก่อน

## วิธีสร้างห้องเรียน

กด {{ui:class.new}}

```
{{ui:not.a.token.inside.code}}
```

{{steps:create-class}}

## ข้อควรทราบ

- ห้องใหม่อยู่ในรายการ

## ปัญหาที่อาจพบและวิธีแก้ไข

ไม่มีปัญหาที่พบบ่อย

## คำถามที่เกี่ยวข้อง

[[teacher.sign-in]]
