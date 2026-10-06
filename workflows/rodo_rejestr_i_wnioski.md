# RODO: rejestr przetwarzania, dostawcy i obsługa wniosków klientów

> Dokument roboczy dla Administratora (Weska Academy Sp. z o.o.) i dla prawnika/IOD. To nie jest opinia prawna.
> Ostatnia weryfikacja dostawców: 2026-10-06. Pozycje oznaczone **[DO POTWIERDZENIA]** wymagają sprawdzenia w panelach.

## 1. Rejestr czynności przetwarzania (art. 30 RODO, skrót)
Administrator: Weska Academy Sp. z o.o., ul. Złota 7/28, 00-019 Warszawa, NIP 5253083214, KRS 0001229728. IOD: nie powołano.

| Czynność | Cel i podstawa prawna | Kategorie danych | Odbiorcy | Okres przechowywania |
|---|---|---|---|---|
| Realizacja zamówienia | wykonanie umowy (art. 6 ust. 1 lit. b) | imię, nazwisko, e-mail, pakiet, kwota, status | Przelewy24 (odrębny administrator), Render, Supabase | do realizacji, potem jak w wierszu „Księgowość" |
| Konto w panelu programu | wykonanie umowy (lit. b) | e-mail, hasło (zaszyfrowane przez Supabase), postęp w kursie (localStorage w przeglądarce klienta) | Supabase | do końca Edycji + rozsądny okres, potem usunięcie/anonimizacja |
| Faktury i księgowość | obowiązek prawny (lit. c) | firma, NIP, adres, dane zamówienia | biuro rachunkowe, KSeF, organy podatkowe | 5 lat od końca roku podatkowego |
| Dowód akceptacji regulaminu | uzasadniony interes: obrona roszczeń, wymóg operatora płatności (lit. f; OWU P24 § 2 ust. 11: min. 2 lata) | e-mail, imię, nazwisko, data i godzina, adres IP, przeglądarka, wersja regulaminu i polityki | Supabase | min. 2 lata od realizacji usługi, dłużej do przedawnienia roszczeń |
| Komunikacja z klientem | wykonanie umowy / uzasadniony interes | e-mail, treść korespondencji | dostawca poczty | do zakończenia sprawy + przedawnienie roszczeń |
| Źródło zamówienia (UTM) | uzasadniony interes: rozliczenie skuteczności marketingu (lit. f) | parametry z adresu (utm_*, ttclid, fbclid, gclid), bez cookies | Supabase | jak zamówienie |
| Statystyki ruchu | uzasadniony interes (lit. f) | dane anonimowe, bez cookies | Plausible (UE) | wg ustawień Plausible |

## 2. Rejestr dostawców (podmioty przetwarzające i odbiorcy)
| Dostawca | Rola | Co przetwarza | Siedziba | Umowa powierzenia (DPA) | Transfer poza EOG | Region danych | Status |
|---|---|---|---|---|---|---|---|
| Netlify, Inc. | procesor | strona publiczna (brak danych klientów poza logami dostępu) | USA | https://www.netlify.com/pdf/netlify-dpa.pdf | SCC (dec. 2021/914) w DPA | — | OK |
| Render Services, Inc. | procesor | serwer API: dane zamówień w pamięci/logach, przekazywanie do bazy i P24 | USA | https://render.com/dpa | SCC w DPA (DPA odwołuje się też do EU-US DPF) | Frankfurt (EU Central), sprawdzono 2026-10-06 | OK |
| Supabase, Inc. | procesor | baza: `orders`, `consents`, konta (Auth) | USA | https://supabase.com/legal/customer-resources/data-processing-addendum (wchodzi z regulaminem usługi) | SCC w DPA | Central EU (Frankfurt), eu-central-1, sprawdzono 2026-10-06 | OK (uwaga: plan Free bez kopii zapasowych) |
| Plausible Insights OÜ | procesor | anonimowe statystyki | Estonia (serwery w UE) | DPA dostępne u dostawcy | nie dotyczy | UE | OK |
| GoDaddy (Titan Email) | procesor | poczta: wysyłka potwierdzeń, korespondencja | USA | **[DO POTWIERDZENIA]** link do DPA | **[DO POTWIERDZENIA]** | **[DO POTWIERDZENIA]** | do uzupełnienia po przejściu z Gmaila |
| PayPro S.A. (Przelewy24) | odrębny administrator | dane płatności | Polska | OWU P24 (bez osobnej umowy powierzenia) | nie dotyczy | PL | OK |
| Biuro rachunkowe | procesor/odbiorca | dane do faktur | — | **[DO POTWIERDZENIA]** umowa powierzenia z biurem | — | — | do uzupełnienia |
| UptimeRobot | procesor (drobny) | tylko adres e-mail właściciela konta; endpoint `/api/health` nie zwraca danych | — | — | — | — | niski wpływ |
| jsDelivr (CDN), YouTube (miniatura) | odbiorcy techniczni | adres IP odwiedzającego | — | — | — | — | opisane w polityce (pkt 7) |

Wyłączone z użycia: Gmail (konto konsumenckie, brak DPA): **usunąć z konfiguracji po przejściu na pocztę firmową** (zmienne `SMTP_*` w Renderze, hasło aplikacji Google).

## 3. Obsługa wniosków osób, których dane dotyczą
Termin odpowiedzi: **1 miesiąc** od otrzymania wniosku (art. 12 ust. 3 RODO; można przedłużyć o 2 miesiące w złożonych sprawach, informując osobę).
Wnioski przychodzą na `kontakt@weskaacademy.pl` (adres z polityki prywatności).

### Krok 1: potwierdź tożsamość
Odpowiedz na ten sam adres e-mail, z którego złożono zamówienie. Nie ujawniaj danych na adres inny niż użyty przy zakupie.

### Krok 2: zbierz dane (eksport)
```bash
# z katalogu projektu, ze zmiennymi środowiskowymi ustawionymi w tej sesji powłoki
# (SUPABASE_URL, SUPABASE_SERVICE_KEY — wartości z panelu Rendera, NIE zapisuj ich w plikach)
node tools/rodo_eksport.mjs klient@example.com
```
Wynik: plik JSON w `.tmp/` (zamówienia, dowody zgód, konto w Auth). `.tmp/` jest poza repozytorium. Plik zawiera dane osobowe: wyślij go osobie bezpiecznym kanałem i **usuń z dysku po wysyłce**.
Do testów bez dostępu do Supabase: `node tools/rodo_eksport.mjs --local klient@example.com` (czyta lokalne pliki `server/data/`).

### Krok 3: wybierz działanie
| Wniosek | Co zrobić |
|---|---|
| **Dostęp / kopia danych** | wyślij wynik z kroku 2 + informacje z polityki (cele, odbiorcy, okresy) |
| **Sprostowanie** | popraw dane w Supabase (Table Editor → `orders`, pole `data`) i potwierdź na piśmie |
| **Usunięcie** | patrz „Czego nie wolno usunąć" poniżej |
| **Sprzeciw / ograniczenie** | oceń, czy obowiązuje podstawa (np. obowiązek prawny); odpowiedz pisemnie z uzasadnieniem |
| **Przeniesienie** | wynik z kroku 2 w formacie JSON spełnia wymóg formatu ustrukturyzowanego |

### Czego nie wolno usunąć na żądanie (wyjątki, art. 17 ust. 3 RODO)
- **Dane z faktur i zamówień opłaconych**: obowiązek przechowywania 5 lat (przepisy podatkowe i o rachunkowości).
- **Dowody akceptacji regulaminu**: min. 2 lata od realizacji usługi (OWU P24), do obrony przed roszczeniami.
Co można usunąć od razu: konto w panelu (Supabase → Authentication → Users → usuń użytkownika), zamówienia nieopłacone (`status: pending`) oraz maile niezwiązane z obowiązkiem prawnym.
Wobec danych objętych obowiązkiem retencji poinformuj osobę, że zostaną usunięte po upływie okresu i że do tego czasu są ograniczone do celów prawnych.

SQL do usunięcia **nieopłaconych** zamówień jednej osoby (Supabase → SQL Editor; wpisz właściwy e-mail):
```sql
delete from public.orders
where data->>'email' = 'klient@example.com' and data->>'status' = 'pending';
```

### Krok 4: udokumentuj
Zapisz (data wniosku, data odpowiedzi, co zrobiono) w prostym rejestrze wniosków (np. arkusz). Nie zapisuj tam samych danych osobowych ponad niezbędne minimum.

## 4. Naruszenie ochrony danych
Jeśli doszło do wycieku lub nieuprawnionego dostępu: ocena w ciągu 72 godzin, czy zgłosić do UODO (art. 33 RODO) i czy zawiadomić osoby (art. 34). Instrukcja techniczna: `workflows/awaria_i_odzyskiwanie.md`. Skonsultuj z prawnikiem.

## 5. Przeglądy cykliczne
- Po każdej zmianie dostawcy lub nowej usłudze zewnętrznej: zaktualizuj punkt 2 i politykę prywatności.
- Co 6 miesięcy: sprawdź DPA i podwykonawców dostawców (linki w punkcie 2), regiony danych, czy polityka jest nadal zgodna ze stanem faktycznym.
- Przy zmianie treści regulaminu lub polityki: zmień datę w `server/legalVersions.mjs` i nagłówek dokumentu (wersja w logu zgód).

## 6. Do zrobienia przed startem sprzedaży
- [x] Region Supabase i Rendera: Frankfurt (sprawdzono 2026-10-06).
- [ ] Przejść z Gmaila na pocztę firmową i potwierdzić jej DPA; uzupełnić wiersz w tabeli.
- [ ] Potwierdzić umowę powierzenia z biurem rachunkowym.
- [ ] Włączyć 2FA na kontach: Supabase, Render, Netlify, GitHub, Przelewy24, UptimeRobot, poczta.
- [ ] Opinia prawnika o regulaminie i polityce (wersje: regulamin v3, polityka v4).
