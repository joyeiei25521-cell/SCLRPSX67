-- ============================================================
-- Student Council Management System - Full Supabase schema
-- Run this whole file in Supabase SQL Editor.
-- It stores ALL shared website data in Supabase:
-- profiles, reports, news, links, achievements, songs,
-- lost & found, chat sessions and chat messages.
-- ============================================================

create extension if not exists pgcrypto;

-- -------------------- PROFILES / AUTH --------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique not null,
  name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  classroom text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_student_id_idx on public.profiles(student_id);

-- -------------------- REPORTS --------------------
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

-- -------------------- PUBLIC CONTENT --------------------
create table if not exists public.news (
  id text primary key,
  headline text not null,
  content text not null,
  date text not null,
  img_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.links (
  id text primary key,
  name text not null,
  url text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id text primary key,
  headline text not null,
  content text not null,
  date text not null,
  responsible text not null,
  img_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------- SONG REQUESTS --------------------
create table if not exists public.songs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  title text not null,
  artist text not null,
  url text not null default '',
  message text not null default '',
  date text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','played','rejected')),
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists songs_user_id_idx on public.songs(user_id);
create index if not exists songs_status_idx on public.songs(status);

-- -------------------- LOST & FOUND --------------------
create table if not exists public.lost_found (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('lost','found')),
  category text not null,
  item_name text not null,
  location text not null,
  datetime text not null,
  reporter_name text not null,
  student_id text not null,
  classroom text not null,
  description text not null default '',
  contact text not null,
  image_url text not null default '',
  status text not null default 'searching'
    check (status in ('searching','found_matching','returned')),
  resolution_date text,
  notes text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lost_found_user_id_idx on public.lost_found(user_id);
create index if not exists lost_found_status_idx on public.lost_found(status);
create index if not exists lost_found_pinned_idx on public.lost_found(pinned);

-- -------------------- CHAT --------------------
create table if not exists public.chat_sessions (
  id text primary key,
  student_auth_id uuid unique not null references auth.users(id) on delete cascade,
  student_id text not null,
  student_name text not null,
  classroom text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.chat_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('student','admin')),
  text text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);

-- -------------------- UPDATED_AT TRIGGER --------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at before update on public.reports
for each row execute function public.set_updated_at();

drop trigger if exists news_set_updated_at on public.news;
create trigger news_set_updated_at before update on public.news
for each row execute function public.set_updated_at();

drop trigger if exists links_set_updated_at on public.links;
create trigger links_set_updated_at before update on public.links
for each row execute function public.set_updated_at();

drop trigger if exists achievements_set_updated_at on public.achievements;
create trigger achievements_set_updated_at before update on public.achievements
for each row execute function public.set_updated_at();

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at before update on public.songs
for each row execute function public.set_updated_at();

drop trigger if exists lost_found_set_updated_at on public.lost_found;
create trigger lost_found_set_updated_at before update on public.lost_found
for each row execute function public.set_updated_at();

-- -------------------- ADMIN HELPER --------------------
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

-- -------------------- RLS --------------------
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.news enable row level security;
alter table public.links enable row level security;
alter table public.achievements enable row level security;
alter table public.songs enable row level security;
alter table public.lost_found enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles
 drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self_student" on public.profiles;
create policy "profiles_insert_self_student" on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'student');

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Reports
 drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin" on public.reports for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "reports_delete_admin" on public.reports;
create policy "reports_delete_admin" on public.reports for delete to authenticated
using (public.is_admin());

-- Public content: anyone can read, only admins can change.
-- This is intentional because the news/links/achievements are public website content.

do $$
begin
  execute 'drop policy if exists "public_read_news" on public.news';
  execute 'drop policy if exists "admin_insert_news" on public.news';
  execute 'drop policy if exists "admin_update_news" on public.news';
  execute 'drop policy if exists "admin_delete_news" on public.news';
  execute 'drop policy if exists "public_read_links" on public.links';
  execute 'drop policy if exists "admin_insert_links" on public.links';
  execute 'drop policy if exists "admin_update_links" on public.links';
  execute 'drop policy if exists "admin_delete_links" on public.links';
  execute 'drop policy if exists "public_read_achievements" on public.achievements';
  execute 'drop policy if exists "admin_insert_achievements" on public.achievements';
  execute 'drop policy if exists "admin_update_achievements" on public.achievements';
  execute 'drop policy if exists "admin_delete_achievements" on public.achievements';
end $$;

create policy "public_read_news" on public.news for select to anon, authenticated using (true);
create policy "admin_insert_news" on public.news for insert to authenticated with check (public.is_admin());
create policy "admin_update_news" on public.news for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete_news" on public.news for delete to authenticated using (public.is_admin());

create policy "public_read_links" on public.links for select to anon, authenticated using (true);
create policy "admin_insert_links" on public.links for insert to authenticated with check (public.is_admin());
create policy "admin_update_links" on public.links for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete_links" on public.links for delete to authenticated using (public.is_admin());

create policy "public_read_achievements" on public.achievements for select to anon, authenticated using (true);
create policy "admin_insert_achievements" on public.achievements for insert to authenticated with check (public.is_admin());
create policy "admin_update_achievements" on public.achievements for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete_achievements" on public.achievements for delete to authenticated using (public.is_admin());

-- Songs: students can create/read their own; admins see and manage all.
 drop policy if exists "songs_insert_own" on public.songs;
create policy "songs_insert_own" on public.songs for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "songs_select_own_or_admin" on public.songs;
create policy "songs_select_own_or_admin" on public.songs for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "songs_update_admin" on public.songs;
create policy "songs_update_admin" on public.songs for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "songs_delete_admin" on public.songs;
create policy "songs_delete_admin" on public.songs for delete to authenticated
using (public.is_admin());

-- Lost & found: authenticated users can see all listings; only admins can edit.
 drop policy if exists "lost_found_insert_own" on public.lost_found;
create policy "lost_found_insert_own" on public.lost_found for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "lost_found_select_authenticated" on public.lost_found;
create policy "lost_found_select_authenticated" on public.lost_found for select to authenticated using (true);

drop policy if exists "lost_found_update_admin" on public.lost_found;
create policy "lost_found_update_admin" on public.lost_found for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lost_found_delete_admin" on public.lost_found;
create policy "lost_found_delete_admin" on public.lost_found for delete to authenticated using (public.is_admin());

-- Chat sessions
 drop policy if exists "chat_sessions_select_own_or_admin" on public.chat_sessions;
create policy "chat_sessions_select_own_or_admin" on public.chat_sessions for select to authenticated
using (student_auth_id = auth.uid() or public.is_admin());

drop policy if exists "chat_sessions_insert_own" on public.chat_sessions;
create policy "chat_sessions_insert_own" on public.chat_sessions for insert to authenticated
with check (student_auth_id = auth.uid());

drop policy if exists "chat_sessions_update_own_or_admin" on public.chat_sessions;
create policy "chat_sessions_update_own_or_admin" on public.chat_sessions for update to authenticated
using (student_auth_id = auth.uid() or public.is_admin())
with check (student_auth_id = auth.uid() or public.is_admin());

drop policy if exists "chat_sessions_delete_admin" on public.chat_sessions;
create policy "chat_sessions_delete_admin" on public.chat_sessions for delete to authenticated
using (public.is_admin());

-- Chat messages
 drop policy if exists "chat_messages_select_own_or_admin" on public.chat_messages;
create policy "chat_messages_select_own_or_admin" on public.chat_messages for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id and s.student_auth_id = auth.uid()
  )
);

drop policy if exists "chat_messages_insert_own_student" on public.chat_messages;
create policy "chat_messages_insert_own_student" on public.chat_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and (
    sender_role = 'admin' and public.is_admin()
    or sender_role = 'student' and exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.student_auth_id = auth.uid()
    )
  )
);

drop policy if exists "chat_messages_delete_admin" on public.chat_messages;
create policy "chat_messages_delete_admin" on public.chat_messages for delete to authenticated
using (public.is_admin());

-- -------------------- GRANTS --------------------
grant select on public.news, public.links, public.achievements to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.news, public.links, public.achievements to authenticated;
grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.lost_found to authenticated;
grant select, insert, update, delete on public.chat_sessions, public.chat_messages to authenticated;

-- -------------------- REALTIME --------------------
-- Optional but recommended for live chat and live admin/student updates.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.chat_messages'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.chat_sessions'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.news'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.songs'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.lost_found'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.reports'; exception when duplicate_object then null; end;
end $$;

-- -------------------- FIRST ADMIN --------------------
-- 1. Authentication > Users > Add user
-- 2. Example email alias: admin@school.local
-- 3. Copy the Auth user's UUID.
-- 4. Run:
--
-- insert into public.profiles (id, student_id, name, role, classroom, email)
-- values ('YOUR_ADMIN_UUID','admin','ผู้ดูแลระบบ','admin','สภานักเรียน','admin@school.local')
-- on conflict (id) do update set role='admin', name='ผู้ดูแลระบบ';
--
-- The browser login UI uses ONLY student ID + password.
-- Supabase Auth still needs an internal email-shaped identifier for password auth;
-- the website generates account-<student_id>@school-auth.invalid internally and never displays it.
-- Do NOT enable public signups. Student accounts should be created by an administrator.
-- Email confirmation is not needed for these internal accounts.

-- -------------------- OPTIONAL INITIAL CONTENT --------------------
-- These match the sample records that were previously in data.js.
-- Existing records with the same IDs are left untouched.
insert into public.achievements (id, headline, content, date, responsible, img_url)
values (
  'ACH-001',
  'โครงการพัฒนาห้องสมุด',
  'รวบรวมของใช้และจัดพื้นที่อ่านหนังสือให้สะดวกขึ้น',
  '2026-07-15',
  'สภานักเรียน',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800'
) on conflict (id) do nothing;

insert into public.news (id, headline, content, date, img_url)
values (
  'NEWS-001',
  'ประกาศประชุมสภานักเรียน',
  'ประชุมสภานักเรียนในวันพุธนี้ เวลา 15.00 น.',
  '2026-08-04',
  'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=800'
) on conflict (id) do nothing;

insert into public.links (id, name, url, category)
values (
  'LINK-001',
  'เว็บไซต์โรงเรียน',
  'https://example.com',
  'เว็บไซต์โรงเรียน'
) on conflict (id) do nothing;


-- -------------------- STORAGE / IMAGE UPLOADS --------------------
-- Public bucket for school website images. Files are still write-protected by RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-images',
  'school-images',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "school_images_public_read" on storage.objects;
create policy "school_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'school-images');

drop policy if exists "school_images_authenticated_upload" on storage.objects;
create policy "school_images_authenticated_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'school-images');

drop policy if exists "school_images_owner_delete" on storage.objects;
create policy "school_images_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'school-images'
  and (
    owner_id = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "school_images_admin_update" on storage.objects;
create policy "school_images_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'school-images' and public.is_admin())
with check (bucket_id = 'school-images' and public.is_admin());

