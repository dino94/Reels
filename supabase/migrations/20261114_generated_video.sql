alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports
  add constraint reports_kind_check
  check (kind in ('analysis', 'remake', 'explanation_video'));

update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array['text/markdown', 'text/plain', 'video/mp4']
where id = 'reports';
