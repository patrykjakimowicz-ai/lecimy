// Serwer produkcyjny: serwuje statyczną stronę + obsługuje backend płatności (Stripe / Przelewy24).
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

import { PACKAGES, ADDONS, SEAT_LIMITS, MARKETING_CONSENT_DISCOUNT, PRO_PACKAGE, toGrosze } from './products.mjs';
import { readProOffer } from './proOffer.mjs';
import { registerTransaction, verifyTransaction, isWebhookSignatureValid } from './przelewy24.mjs';
import { createCheckoutSession, constructWebhookEvent } from './stripe.mjs';
import { fulfillPaidOrder } from './fulfillment.mjs';
import { saveOrder, updateOrder, getOrder, countOrders, listOrders } from './orderStore.mjs';
import { appendConsent } from './consentLog.mjs';
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

// Aktywny operator płatności: 'stripe' albo 'p24'. Kod obu jest wdrożony naraz (webhooki obu działają),
// przełączasz tylko to, gdzie trafiają NOWE zamówienia. Domyślnie 'p24' — nic się nie zmienia bez jawnego ustawienia.
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'p24').toLowerCase();
if (!['stripe', 'p24'].includes(PAYMENT_PROVIDER)) {
  throw new Error(`Nieznany PAYMENT_PROVIDER="${PAYMENT_PROVIDER}" — dozwolone: stripe, p24.`);
}

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

// ── API: webhook Stripe ──────────────────────────────────────
// MUSI być przed express.json() — podpis Stripe liczony jest z surowego body.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.warn('[stripe-webhook] nieprawidłowy podpis — odrzucam:', err.message);
    return res.status(400).send('invalid signature');
  }

  try {
    const obj = event.data.object;
    const sessionId = obj.client_reference_id || obj.metadata?.sessionId;

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      // 'completed' przy płatności opóźnionej (np. przelew) ma payment_status 'unpaid' — czekamy wtedy na async_payment_succeeded.
      if (obj.payment_status !== 'paid') return res.status(200).send('OK');

      const order = sessionId && (await getOrder(sessionId));
      if (!order) {
        console.warn('[stripe-webhook] nieznane zamówienie', sessionId);
        return res.status(404).send('unknown session');
      }
      if (order.amount !== obj.amount_total || String(obj.currency).toUpperCase() !== order.currency) {
        console.warn('[stripe-webhook] kwota/waluta nie zgadza się z zamówieniem', { order, amount: obj.amount_total, currency: obj.currency });
        return res.status(400).send('amount mismatch');
      }
      // Stripe potrafi dostarczyć to samo zdarzenie kilkukrotnie — drugi raz nic nie robimy.
      if (order.status === 'paid') return res.status(200).send('OK');

      await fulfillPaidOrder({
        sessionId,
        order,
        siteUrl: SITE_URL,
        tag: 'stripe-webhook',
        patch: { provider: 'stripe', stripeCheckoutSessionId: obj.id, stripePaymentIntentId: obj.payment_intent || null },
      });
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      // Klient nie zapłacił — zwalniamy miejsce od razu, bez czekania na koniec rezerwacji.
      const order = sessionId && (await getOrder(sessionId));
      if (order && order.status === 'pending') await updateOrder(sessionId, { status: 'expired' });
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[stripe-webhook] błąd przetwarzania', err);
    // Odpowiedź inna niż 2xx — Stripe ponowi dostarczenie zdarzenia.
    res.status(500).send('internal error');
  }
});

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
    const { pakiet, addonMasterclass: addonRaw, imie, nazwisko, email, telefon: telefonRaw, zgodaMarketing, zgodaRegulamin, zgodaCyfrowa, attribution, faktura, zgodyTresc, oferta } = req.body || {};
    const telefon = MARKETING_ENABLED ? telefonRaw : null;

    // PRO kupuje się wyłącznie z osobistego linku po kwalifikacji — cena pochodzi z podpisanej oferty.
    const proOffer = pakiet === PRO_PACKAGE ? readProOffer(oferta) : null;
    if (pakiet === PRO_PACKAGE && !proOffer) {
      return res.status(400).json({ error: 'Link do oferty PRO jest nieprawidłowy albo wygasł. Napisz do nas, a wyślemy nowy.' });
    }
    if (!proOffer && (typeof pakiet !== 'string' || !Object.hasOwn(PACKAGES, pakiet))) {
      return res.status(400).json({ error: 'Nieznany pakiet.' });
    }
    const addonMasterclass = !proOffer && !!addonRaw; // PRO zawiera pełny zakres, bez dodatków
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
    if (proOffer && email.trim().toLowerCase() !== proOffer.email) {
      return res.status(400).json({ error: `Oferta PRO jest przypisana do adresu ${proOffer.email} — użyj tego adresu e-mail.` });
    }
    // Rabat za zgodę marketingową wymaga telefonu (SMS-y nie polecą donikąd) —
    // jeśli klient zaznaczył zgodę, ale nie podał telefonu, blokujemy całe zamówienie
    // zamiast po cichu policzyć pełną cenę bez rabatu, na który liczył.
    const marketingConsent = MARKETING_ENABLED && !proOffer && !!zgodaMarketing;
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

    let pricePln = (proOffer ? proOffer.cena : PACKAGES[pakiet]) + (addonMasterclass ? ADDONS.masterclass.price : 0);
    if (marketingConsent) pricePln -= MARKETING_CONSENT_DISCOUNT;
    const amountGrosze = toGrosze(pricePln);
    const sessionId = randomUUID();

    const descriptionParts = [pakiet];
    if (addonMasterclass) descriptionParts.push(ADDONS.masterclass.label);
    if (marketingConsent) descriptionParts.push(`rabat -${MARKETING_CONSENT_DISCOUNT}zł`);
    const description = descriptionParts.join(' + ');

    const order = {
      pakiet,
      addonMasterclass,
      ofertaPro: proOffer ? { cena: proOffer.cena, wazna: proOffer.expiresAt } : null,
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

    let redirectUrl;
    if (PAYMENT_PROVIDER === 'stripe') {
      stage = 'stripe';
      ({ redirectUrl } = await createCheckoutSession({
        sessionId,
        amount: amountGrosze,
        description,
        email,
        urlReturn: `${SITE_URL}/podziekowanie.html?sid=${sessionId}`,
        urlCancel: `${SITE_URL}/zamowienie.html`,
      }));
    } else {
      stage = 'przelewy24';
      ({ redirectUrl } = await registerTransaction({
        sessionId,
        amount: amountGrosze,
        description,
        email,
        urlReturn: `${SITE_URL}/podziekowanie.html?sid=${sessionId}`,
        urlStatus: `${API_URL}/api/przelewy24/webhook`,
      }));
    }

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

    await fulfillPaidOrder({
      sessionId: payload.sessionId,
      order,
      siteUrl: SITE_URL,
      tag: 'p24-webhook',
      patch: { orderId: payload.orderId },
    });

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
    res.set('Cache-Control', 'no-store').json({ ok: true, db: true, provider: PAYMENT_PROVIDER, time: new Date().toISOString() });
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

// ── API: odczyt osobistej oferty PRO (formularz zamówienia pokazuje pakiet i cenę z linku) ──
app.get('/api/pro-offer', readLimiter, (req, res) => {
  const offer = readProOffer(req.query.t);
  if (!offer) return res.status(404).set('Cache-Control', 'no-store').json({ error: 'Oferta nieprawidłowa albo wygasła.' });
  res.set('Cache-Control', 'no-store').json(offer);
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
  console.log(`Operator płatności dla nowych zamówień: ${PAYMENT_PROVIDER}`);
  console.log(`SITE_URL (strona / urlReturn): ${SITE_URL}`);
  console.log(`API_URL  (ten backend / webhook urlStatus): ${API_URL} — musi być publicznie dostępny po HTTPS.`);
});
