-- Every worker and manager can view and update every report (including old reports and
-- reports opened by someone else). Deleting a whole report stays as it is (managers only).
--
-- Run once in Supabase: SQL Editor -> paste -> Run. Safe to run again.
-- These policies are added next to the existing ones; Postgres allows an action when any policy allows it.

-- True for any signed-in user who has a profile (every worker and manager created in the app).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

grant execute on function public.is_staff() to authenticated;

-- Reports: view, create and update. Saving an existing report is an upsert, which Postgres also checks
-- against the INSERT policy, so INSERT must allow rows whose owner is another user.
drop policy if exists "staff select reports" on public.reports;
create policy "staff select reports" on public.reports for select to authenticated using (public.is_staff());
drop policy if exists "staff insert reports" on public.reports;
create policy "staff insert reports" on public.reports for insert to authenticated with check (public.is_staff());
drop policy if exists "staff update reports" on public.reports;
create policy "staff update reports" on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Report contents: saving replaces findings and removed inspections/photos, so delete is needed here too.
drop policy if exists "staff all inspections" on public.inspections;
create policy "staff all inspections" on public.inspections for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff all findings" on public.findings;
create policy "staff all findings" on public.findings for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff all media" on public.media_assets;
create policy "staff all media" on public.media_assets for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Photo and video files: view, upload and remove files of any report.
drop policy if exists "staff all report media files" on storage.objects;
create policy "staff all report media files" on storage.objects for all to authenticated
  using (bucket_id = 'report-media' and public.is_staff())
  with check (bucket_id = 'report-media' and public.is_staff());
