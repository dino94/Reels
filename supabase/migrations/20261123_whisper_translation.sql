alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports
  add constraint reports_kind_check
  check (kind in ('analysis', 'remake', 'explanation_video', 'translation'));
