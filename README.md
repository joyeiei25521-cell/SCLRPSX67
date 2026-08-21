# Student Council Management System

เว็บสภานักเรียนแบบ Static Site + Supabase Backend

## ระบบที่เก็บใน Supabase แล้ว
- Login / สมัครสมาชิก / Session
- สิทธิ์ Student / Admin
- แจ้งปัญหา + ติดตามสถานะ
- ข่าวสารและประกาศ
- ลิงก์สำคัญ
- ผลงานสภานักเรียน
- ขอเพลง + สถานะคิว + feedback
- ของหาย / เก็บได้ + สถานะ + ปักหมุด
- แชทนักเรียนกับแอดมิน
- Realtime สำหรับแชทและข้อมูลสำคัญ

## ตั้งค่า Supabase
1. สร้าง Project ใน Supabase
2. เปิด SQL Editor
3. รัน `supabase_schema.sql` ทั้งไฟล์
4. Authentication > Providers > Email เปิดใช้งาน และปิด Confirm email สำหรับระบบรหัสนักเรียน alias `.local`
5. สร้าง Admin ใน Authentication > Users ด้วย `admin@school.local`
6. คัดลอก UUID ของ Admin แล้วรัน INSERT ที่ท้าย `supabase_schema.sql`
7. เปิด `supabase-config.js` แล้วใส่ Project URL + Publishable Key

> ห้ามใส่ service_role / secret key ใน frontend

## Render
ใช้ **Static Site** ไม่ใช่ Web Service

- Branch: `main`
- Root Directory: เว้นว่าง
- Build Command: `echo "No build required"`
- Publish Directory: `.`

ไม่ต้องมี `server.js` และไม่ต้องใช้ Start Command

## หมายเหตุ
ไฟล์ `data.js` ยังเก็บ seed data ตัวอย่างไว้เป็น fallback แต่เมื่อ Supabase ตั้งค่าครบ เว็บจะอ่าน/เขียนข้อมูลที่ Supabase เป็นหลัก และข้อมูลร่วมกันระหว่างเครื่องจะอยู่ในฐานข้อมูลจริง
