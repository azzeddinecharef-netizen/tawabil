create table if not exists public.registrations (
  id bigint generated always as identity primary key,
  first_name text not null check (char_length(first_name) between 1 and 200),
  last_name text not null check (char_length(last_name) between 1 and 200),
  phone text not null check (char_length(phone) between 5 and 25),
  email text not null check (char_length(email) between 3 and 200),
  wilaya text not null check (char_length(wilaya) between 1 and 200),
  birth_date date not null,
  profession text not null check (char_length(profession) between 1 and 200),
  created_at timestamptz not null default now()
);
create table if not exists public.course_settings (
  id boolean primary key default true check (id),
  title text not null default 'خطوتك الأولى نحو مهارة جديدة',
  description text not null default 'مساحة للتعلّم والتطبيق. تعرّف على الدورة، شاهد المقدّمة، وسجّل اهتمامك.',
  video text not null default '', audio1 text not null default '', audio2 text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.course_settings (id) values (true) on conflict (id) do nothing;
create table if not exists public.admin_sessions (token_hash text primary key, expires_at timestamptz not null, created_at timestamptz not null default now());
alter table public.registrations enable row level security;
alter table public.course_settings enable row level security;
alter table public.admin_sessions enable row level security;
revoke all on public.registrations, public.course_settings, public.admin_sessions from anon, authenticated;
grant all on public.registrations, public.course_settings, public.admin_sessions to service_role;
grant usage, select on sequence public.registrations_id_seq to service_role;
