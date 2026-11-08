-- ============================================================
-- SCLRP update: public report overview
-- Lets everyone (including visitors who are not signed in) see the
-- school-wide problem statistics on the home page.
-- Returns ONLY non-identifying fields: no reporter name, student ID,
-- classroom, description, photos or notes.
-- Safe to run more than once.
-- ============================================================
create or replace function public.public_report_overview()
returns table (
  id text,
  title text,
  category text,
  location text,
  datetime text,
  status text,
  resolution_date text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.title, r.category, r.location, r.datetime, r.status, r.resolution_date
  from public.reports r
  order by r.created_at desc
  limit 500;
$$;

revoke all on function public.public_report_overview() from public;
grant execute on function public.public_report_overview() to anon, authenticated;
