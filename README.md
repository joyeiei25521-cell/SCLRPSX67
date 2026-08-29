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
5. สร้าง Admin ใน Authentication > Users ด้วยบัญชีใน `ADMIN_SETUP.txt`:
   - Username: ADMINSCLRP
   - Internal email: account-adminsclrp@school-auth.invalid
   - Password: ADMINSCLRP3345
6. คัดลอก UUID ของ Admin แล้วสร้าง/อัปเดตแถวใน `public.profiles` ตาม SQL ใน `ADMIN_SETUP.txt`
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

นักเรียน **สมัครบัญชีเองได้** ด้วย **ชื่อ + รหัสนักเรียน 5 หลัก + ห้องเรียน + รหัสผ่าน** จากหน้าเว็บ แล้วระบบ Edge Function จะสร้างบัญชี Auth ภายในให้อัตโนมัติ จากนั้นเว็บจะล็อกอินให้ทันที นักเรียนไม่ต้องกรอก Gmail หรืออีเมล

> หมายเหตุทางเทคนิค: Supabase Auth แบบ password ต้องมีตัวระบุรูปแบบอีเมลภายใน แต่เว็บจะสร้างค่า `account-<รหัสนักเรียน>@school-auth.invalid` อัตโนมัติและไม่แสดงให้ผู้ใช้เห็น ค่าอีเมลนี้ไม่ใช่ Gmail และไม่มีการส่งอีเมลจากระบบนี้

### การสร้างบัญชีนักเรียน
1. Supabase → Authentication → Users → Add user
2. ใส่ internal email ตามรูปแบบ `account-64123@school-auth.invalid`
3. ตั้ง Password ให้กับนักเรียน
4. เปิด Auto Confirm หากมีตัวเลือก
5. สร้างแถวใน `profiles` ให้ UUID ตรงกับ Auth user และ `student_id` เป็น `64123`

ไม่ต้องเปิด public email signups เพราะเว็บเวอร์ชันนี้ไม่ใช้ `signUp()` จากฝั่งนักเรียนอีกแล้ว


### เปิดให้สมัครเอง
- ไม่ต้องเปิด Public Email Signups ก็ได้ เพราะ Edge Function ใช้ Admin API สร้าง Auth user และยืนยันบัญชีให้อัตโนมัติ
- ต้อง Deploy Edge Function `create-student` และให้ function มี `SUPABASE_SERVICE_ROLE_KEY` ซึ่ง Supabase จัดการให้ใน runtime; ห้ามนำ key นี้มาใส่ frontend
- ใน frontend ใช้เพียง Project URL + Publishable Key
- นักเรียนสมัครจากหน้าเว็บ แล้วระบบจะสร้าง profile และเข้าสู่ระบบให้ทันที


## Admin self-registration

The admin login has a separate "สร้างบัญชีผู้ดูแล" form. It requires the Edge Function `create-admin` and a Supabase Function secret named `ADMIN_SETUP_CODE`. Do not put the setup code in browser code. Deploy `create-admin`, turn off Verify JWT for this public registration function, and set `ADMIN_SETUP_CODE` in Edge Function Secrets.
