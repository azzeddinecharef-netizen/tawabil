alter table public.orders
  add column if not exists status text not null default 'new'
  check (status in ('new', 'confirmed', 'rejected'));
