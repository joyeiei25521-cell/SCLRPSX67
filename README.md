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


## Login แบบโรงเรียน (ไม่มี Gmail ในหน้าเว็บ)

เวอร์ชันนี้ปิดการสมัครสมาชิกจากหน้าเว็บ นักเรียนล็อกอินด้วย **รหัสนักเรียน + รหัสผ่าน** เท่านั้น และไม่ต้องกรอก Gmail/อีเมล ผู้ดูแลเป็นผู้สร้างบัญชีนักเรียนในระบบ Auth แล้วให้นักเรียนใช้รหัสที่ได้รับ

> หมายเหตุทางเทคนิค: Supabase Auth แบบ password ต้องมีตัวระบุรูปแบบอีเมลภายใน แต่เว็บจะสร้างค่า `account-<รหัสนักเรียน>@school-auth.invalid` อัตโนมัติและไม่แสดงให้ผู้ใช้เห็น ค่าอีเมลนี้ไม่ใช่ Gmail และไม่มีการส่งอีเมลจากระบบนี้

### การสร้างบัญชีนักเรียน
1. Supabase → Authentication → Users → Add user
2. ใส่ internal email ตามรูปแบบ `account-64123@school-auth.invalid`
3. ตั้ง Password ให้กับนักเรียน
4. เปิด Auto Confirm หากมีตัวเลือก
5. สร้างแถวใน `profiles` ให้ UUID ตรงกับ Auth user และ `student_id` เป็น `64123`

ไม่ต้องเปิด public email signups เพราะเว็บเวอร์ชันนี้ไม่ใช้ `signUp()` จากฝั่งนักเรียนอีกแล้ว
