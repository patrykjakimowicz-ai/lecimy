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

-- Leady z ankiety PRO (pro.html) dla panelu CRM (crm.html). Dodane później - jeśli tabele orders/consents
-- już istnieją, wystarczy uruchomić tylko ten fragment.
create table if not exists public.leads (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
alter table public.leads enable row level security;

-- Ustawienia z panelu CRM (np. wyłączone bloki bezpłatnych konsultacji). Dodane później - jeśli pozostałe tabele
-- już istnieją, wystarczy uruchomić tylko ten fragment.
create table if not exists public.ustawienia (
  klucz      text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ustawienia enable row level security;

-- Postęp oglądania lekcji (panel kursu) - dowód do Gwarancji zwrotu. Uruchom ten fragment w Supabase → SQL Editor.
create table if not exists public.lesson_progress (
  user_id    text not null,
  lesson_id  text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.lesson_progress enable row level security;
