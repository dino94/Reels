create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  duration_seconds double precision,
  width integer,
  height integer,
  fps double precision,
  thumbnail_paths text[] not null default '{}',
  status text not null default 'uploaded' check (status in ('uploaded','processing','completed','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  storage_path text not null,
  content text not null,
  kind text not null default 'analysis' check (kind in ('analysis','remake','explanation_video')),
  created_at timestamptz not null default now()
);

create index if not exists videos_user_created_idx on public.videos(user_id, created_at desc);
create index if not exists analyses_video_created_idx on public.analyses(video_id, created_at desc);
create index if not exists reports_video_created_idx on public.reports(video_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.analyses enable row level security;
alter table public.reports enable row level security;

revoke all on public.profiles, public.videos, public.analyses, public.reports from anon;
grant select, insert, update, delete on public.profiles, public.videos, public.analyses, public.reports to authenticated;

drop policy if exists "Profiles are private to their owner" on public.profiles;
create policy "Profiles are private to their owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Videos are private to their owner" on public.videos;
create policy "Videos are private to their owner" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Analyses are private to their owner" on public.analyses;
drop policy if exists "Users read own analyses" on public.analyses;
drop policy if exists "Users create analyses for own videos" on public.analyses;
drop policy if exists "Users update own analyses" on public.analyses;
drop policy if exists "Users delete own analyses" on public.analyses;
create policy "Users read own analyses" on public.analyses
  for select using (auth.uid() = user_id);
create policy "Users create analyses for own videos" on public.analyses
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.videos video
      where video.id = analyses.video_id and video.user_id = auth.uid()
    )
  );
create policy "Users update own analyses" on public.analyses
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.videos video
      where video.id = analyses.video_id and video.user_id = auth.uid()
    )
  );
create policy "Users delete own analyses" on public.analyses
  for delete using (auth.uid() = user_id);

drop policy if exists "Reports are private to their owner" on public.reports;
drop policy if exists "Users read own reports" on public.reports;
drop policy if exists "Users create reports for own videos" on public.reports;
drop policy if exists "Users update own reports" on public.reports;
drop policy if exists "Users delete own reports" on public.reports;
create policy "Users read own reports" on public.reports
  for select using (auth.uid() = user_id);
create policy "Users create reports for own videos" on public.reports
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.videos video
      where video.id = reports.video_id and video.user_id = auth.uid()
    )
    and (
      analysis_id is null
      or exists (
        select 1 from public.analyses analysis
        where analysis.id = reports.analysis_id
          and analysis.video_id = reports.video_id
          and analysis.user_id = auth.uid()
      )
    )
  );
create policy "Users update own reports" on public.reports
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.videos video
      where video.id = reports.video_id and video.user_id = auth.uid()
    )
    and (
      analysis_id is null
      or exists (
        select 1 from public.analyses analysis
        where analysis.id = reports.analysis_id
          and analysis.video_id = reports.video_id
          and analysis.user_id = auth.uid()
      )
    )
  );
create policy "Users delete own reports" on public.reports
  for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', false, 524288000, array['video/mp4','video/quicktime','video/webm','image/jpeg']),
  ('reports', 'reports', false, 104857600, array['text/markdown','text/plain','video/mp4'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their own videos" on storage.objects;
create policy "Users upload their own videos" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users read their own videos" on storage.objects;
create policy "Users read their own videos" on storage.objects
  for select to authenticated using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own videos" on storage.objects;
create policy "Users delete their own videos" on storage.objects
  for delete to authenticated using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users manage their reports" on storage.objects;
create policy "Users manage their reports" on storage.objects
  for all to authenticated using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();
