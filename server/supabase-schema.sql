-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- RLS włączone i BEZ polityk = klucz publiczny (anon) nie ma żadnego dostępu.
-- Backend używa klucza service_role, który omija RLS.

create table if not exists public.orders (
  session_id text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.consents (
  id         bigserial primary key,
  session_id text not null,
  data       jsonb not null,
  logged_at  timestamptz not null default now()
);

alter table public.orders   enable row level security;
alter table public.consents enable row level security;
