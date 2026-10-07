// Serwer produkcyjny: serwuje statyczną stronę + obsługuje backend Przelewy24.
//
// Uruchomienie:  node server/index.mjs   (albo: npm start)
// Wymaga pliku .env — patrz .env.example.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { PACKAGES, ADDONS, SEAT_LIMITS, MARKETING_CONSENT_DISCOUNT, toGrosze } from './products.mjs';
import { registerTransaction, verifyTransaction, isWebhookSignatureValid } from './przelewy24.mjs';
import { saveOrder, updateOrder, getOrder, countOrders, listOrders } from './orderStore.mjs';
import { appendConsent } from './consentLog.mjs';
import { sendOrderConfirmationEmail, sendOwnerNotification } from './mailer.mjs';
import { ensureCustomerAccount } from './supabaseAuth.mjs';
import { EDITION } from './edition.mjs';
import { LEGAL_VERSIONS } from './legalVersions.mjs';
import { legalFingerprint } from './legalDocs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Publicznie serwujemy WYŁĄCZNIE folder public/ — nigdy katalog główny projektu (server/, dane, .env itd.).
const ROOT = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

// SITE_URL — gdzie stoi statyczna strona (np. GoDaddy, jeśli backend jest hostowany osobno,
// bo shared hosting zwykle nie uruchomi Node.js). API_URL — gdzie stoi TEN serwer (backend).
// Jeśli strona i backend są na tym samym hoście, oba mogą wskazywać na ten sam adres
// (albo po prostu zostaw domyślne wartości — wtedy wszystko dzieje się na PORT lokalnie).
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const API_URL = process.env.API_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;

// Rabat za zgodę marketingową (+ telefon) — wyłączony do czasu zakończenia weryfikacji w P24.
// Włączenie: MARKETING_ENABLED=true w zmiennych środowiskowych Rendera.
const MARKETING_ENABLED = process.env.MARKETING_ENABLED === 'true';

// Prawdziwy adres IP klienta. Render przepuszcza ruch przez Cloudflare, więc req.ip to adres serwera
// pośredniczącego, a nie klienta. Cloudflare dopisuje adres klienta w CF-Connecting-IP (a w X-Forwarded-For jest pierwszy).
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip;
}

const app = express();
app.set('trust proxy', 1); // Render stoi za proxy — potrzebne do poprawnego req.ip i rate limitu
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // CSP wyłączone: strona ma inline'owe skrypty
app.use(express.json({ limit: '20kb' }));

// CORS — tylko własne originy (strona na Netlify/domena + lokalny dev).
const ALLOWED_ORIGINS = new Set(
  [
    SITE_URL,
    API_URL,
    'https://lecimyposwoje.pl',
    'https://www.lecimyposwoje.pl',
    ...(process.env.EXTRA_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()),
    ...(process.env.NODE_ENV === 'production' ? [] : [`http://localhost:${PORT}`, 'http://localhost:3000']),
  ]
    .filter(Boolean)
    .map((o) => o.replace(/\/$/, ''))
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Limit zapytań: tworzenie zamówienia kosztuje (zapis + rejestracja w P24), więc ścisły limit.
const createOrderLimiter = rateLimit({
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.' },
});
// Limit miejsc (VIP): miejsce zajmuje zamówienie opłacone albo nieopłacone złożone w ciągu ostatnich 30 minut
// (klient jest właśnie na stronie płatności). Porzucone zamówienia zwalniają miejsce po tym czasie.
const SEAT_HOLD_MS = 30 * 60 * 1000;
async function seatsTaken(pakiet) {
  const now = Date.now();
  const orders = await listOrders({ pakiet, edycja: EDITION.name });
  return orders.filter(
    (o) => o.status === 'paid' || (o.status === 'pending' && now - Date.parse(o.createdAt || o.updatedAt) < SEAT_HOLD_MS)
  ).length;
}
// Sprawdzenie limitu i zapis zamówienia muszą iść po kolei — inaczej dwa równoczesne zamówienia zajęłyby ostatnie miejsce.
let seatLock = Promise.resolve();
function withSeatLock(fn) {
  const run = seatLock.then(fn, fn);
  seatLock = run.catch(() => {});
  return run;
}

const readLimiter = rateLimit({ keyGenerator: (req) => ipKeyGenerator(clientIp(req)), windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

// ── STATIC SITE ──────────────────────────────────────────────
app.use(express.static(ROOT));

// ── API: utworzenie zamówienia + rejestracja transakcji w P24 ──
app.post('/api/create-order', createOrderLimiter, async (req, res) => {
  let stage = 'walidacja';
  try {
    // Sprzedaż jest zamykana przed startem edycji — po terminie nie przyjmujemy zamówień.
    if (Date.now() >= Date.parse(EDITION.salesCloseISO)) {
      return res.status(400).json({ error: `Sprzedaż tej edycji została zamknięta (${EDITION.salesCloseLabel}).` });
    }
    const { pakiet, addonMasterclass, imie, nazwisko, email, telefon: telefonRaw, zgodaMarketing, zgodaRegulamin, zgodaCyfrowa, attribution, faktura, zgodyTresc } = req.body || {};
    const telefon = MARKETING_ENABLED ? telefonRaw : null;

    if (typeof pakiet !== 'string' || !Object.hasOwn(PACKAGES, pakiet)) {
      return res.status(400).json({ error: 'Nieznany pakiet.' });
    }
    if (!imie || !nazwisko || !email) {
      return res.status(400).json({ error: 'Uzupełnij imię, nazwisko i e-mail.' });
    }
    if (!zgodaRegulamin || !zgodaCyfrowa) {
      return res.status(400).json({ error: 'Musisz zaakceptować obie wymagane zgody.' });
    }
    const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
    if (!isStr(imie, 80) || !isStr(nazwisko, 80) || !isStr(email, 254) || (telefon && !isStr(telefon, 30))) {
      return res.status(400).json({ error: 'Nieprawidłowe dane w formularzu.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    }
    // Rabat za zgodę marketingową wymaga telefonu (SMS-y nie polecą donikąd) —
    // jeśli klient zaznaczył zgodę, ale nie podał telefonu, blokujemy całe zamówienie
    // zamiast po cichu policzyć pełną cenę bez rabatu, na który liczył.
    const marketingConsent = MARKETING_ENABLED && !!zgodaMarketing;
    if (marketingConsent && !telefon) {
      return res.status(400).json({
        error: 'Podaj numer telefonu, żeby odebrać rabat -50 zł za zgodę marketingową (albo odznacz tę zgodę).',
      });
    }


    // Dane do faktury (opcjonalne) — walidacja po stronie serwera.
    function nipValid(raw) {
      let d = String(raw || '').replace(/[^0-9]/g, '');
      if (d.length === 12 && d.startsWith('00')) d = d.slice(2);
      if (d.length !== 10) return null;
      const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
      const sum = w.reduce((acc, wt, i) => acc + wt * Number(d[i]), 0);
      return sum % 11 === Number(d[9]) ? d : null;
    }
    let cleanFaktura = null;
    if (faktura && typeof faktura === 'object') {
      const nip = nipValid(faktura.nip);
      const fields = { firma: 150, ulica: 120, kod: 10, miasto: 80 };
      const ok = nip && Object.entries(fields).every(([k, max]) => isStr(faktura[k], max));
      if (!ok) return res.status(400).json({ error: 'Sprawdź dane do faktury (nazwa firmy, NIP, adres).' });
      cleanFaktura = {
        firma: faktura.firma.trim(), nip, ulica: faktura.ulica.trim(),
        kod: faktura.kod.trim(), miasto: faktura.miasto.trim(),
      };
    }

    // Źródło ruchu (UTM / klik-ID) — tylko znane klucze, krótkie stringi.
    const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid'];
    const cleanAttribution = {};
    if (attribution && typeof attribution === 'object') {
      for (const k of ATTR_KEYS) {
        if (typeof attribution[k] === 'string' && attribution[k]) cleanAttribution[k] = attribution[k].slice(0, 200);
      }
    }

    let pricePln = PACKAGES[pakiet] + (addonMasterclass ? ADDONS.masterclass.price : 0);
    if (marketingConsent) pricePln -= MARKETING_CONSENT_DISCOUNT;
    const amountGrosze = toGrosze(pricePln);
    const sessionId = randomUUID();

    const descriptionParts = [pakiet];
    if (addonMasterclass) descriptionParts.push(ADDONS.masterclass.label);
    if (marketingConsent) descriptionParts.push(`rabat -${MARKETING_CONSENT_DISCOUNT}zł`);
    const description = descriptionParts.join(' + ');

    const order = {
      pakiet,
      addonMasterclass: !!addonMasterclass,
      imie,
      nazwisko,
      email,
      telefon: telefon || null,
      zgodaRegulamin: !!zgodaRegulamin,
      zgodaCyfrowa: !!zgodaCyfrowa,
      zgodaMarketing: marketingConsent,
      attribution: cleanAttribution,
      faktura: cleanFaktura,
      amount: amountGrosze,
      currency: 'PLN',
      edycja: EDITION.name,
      createdAt: new Date().toISOString(),
      status: 'pending', // pending -> paid
    };
    stage = 'zapis-zamowienia';
    const seatLimit = SEAT_LIMITS[pakiet];
    const soldOut = await withSeatLock(async () => {
      if (seatLimit && (await seatsTaken(pakiet)) >= seatLimit) return true;
      await saveOrder(sessionId, order);
      return false;
    });
    if (soldOut) {
      return res.status(409).json({ error: `Wszystkie miejsca w pakiecie ${pakiet} (${seatLimit}) zostały zajęte. Wybierz inny pakiet.` });
    }

    // Archiwizacja faktu i momentu wyrażenia zgód — niezależnie od stanu zamówienia,
    // które może się później zmieniać (status płatności itd.).
    stage = 'zapis-zgod';
    // Dowód: odciski dokumentów + brzmienie zgód widoczne dla klienta w formularzu (długość ograniczona).
    const fingerprint = await legalFingerprint().catch((e) => { console.error('[consent] odcisk dokumentów:', e.message); return {}; });
    const clip = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 700) : null);
    await appendConsent({
      sessionId,
      email,
      imie,
      nazwisko,
      telefon: telefon || null,
      zgodaRegulamin: !!zgodaRegulamin,
      zgodaCyfrowa: !!zgodaCyfrowa,
      zgodaMarketing: marketingConsent,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
      regulaminWersja: LEGAL_VERSIONS.regulamin,
      politykaWersja: LEGAL_VERSIONS.polityka,
      regulaminSha256: fingerprint.regulamin || null,
      politykaSha256: fingerprint.polityka || null,
      zgodyTresc: { regulamin: clip(zgodyTresc && zgodyTresc.regulamin), cyfrowa: clip(zgodyTresc && zgodyTresc.cyfrowa) },
      edycja: EDITION.name,
    });

    stage = 'przelewy24';
    const { redirectUrl } = await registerTransaction({
      sessionId,
      amount: amountGrosze,
      description,
      email,
      urlReturn: `${SITE_URL}/podziekowanie.html?sid=${sessionId}`,
      urlStatus: `${API_URL}/api/przelewy24/webhook`,
    });

    res.json({ redirectUrl });
  } catch (err) {
    console.error(`[create-order] etap=${stage}`, err);
    res.status(500).json({ error: 'Wystąpił błąd serwera. Spróbuj ponownie lub napisz do nas. (kod: ' + stage + ')' });
  }
});

// ── API: webhook wywoływany przez Przelewy24 po opłaceniu ──────
app.post('/api/przelewy24/webhook', async (req, res) => {
  const payload = req.body || {};

  try {
    if (!isWebhookSignatureValid(payload)) {
      console.warn('[p24-webhook] nieprawidłowy podpis (sign) — odrzucam', payload);
      return res.status(400).send('invalid sign');
    }

    const order = await getOrder(payload.sessionId);
    if (!order) {
      console.warn('[p24-webhook] nieznane sessionId', payload.sessionId);
      return res.status(404).send('unknown session');
    }

    if (order.amount !== payload.amount) {
      console.warn('[p24-webhook] kwota nie zgadza się z zamówieniem', { order, payload });
      return res.status(400).send('amount mismatch');
    }

    // Zamówienie już obsłużone wcześniej (P24 potrafi wysłać powiadomienie kilkukrotnie) — potwierdź i zakończ.
    if (order.status === 'paid') {
      return res.status(200).send('OK');
    }

    const { ok } = await verifyTransaction({
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: payload.currency,
    });

    if (!ok) {
      console.error('[p24-webhook] weryfikacja transakcji nie powiodła się', payload);
      return res.status(502).send('verify failed');
    }

    await updateOrder(payload.sessionId, { status: 'paid', orderId: payload.orderId });

    // Konto klienta w Supabase (bez hasła) + link do ustawienia hasła. Błąd tutaj nie cofa płatności:
    // mail i tak wychodzi (z informacją, jak odzyskać dostęp), a Ty dostajesz alert.
    let setPasswordUrl = null;
    let accountError = null;
    try {
      setPasswordUrl = await ensureCustomerAccount(order.email, `${SITE_URL}/logowanie.html`);
    } catch (accErr) {
      accountError = accErr;
      console.error('[p24-webhook] płatność potwierdzona, ale nie udało się założyć konta klienta:', accErr);
    }

    let mailError = null;
    try {
      await sendOrderConfirmationEmail({ ...order, sessionId: payload.sessionId, setPasswordUrl });
    } catch (mailErr) {
      mailError = mailErr;
      // Płatność jest już potwierdzona i zapisana — błąd maila nie powinien cofać tego faktu,
      // ale trzeba go głośno zalogować, żeby ręcznie dosłać dostęp klientowi.
      console.error('[p24-webhook] płatność potwierdzona, ale wysyłka e-maila nie powiodła się:', mailErr);
    }

    // Płatność mogła dojść po czasie rezerwacji miejsca (np. przelew tradycyjny) — wtedy limit może zostać przekroczony.
    const extraProblems = [];
    const seatLimit = SEAT_LIMITS[order.pakiet];
    if (seatLimit) {
      try {
        const paid = (await listOrders({ pakiet: order.pakiet, edycja: order.edycja || EDITION.name })).filter((o) => o.status === 'paid').length;
        if (paid > seatLimit) extraProblems.push(`Przekroczony limit miejsc ${order.pakiet}: opłaconych ${paid} z ${seatLimit}. Zdecyduj, czy przyjmujesz uczestnika, czy zwracasz płatność.`);
      } catch (seatErr) {
        console.error('[p24-webhook] nie udało się sprawdzić limitu miejsc:', seatErr.message);
      }
    }

    // Powiadomienie dla właściciela: nowa sprzedaż + dane do faktury + ewentualne problemy.
    try {
      await sendOwnerNotification({ order: { ...order, sessionId: payload.sessionId }, accountError, mailError, extraProblems });
    } catch (ownerErr) {
      console.error('[p24-webhook] nie udało się wysłać powiadomienia do właściciela:', ownerErr.message);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[p24-webhook] błąd przetwarzania', err);
    // Odpowiedź inna niż 200 — P24 spróbuje wysłać powiadomienie ponownie później.
    res.status(500).send('internal error');
  }
});

// ── API: kontrola stanu (monitoring + utrzymanie bazy w gotowości) ──
// Odpytywany co kilka minut przez UptimeRobot: sprawdza, czy serwer i baza żyją, a jednocześnie
// generuje aktywność w Supabase, dzięki czemu darmowy projekt nie jest usypiany po tygodniu bez ruchu.
// Nie zwraca żadnych danych — tylko 200/503 i znacznik czasu.
app.get('/api/health', readLimiter, async (req, res) => {
  try {
    await countOrders();
    res.set('Cache-Control', 'no-store').json({ ok: true, db: true, time: new Date().toISOString() });
  } catch (err) {
    console.error('[health] baza niedostępna:', err.message);
    res.status(503).set('Cache-Control', 'no-store').json({ ok: false, db: false, time: new Date().toISOString() });
  }
});

// ── API: wolne miejsca w pakietach z limitem (cennik i formularz zamówienia) ──
app.get('/api/seats', readLimiter, async (req, res) => {
  try {
    const out = {};
    for (const [pakiet, limit] of Object.entries(SEAT_LIMITS)) {
      out[pakiet] = { limit, left: Math.max(0, limit - (await seatsTaken(pakiet))) };
    }
    res.set('Cache-Control', 'no-store').json(out);
  } catch (err) {
    console.error('[seats] błąd:', err.message);
    res.status(503).set('Cache-Control', 'no-store').json({ error: 'unavailable' });
  }
});

// ── API: status zamówienia (do ewentualnego odpytania ze strony podziękowania) ──
app.get('/api/order/:sessionId', readLimiter, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.sessionId)) return res.status(404).json({ error: 'not found' });
  const order = await getOrder(req.params.sessionId);
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json({ status: order.status, pakiet: order.pakiet, amount: order.amount, currency: order.currency });
});

app.listen(PORT, () => {
  console.log(`Serwer działa: http://localhost:${PORT}`);
  console.log(`SITE_URL (strona / urlReturn): ${SITE_URL}`);
  console.log(`API_URL  (ten backend / webhook urlStatus): ${API_URL} — musi być publicznie dostępny po HTTPS.`);
});
