alter table public.course_settings
  add column if not exists price text not null default '',
  add column if not exists media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array');

update public.course_settings
set title = 'نكهة بسكرة، في باك واحد.',
    description = 'باك يجمع مجموعة من التوابل المستوحاة من نكهات بسكرة. استكشف التفاصيل، ثم أرسل طلبك وسنتواصل معك لتأكيده.'
where id = true and title = 'خطوتك الأولى نحو مهارة جديدة';

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  full_name text not null check (char_length(full_name) between 1 and 200),
  phone text not null check (char_length(phone) between 8 and 25),
  wilaya text not null check (char_length(wilaya) between 1 and 100),
  address text not null check (char_length(address) between 3 and 300),
  quantity integer not null check (quantity between 1 and 99),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant all on public.orders to service_role;
grant usage, select on sequence public.orders_id_seq to service_role;
