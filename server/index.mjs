// Serwer produkcyjny: serwuje statyczną stronę + obsługuje backend Przelewy24.
//
// Uruchomienie:  node server/index.mjs   (albo: npm start)
// Wymaga pliku .env — patrz .env.example.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { PACKAGES, ADDONS, MARKETING_CONSENT_DISCOUNT, toGrosze } from './products.mjs';
import { registerTransaction, verifyTransaction, isWebhookSignatureValid } from './przelewy24.mjs';
import { saveOrder, updateOrder, getOrder } from './orderStore.mjs';
import { appendConsent } from './consentLog.mjs';
import { sendOrderConfirmationEmail } from './mailer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

// SITE_URL — gdzie stoi statyczna strona (np. GoDaddy, jeśli backend jest hostowany osobno,
// bo shared hosting zwykle nie uruchomi Node.js). API_URL — gdzie stoi TEN serwer (backend).
// Jeśli strona i backend są na tym samym hoście, oba mogą wskazywać na ten sam adres
// (albo po prostu zostaw domyślne wartości — wtedy wszystko dzieje się na PORT lokalnie).
const SITE_URL = process.env.SITE_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const API_URL = process.env.API_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json());

// CORS — zabezpieczenie na wypadek, gdy panel podglądu serwuje stronę
// pod innym originem niż ten serwer (wtedy przeglądarka blokuje fetch
// już na etapie preflight, co objawia się jako "Load failed").
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── STATIC SITE ──────────────────────────────────────────────
app.use(express.static(ROOT));

// ── API: utworzenie zamówienia + rejestracja transakcji w P24 ──
app.post('/api/create-order', async (req, res) => {
  try {
    const { pakiet, addonMasterclass, imie, nazwisko, email, telefon, zgodaMarketing, zgodaRegulamin, zgodaCyfrowa } = req.body || {};

    if (!PACKAGES[pakiet]) {
      return res.status(400).json({ error: 'Nieznany pakiet.' });
    }
    if (!imie || !nazwisko || !email) {
      return res.status(400).json({ error: 'Uzupełnij imię, nazwisko i e-mail.' });
    }
    if (!zgodaRegulamin || !zgodaCyfrowa) {
      return res.status(400).json({ error: 'Musisz zaakceptować obie wymagane zgody.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    }
    // Rabat za zgodę marketingową wymaga telefonu (SMS-y nie polecą donikąd) —
    // jeśli klient zaznaczył zgodę, ale nie podał telefonu, blokujemy całe zamówienie
    // zamiast po cichu policzyć pełną cenę bez rabatu, na który liczył.
    const marketingConsent = !!zgodaMarketing;
    if (marketingConsent && !telefon) {
      return res.status(400).json({
        error: 'Podaj numer telefonu, żeby odebrać rabat -50 zł za zgodę marketingową (albo odznacz tę zgodę).',
      });
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
      amount: amountGrosze,
      currency: 'PLN',
      status: 'pending', // pending -> paid
    };
    await saveOrder(sessionId, order);

    // Archiwizacja faktu i momentu wyrażenia zgód — niezależnie od stanu zamówienia,
    // które może się później zmieniać (status płatności itd.).
    await appendConsent({
      sessionId,
      email,
      imie,
      nazwisko,
      telefon: telefon || null,
      zgodaRegulamin: !!zgodaRegulamin,
      zgodaCyfrowa: !!zgodaCyfrowa,
      zgodaMarketing: marketingConsent,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });

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
    console.error('[create-order]', err);
    res.status(500).json({ error: err.message || 'Wystąpił błąd serwera.' });
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

    try {
      await sendOrderConfirmationEmail({ ...order, sessionId: payload.sessionId });
    } catch (mailErr) {
      // Płatność jest już potwierdzona i zapisana — błąd maila nie powinien cofać tego faktu,
      // ale trzeba go głośno zalogować, żeby ręcznie dosłać dostęp klientowi.
      console.error('[p24-webhook] płatność potwierdzona, ale wysyłka e-maila nie powiodła się:', mailErr);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[p24-webhook] błąd przetwarzania', err);
    // Odpowiedź inna niż 200 — P24 spróbuje wysłać powiadomienie ponownie później.
    res.status(500).send('internal error');
  }
});

// ── API: status zamówienia (do ewentualnego odpytania ze strony podziękowania) ──
app.get('/api/order/:sessionId', async (req, res) => {
  const order = await getOrder(req.params.sessionId);
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json({ status: order.status, pakiet: order.pakiet });
});

app.listen(PORT, () => {
  console.log(`Serwer działa: http://localhost:${PORT}`);
  console.log(`SITE_URL (strona / urlReturn): ${SITE_URL}`);
  console.log(`API_URL  (ten backend / webhook urlStatus): ${API_URL} — musi być publicznie dostępny po HTTPS.`);
});
