-- Student Council Management System
-- Run this whole file in Supabase SQL Editor.
-- Then create the first admin Auth user in Authentication > Users
-- and run the final UPDATE statement with that user's UUID.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique not null,
  name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  classroom text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null,
  reporter_id text not null,
  classroom text,
  title text not null,
  category text not null,
  location text not null,
  datetime text,
  description text not null,
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  resolution_date text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_user_id_idx on public.reports(user_id);
create index if not exists reports_status_idx on public.reports(status);
create index if not exists profiles_student_id_idx on public.profiles(student_id);

alter table public.profiles enable row level security;
alter table public.reports enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self_student" on public.profiles;
create policy "profiles_insert_self_student"
on public.profiles
for insert
to authenticated
with check (id = auth.uid() and role = 'student');

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
on public.reports
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin"
on public.reports
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
on public.reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reports_delete_admin" on public.reports;
create policy "reports_delete_admin"
on public.reports
for delete
to authenticated
using (public.is_admin());

grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select, insert, update, delete on public.reports to authenticated;

-- ============================================================
-- FIRST ADMIN SETUP
-- 1. Supabase Dashboard > Authentication > Users > Add user.
-- 2. Use an email alias matching the admin username:
--       admin@school.local
--    and choose the admin password.
-- 3. Copy the created Auth user's UUID.
-- 4. Replace YOUR_ADMIN_UUID below and run it.
--
-- The web login then accepts:
--       Username: admin
--       Password: the password you chose
--
-- update public.profiles
-- set role = 'admin', name = 'ผู้ดูแลระบบ', classroom = 'สภานักเรียน'
-- where id = 'YOUR_ADMIN_UUID';
--
-- insert public.profiles (id, student_id, name, role, classroom, email)
-- values (
--   'YOUR_ADMIN_UUID',
--   'admin',
--   'ผู้ดูแลระบบ',
--   'admin',
--   'สภานักเรียน',
--   'admin@school.local'
-- )
-- on conflict (id) do update
-- set role = excluded.role,
--     name = excluded.name,
--     classroom = excluded.classroom,
--     email = excluded.email;
