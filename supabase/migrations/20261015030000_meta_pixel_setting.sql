alter table public.course_settings
  add column if not exists pixel_id text not null default ''
  check (pixel_id = '' or pixel_id ~ '^[0-9]{6,20}$');
