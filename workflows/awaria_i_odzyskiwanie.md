# Awaria i odzyskiwanie (sklep Lecimy po swoje)

## Cel
Gdy coś w sklepie przestanie działać, szybko ustalić **co** padło, **czy ktoś zapłacił i nie dostał dostępu**,
i przywrócić działanie. Priorytet: **nigdy nie zostawić klienta, który zapłacił, bez dostępu.**

## Z czego składa się system (gdzie szukać problemu)
| Część | Gdzie | Co robi | Jak sprawdzić, że żyje |
|---|---|---|---|
| Strona (HTML) | Netlify, `lecimyposwoje.pl` | oferta, formularz zamówienia, panel | otwórz stronę; monitor UptimeRobot „strona" |
| Backend (API) | Render, `lecimy-xlxt.onrender.com` | tworzy zamówienie, rejestruje płatność w P24, przyjmuje webhook, zakłada konta, wysyła maile | `https://lecimy-xlxt.onrender.com/api/health` → `{"ok":true,"db":true}` |
| Baza | Supabase, projekt „Lecimy po swoje" | zamówienia (`orders`), dowody zgód (`consents`), konta klientów (Authentication → Users) | pole `"db":true` w health checku |
| Płatności | Przelewy24 (sandbox / produkcja) | pobiera pieniądze, po udanej płatności wysyła webhook | panel P24 → Transakcje |
| Maile | Gmail (SMTP) z `lecimyposwoje2020@gmail.com` | potwierdzenie dla klienta + powiadomienie dla właściciela (`OWNER_EMAIL`) | Gmail → Wysłane |
| Monitoring | UptimeRobot | alert mailowy, gdy health check lub strona nie odpowiada | panel UptimeRobot (3 monitory) |

## Jak dowiadujesz się o awarii
1. **Mail z UptimeRobot** („Monitor is DOWN") — backend, baza lub strona nie odpowiada.
2. **Mail „⚠️ Nowe zamówienie …"** — zamówienie opłacone, ale nie założono konta lub nie wysłano maila klientowi
   (treść maila mówi, co zrobić).
3. **Zgłoszenie klienta** („zapłaciłem i nie mam dostępu") — patrz sekcja „Zapłacił, a nie ma dostępu".

## Pierwsze kroki (zawsze w tej kolejności)
1. Sprawdź `https://lecimy-xlxt.onrender.com/api/health`.
   - `200` i `"db":true` → backend i baza żyją, problem jest gdzie indziej (mail, P24, strona).
   - `503` lub `"db":false` → baza nie odpowiada → sekcja „Supabase".
   - brak odpowiedzi / błąd 5xx → sekcja „Render".
2. Sprawdź, czy strona się otwiera (`lecimyposwoje.pl`) → sekcja „Netlify" jeśli nie.
3. Zajrzyj w Render → **Logs** i wyszukaj `[p24-webhook]`, `[create-order]`, `[health]` (ostatnie godziny).

## Scenariusze

### Render nie odpowiada (5xx, timeout)
- Render → usługa `lecimy` → **Events**: czy trwa deploy? Poczekaj do statusu **Live**.
- Jeśli „Deploy failed": otwórz log, popraw błąd (najczęściej brakująca zmienna środowiskowa albo błąd w ostatnim commicie).
  Tymczasowo: **Rollback** do poprzedniego udanego deployu (przycisk przy deployu na liście).
- Jeśli usługa wisi: **Manual Deploy → Deploy latest commit** (restart).
- Skutek dla klientów: zamówienia nie przechodzą; P24 ponawia wysłanie webhooków po przywróceniu usługi — **patrz „Zapłacił, a nie ma dostępu"**,
  jeśli któraś płatność mimo to zostanie `pending`.

### Supabase nie odpowiada / projekt uśpiony
- Supabase Dashboard → projekt → jeśli „Paused": **Resume project** (kilka minut).
- Darmowy projekt jest usypiany po ~tygodniu niskiej aktywności; health check co 5 minut temu zapobiega (jeśli monitor jest włączony).
- Po wznowieniu sprawdź health check ponownie.
- Skutek: zamówienia nie zapisują się (klient widzi błąd przy „Kupuję i płacę"), a webhooki mogą się nie przetworzyć → jak wyżej.

### Netlify (strona nie działa)
- Netlify → projekt → **Deploys**: czy ostatni deploy jest „Published". Jeśli nie, wgraj ponownie folder `public` (przeciągnij na pole drop).
- Sprawdź, czy domena `lecimyposwoje.pl` jest nadal podpięta (Domain management).

### Przelewy24
- Panel P24 → **Transakcje**: czy płatności się pojawiają.
- Jeśli rejestracja transakcji zwraca błąd (w logach `Rejestracja transakcji w Przelewy24 nie powiodła się`): sprawdź zmienne `P24_*` w Renderze
  (czy to sandbox czy produkcja, czy klucze i ID są z tego samego środowiska, czy `P24_SANDBOX` ma właściwą wartość).
- Gdy P24 ma awarię po ich stronie: nie ma co naprawiać — poinformuj klientów (baner na stronie / media) i poczekaj.

### Maile nie wychodzą
- Render Logs: `wysyłka e-maila nie powiodła się` + treść błędu.
  - `Invalid login` / `535` → złe lub unieważnione hasło aplikacji Google (`SMTP_PASS`); utwórz nowe i podmień w Renderze.
  - `ETIMEDOUT` / `ENETUNREACH` → problem sieciowy lub blokada portów SMTP.
  - limit dzienny Gmaila (~500 wiadomości) → poczekaj do następnego dnia lub przejdź na skrzynkę firmową / usługę transakcyjną.
- Do czasu naprawy wysyłaj dostęp ręcznie (patrz niżej).

## Zapłacił, a nie ma dostępu (procedura ręczna)
**Zasada:** najpierw upewnij się, że płatność jest prawdziwa i dojdzie do nas, dopiero potem nadaj dostęp.

1. **Potwierdź płatność w P24** (panel P24 → Transakcje): szukaj po e-mailu klienta lub numerze zamówienia
   (numer w mailach to pierwsze 8 znaków `session_id` wielkimi literami).
   - Status „Do wykorzystania" / „Oczekujemy na zaakceptowanie płatności przez Sprzedawcę" = klient zapłacił, ale **nie przeszło potwierdzenie z naszej strony**.
2. **Znajdź zamówienie w Supabase** → Table Editor → `orders` (filtr po `session_id` lub e-mailu w kolumnie `data`).
   - `status: "pending"` mimo zapłaty = webhook nie został przetworzony.
3. **Zaksięguj płatność** w P24: najprostsza droga to poprosić o ponowne wysłanie powiadomienia (P24 ponawia webhooki; po przywróceniu backendu zwykle dojdzie samo).
   Jeśli nie dochodzi, zgłoś to do P24 (support) z numerem transakcji.
4. **Do czasu księgowania** możesz nadać klientowi dostęp ręcznie:
   - Supabase → **Authentication → Users → Add user → Create new user**: e-mail klienta, zaznacz „Auto Confirm User", hasło dowolne tymczasowe (nie wysyłaj go klientowi).
   - Poproś klienta, by na `https://lecimyposwoje.pl/logowanie.html` kliknął „Nie pamiętasz hasła?" i ustawił hasło z maila.
5. Wyślij klientowi krótki mail z potwierdzeniem i przeprosinami (z `lecimyposwoje2020@gmail.com`).
6. Zanotuj incydent (patrz „Po awarii").

> Uwaga: panel kursu wpuszcza w oknie edycji każdego zalogowanego użytkownika. Konto założone ręcznie daje taki sam dostęp jak automatyczne.

## Zamówienia `pending` — jak je odróżnić
- `pending` bez płatności w P24 = klient porzucił koszyk (normalne, nic nie rób).
- `pending` z płatnością w P24 = **problem** (patrz wyżej).
- Okresowo (np. codziennie w ostatnim tygodniu sprzedaży) porównaj w P24 listę opłaconych transakcji z zamówieniami `paid` w Supabase.

## Kopie zapasowe (dowody akceptacji regulaminu muszą być przechowywane min. 2 lata)
- Raz w tygodniu: Supabase → Table Editor → `orders` i `consents` → **Export → Download as CSV**. Zapisz w bezpiecznym miejscu
  (pliki zawierają dane osobowe — nie wysyłaj ich mailem ani do publicznych chmur).
- Przed większymi zmianami w bazie również zrób eksport.
- Darmowy plan Supabase nie gwarantuje pełnych kopii zapasowych — **eksport jest Twoją kopią**.

## Zmienne środowiskowe w Renderze (co jest wymagane)
`P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_SANDBOX`, `SITE_URL`, `API_URL`, `NODE_ENV`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `OWNER_EMAIL`.
Opcjonalnie: `MARKETING_ENABLED` (domyślnie wyłączone). **Wartości trzymaj tylko w panelu Rendera** (nie w repozytorium, nie w czatach).

## Po awarii (zawsze)
1. Zapisz: kiedy, co padło, ilu klientów dotknęło, jak naprawiono (krótka notatka w tym pliku lub osobny plik).
2. Jeśli ucierpiały dane klientów lub doszło do nieuprawnionego dostępu: ocena obowiązku zgłoszenia naruszenia (UODO, 72 h) — **skonsultuj z prawnikiem/IOD**.
3. Jeśli przyczyną była luka lub zmiana kodu: popraw, przetestuj, dopisz poniżej, czego się nauczyliśmy.

## Czego się nauczyliśmy (uzupełniać po każdej awarii)
- Webhook P24 przychodzi **tylko po udanej płatności**; przy błędzie P24 nic nie wysyła, więc strona podziękowania nie zna przyczyny.
- Render za Cloudflare: adres klienta jest w nagłówku `CF-Connecting-IP`, a nie w `req.ip`.
- Gmail SMTP: serwer Rendera nie ma wychodzącego IPv6 — łączymy się po adresie IPv4.
- Darmowy Supabase usypia projekt po tygodniu bez ruchu — monitor `/api/health` temu zapobiega.
