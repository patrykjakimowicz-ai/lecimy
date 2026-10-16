# Wdrożenie: GoDaddy (shared hosting) + backend osobno

Twój plan GoDaddy to zwykły shared hosting bez obsługi Node.js, więc strona
i backend muszą stanąć w dwóch różnych miejscach:

- **Statyczna strona** (`index.html`, `regulamin.html`, `polityka-prywatnosci.html`,
  `zamowienie.html`, `podziekowanie.html`, `style.css`, `script.js`, `brand_assets/`,
  `hero.jpg`, `images-1.jpeg`, `robots.txt`, `sitemap.xml`, `seats.js`) → **GoDaddy**.
- **Backend** (`server/`, obsługa Przelewy24 + wysyłka maili) → **osobny hosting
  z Node.js** (polecam [Render.com](https://render.com) — ma darmowy plan, wdrożenie
  z paczki plików lub repo w kilka minut. Railway / Fly.io / VPS też się nadają).

## Krok 1 — wdróż backend (Render lub podobny)

1. Załóż konto na Render.com, utwórz nową usługę typu **Web Service**.
2. Wgraj folder projektu (albo repo, jeśli masz git) — Render potrzebuje `package.json`,
   który już masz. Komenda startowa: `npm start` (już skonfigurowana).
3. W panelu Render ustaw **zmienne środowiskowe** (Environment) — to samo co w `.env`:
   - `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_SANDBOX`
   - `SITE_URL` = `https://lecimyposwoje.pl` (Twoja docelowa domena na GoDaddy)
   - `API_URL` = adres, który Render nada Twojej usłudze, np.
     `https://lecimyposwoje-api.onrender.com` (dowiesz się go po pierwszym wdrożeniu —
     wtedy wróć i uzupełnij tę zmienną)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
   - **Nie wgrywaj pliku `.env`** — ustawiasz te wartości bezpośrednio w panelu Render.
4. Po wdrożeniu sprawdź, czy backend żyje: wejdź na `https://<adres-render>/` — powinna
   pokazać się Twoja strona (Render też serwuje statyczne pliki, ale nieważne —
   liczy się, że serwer odpowiada).

## Krok 2 — podłącz frontend do backendu

1. Otwórz `zamowienie.html`, znajdź na górze `<script>` linię:
   ```js
   var API_BASE = '';
   ```
   Zmień na pełny adres backendu z Render, np.:
   ```js
   var API_BASE = 'https://lecimyposwoje-api.onrender.com';
   ```
2. Zrób to samo w `podziekowanie.html` (identyczna linia `var API_BASE = '';`).
3. To wszystko — CORS jest już obsłużony po stronie backendu (`server/index.mjs`),
   więc wywołania z GoDaddy do Render przejdą bez problemu.

## Krok 3 — wgraj statyczną stronę na GoDaddy

Przez File Manager w cPanel albo FTP, wgraj do `public_html/` (albo katalogu domeny)
**wyłącznie**:

```
index.html, regulamin.html, polityka-prywatnosci.html,
zamowienie.html, podziekowanie.html,
style.css, script.js, robots.txt, sitemap.xml,
brand_assets/, hero.jpg, images-1.jpeg
```

**NIE wgrywaj**: `server/`, `node_modules/`, `.env`, `package.json`, `package-lock.json`,
`serve.mjs`, `screenshot.mjs`, `.claude/`, `DEPLOY.md`, `hero.png`, `Hero 2.png` (te dwa
to nieużywane, ciężkie duplikaty zdjęcia — możesz je też po prostu usunąć z projektu).

## Krok 4 — SSL i sprawdzenie

1. Upewnij się, że w GoDaddy jest włączony darmowy certyfikat SSL (AutoSSL) i strona
   działa pod `https://lecimyposwoje.pl` (P24 wymaga HTTPS).
2. Przetestuj cały przepływ na żywo: wejdź na stronę, dodaj pakiet do koszyka, kliknij
   „Kupuję i płacę" — powinno przekierować do prawdziwej strony płatności Przelewy24.
3. Zrób jedną prawdziwą (małą) transakcję testową na sandboxie P24, zanim przełączysz
   `P24_SANDBOX=false`.

## Krok 5 — uzupełnij ostatnią rzecz

W `server/mailer.mjs` wciąż jest placeholder na link do platformy z kursem —
podmień `[UZUPEŁNIJ LINK DO PLATFORMY]` na prawdziwy adres, zanim ktokolwiek zapłaci.

## Dopiero teraz → zgłoszenie do weryfikacji w Przelewy24

Gdy powyższe działa end-to-end (prawdziwy zakup na sandboxie przechodzi, mail z dostępem
przychodzi), zgłoś konto do weryfikacji produkcyjnej w panelu Przelewy24.

---

# Płatności Stripe (zamiast Przelewy24)

Kod obu operatorów jest wdrożony jednocześnie; o tym, gdzie trafiają **nowe** zamówienia,
decyduje zmienna `PAYMENT_PROVIDER` (`stripe` albo `p24`, domyślnie `p24`). Webhooki obu działają zawsze.

1. Konto na stripe.com, uzupełnij dane firmy (do produkcji). W trybie testowym możesz zacząć od razu.
2. Panel -> Ustawienia -> Metody płatności: włącz karty, BLIK, Przelewy24, Apple Pay / Google Pay (waluta PLN).
3. Panel -> Deweloperzy -> Klucze API: skopiuj klucz tajny (`sk_test_...`, później `sk_live_...`).
4. Panel -> Deweloperzy -> Webhooki -> dodaj endpoint `https://<API_URL>/api/stripe/webhook`
   ze zdarzeniami: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Skopiuj sekret podpisu (`whsec_...`).
5. Na Render ustaw: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
6. Test: karta `4242 4242 4242 4242` (dowolna przyszła data i CVC) w trybie testowym.
   Lokalnie: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (poda tymczasowy `whsec_...`).
7. Produkcja: podmień klucze na `sk_live_...` i utwórz webhook także w trybie live (ma osobny sekret).
