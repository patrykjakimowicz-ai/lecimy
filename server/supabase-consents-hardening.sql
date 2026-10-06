-- Zabezpieczenie dowodów zgód: tabela public.consents staje się "tylko do dopisywania".
-- Uruchom w Supabase → SQL Editor DOPIERO PO wyczyszczeniu danych testowych (potem usuwanie wierszy będzie zablokowane).
-- Uwaga: osoba z uprawnieniami administratora bazy może wyłączyć trigger — to utrudnia przypadkowe lub nieuprawnione zmiany,
-- ale nie zastępuje kopii zapasowych (cotygodniowy eksport CSV + archiwum_dokumentow/).

create or replace function public.consents_block_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'Tabela consents jest tylko do dopisywania (dowody zgód) — zmiany i usuwanie są zablokowane.';
end;
$$;

drop trigger if exists consents_no_update_delete on public.consents;
create trigger consents_no_update_delete
  before update or delete on public.consents
  for each row execute function public.consents_block_changes();

drop trigger if exists consents_no_truncate on public.consents;
create trigger consents_no_truncate
  before truncate on public.consents
  for each statement execute function public.consents_block_changes();

-- Gdy kiedyś trzeba usunąć wpisy zgodnie z RODO (po upływie okresu przechowywania):
--   alter table public.consents disable trigger consents_no_update_delete;
--   delete from public.consents where logged_at < now() - interval '3 years';
--   alter table public.consents enable trigger consents_no_update_delete;
