# Student Council Management System

เว็บสภานักเรียนที่มี Public / Student / Admin และรองรับ Supabase

## ระบบที่ย้ายไป Supabase แล้ว
- Login นักเรียนด้วยรหัสนักเรียน + รหัสผ่าน
- Login Admin
- สมัครสมาชิกนักเรียน
- Session Login คงอยู่เมื่อเปิดเว็บใหม่
- ส่งปัญหาและบันทึกลง PostgreSQL จริง
- นักเรียนเห็นเฉพาะปัญหาของตัวเอง
- Admin เห็นปัญหาทั้งหมด
- Admin เปลี่ยนสถานะ / วันที่แก้ไข / หมายเหตุ และบันทึกลงฐานข้อมูลจริง

ระบบอื่น ๆ ใน UI เดิม (ข่าว, เพลง, ของหาย, แชท ฯลฯ) ยังใช้ localStorage จนกว่าจะย้ายตารางเหล่านั้นไป Supabase เพิ่ม

## 1) สร้าง Supabase
สร้าง Project ใน Supabase แล้วเปิด SQL Editor

นำไฟล์ `supabase_schema.sql` ทั้งไฟล์ไปรัน

Supabase Auth ใช้ email/password แต่เว็บนี้แปลงรหัสนักเรียนเป็น alias ภายใน เช่น:
`12345` -> `12345@school.local`

เพื่อให้ผู้ใช้ยังกรอกรหัสนักเรียนเหมือนเดิม

## 2) ตั้งค่า Auth
ใน Supabase Authentication settings:
- เปิด Email provider
- สำหรับระบบนี้ให้ปิด Confirm email เพราะ alias `.local` ไม่สามารถรับอีเมลยืนยันได้
- เปิด Allow new users ถ้าต้องการให้หน้า "สมัครสมาชิก" ใช้งานได้

## 3) ใส่ Project URL + Publishable Key
เปิด `supabase-config.js`

ใส่:
- Project URL
- Publishable Key

ใช้เฉพาะ publishable/anon key สำหรับ browser
ห้ามใส่ `service_role` หรือ secret key

## 4) สร้าง Admin คนแรก
ไปที่:
Authentication > Users > Add user

สร้าง:
`admin@school.local`

จากนั้นเอา UUID ของ user ไปใส่ในส่วน FIRST ADMIN SETUP ท้าย `supabase_schema.sql`

รันคำสั่ง insert/update สำหรับ profile admin

## 5) Deploy Render
เว็บนี้เป็น Static Site

- Branch: `main`
- Root Directory: เว้นว่าง
- Build Command: เว้นว่าง
- Publish Directory: `.`

ไม่ต้องใช้ `server.js` และไม่ต้องใช้ `npm start`

## หมายเหตุด้านความปลอดภัย
RLS เปิดไว้สำหรับ `profiles` และ `reports`
- นักเรียนเพิ่มรายงานได้เฉพาะในบัญชีตัวเอง
- นักเรียนอ่านได้เฉพาะรายงานตัวเอง
- Admin อ่าน/แก้ไขรายงานทั้งหมด
- อย่าใส่ service_role/secret key ลงใน frontend
