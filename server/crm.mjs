// CRM leadów PRO: ankieta kwalifikacyjna (public/pro.html) + panel sprzedawców (public/crm.html).
//
// Ankieta zapisuje odpowiedzi po każdym kroku (porzucone zgłoszenia też widać w CRM jako „niedokończone").
// Przeglądarka losuje własny token (64 znaki hex); id leada to skrót SHA-256 tokenu, więc znajomość id
// z panelu nie pozwala nikomu nadpisać cudzego zgłoszenia.
//
// Logowanie do panelu: te same hasła co generator ofert PRO (PRO_SELLERS="Ania:haslo1,Tomek:haslo2").
// Sesja to podpisany HMAC token (klucz PRO_OFFER_SECRET), bez dodatkowych tabel i zmiennych.

import express from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { sellerForPassword } from './proOffer.mjs';
import { getLead, saveLead, listLeads, deleteLead } from './leadStore.mjs';
import { sendLeadNotification } from './mailer.mjs';

// Opcje ankiety - te same napisy co w pro.html. Serwer przyjmuje wyłącznie wartości z tych list.
export const SURVEY = {
  wiek: ['poniżej 18', '18-24', '25-34', '35-44', '45+'],
  zajecie: ['etat', 'własna firma', 'studia', 'nie pracuję', 'inne'],
  blokady: [
    'brak dyscypliny i prokrastynacja',
    'brak energii i radości z życia',
    'finanse i stres o pieniądze',
    'lęki, niepewność, blokady w głowie',
    'złe otoczenie i relacje',
    'brak sensu i kierunku',
  ],
  gotowosc: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  budzet: ['tak, mam środki', 'tak, w ratach', 'wolę tańszą opcję samodzielną', 'nie stać mnie teraz'],
  start: ['od zaraz', 'w ciągu miesiąca', 'dopiero się rozglądam'],
};
const TEXT_MIN = 20;
const TEXT_MAX = 2000;

// Etapy lejka sprzedaży (kolejność = kolejność w panelu).
export const STATUSES = [
  'Nowy lead',
  'Po kwalifikacji',
  'Umówiona rozmowa',
  'Rozmowa odbyta',
  'Follow-up',
  'Sprzedane PRO',
  'Downsell',
  'Odrzucone',
];

// Budżet z odpowiedzi → kod do filtrów + segment (który ekran końcowy widzi klient).
const BUDZET_KOD = {
  'tak, mam środki': 'ma',
  'tak, w ratach': 'raty',
  'wolę tańszą opcję samodzielną': 'tansza',
  'nie stać mnie teraz': 'brak',
};
function segmentFor(budzet) {
  const kod = BUDZET_KOD[budzet];
  if (kod === 'ma' || kod === 'raty') return 'pro';
  if (kod === 'tansza') return 'downsell';
  return 'brak_budzetu';
}

const CONSENT_TEXT =
  'Akceptuję regulamin i politykę prywatności oraz zgadzam się na kontakt telefoniczny i mailowy w sprawie oferty Lecimy po swoje PRO.';

const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid'];

const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const leadIdFor = (token) => createHash('sha256').update(token).digest('hex').slice(0, 32);

/** Odpowiedzi z ankiety: tylko znane pola i dozwolone wartości (reszta jest pomijana). */
function cleanAnswers(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of ['wiek', 'zajecie', 'gotowosc', 'budzet', 'start']) {
    if (SURVEY[k].includes(a[k])) out[k] = a[k];
  }
  if (Array.isArray(a.blokady)) {
    const b = a.blokady.filter((x) => SURVEY.blokady.includes(x));
    if (b.length) out.blokady = [...new Set(b)];
  }
  for (const k of ['probowal', 'cel']) {
    if (typeof a[k] === 'string' && a[k].trim()) out[k] = a[k].trim().slice(0, TEXT_MAX);
  }
  return out;
}

function cleanAttribution(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const k of ATTR_KEYS) if (typeof raw[k] === 'string' && raw[k]) out[k] = raw[k].slice(0, 200);
    if (typeof raw.referrer === 'string' && raw.referrer) out.referrer = raw.referrer.slice(0, 300);
  }
  return out;
}

// ── Sesja panelu ─────────────────────────────────────────────
const SESSION_HOURS = 12;
const SESSION_HOURS_REMEMBER = 30 * 24;

function sessionKey() {
  const s = process.env.PRO_OFFER_SECRET;
  if (!s || s.length < 32) throw new Error('Brak PRO_OFFER_SECRET (min. 32 znaki) - logowanie do CRM wyłączone.');
  return s;
}
function signSession(body) {
  // Prefiks „crm:" - podpis sesji nie może posłużyć jako podpis oferty PRO (ten sam klucz) i odwrotnie.
  return createHmac('sha256', sessionKey()).update(`crm:${body}`).digest('base64url');
}
function createSession(name, hours) {
  const body = Buffer.from(JSON.stringify({ n: name, x: Date.now() + hours * 3600 * 1000 })).toString('base64url');
  return `${body}.${signSession(body)}`;
}
function readSession(token) {
  if (typeof token !== 'string' || token.length > 500) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let expected;
  try { expected = signSession(body); } catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let o;
  try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof o.n !== 'string' || !(o.x > Date.now())) return null;
  return { name: o.n, expiresAt: o.x };
}

function requireSeller(req, res, next) {
  const auth = String(req.headers.authorization || '');
  const session = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!session) return res.status(401).set('Cache-Control', 'no-store').json({ error: 'Sesja wygasła - zaloguj się ponownie.' });
  req.seller = session.name;
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * @param {{ clientIp: (req) => string, limiter: (opts) => Function, siteUrl: string }} deps
 */
export function crmRouter({ clientIp, limiter, siteUrl }) {
  const router = express.Router();

  // ── Ankieta: zapis postępu po każdym kroku ──
  const surveyLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 120 });
  const submitLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 10 });
  const loginLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20 });
  const crmLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

  function tokenOf(req) {
    const t = req.body && req.body.token;
    return typeof t === 'string' && /^[0-9a-f]{64}$/.test(t) ? t : null;
  }

  router.post('/api/lead/progress', surveyLimiter, async (req, res) => {
    const token = tokenOf(req);
    const krok = Number(req.body && req.body.krok);
    if (!token || !Number.isInteger(krok) || krok < 1 || krok > 9) return res.status(400).json({ error: 'bad request' });
    try {
      const id = leadIdFor(token);
      const cur = await getLead(id);
      if (cur && cur.ukonczona) return res.json({ ok: true }); // zgłoszenie już wysłane - nic nie nadpisujemy
      const now = new Date().toISOString();
      await saveLead({
        ...(cur || {
          id,
          createdAt: now,
          ukonczona: false,
          status: 'Nowy lead',
          notatki: [],
          historia: [],
          zrodlo: cleanAttribution(req.body.zrodlo),
        }),
        krok: Math.max(krok, (cur && cur.krok) || 0),
        odpowiedzi: { ...((cur && cur.odpowiedzi) || {}), ...cleanAnswers(req.body.odpowiedzi) },
        ostatniaAktywnosc: now,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[lead-progress]', err.message);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // ── Ankieta: wysłanie zgłoszenia z danymi kontaktowymi ──
  router.post('/api/lead/submit', submitLimiter, async (req, res) => {
    const token = tokenOf(req);
    if (!token) return res.status(400).json({ error: 'Odśwież stronę i spróbuj ponownie.' });
    const { kontakt, zgoda } = req.body || {};
    const odp = cleanAnswers(req.body.odpowiedzi);

    const missing = ['wiek', 'zajecie', 'gotowosc', 'budzet', 'start'].filter((k) => !odp[k]);
    if (!odp.blokady) missing.push('blokady');
    for (const k of ['probowal', 'cel']) if (!odp[k] || odp[k].length < TEXT_MIN) missing.push(k);
    if (missing.length) return res.status(400).json({ error: 'Uzupełnij wszystkie pytania ankiety.', missing });

    const k = kontakt && typeof kontakt === 'object' ? kontakt : {};
    const email = typeof k.email === 'string' ? k.email.trim().toLowerCase() : '';
    const telefon = typeof k.telefon === 'string' ? k.telefon.replace(/[\s()-]/g, '') : '';
    if (!isStr(k.imie, 60) || k.imie.trim().length < 2 || !isStr(k.nazwisko, 80) || k.nazwisko.trim().length < 2) {
      return res.status(400).json({ error: 'Podaj imię i nazwisko.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    }
    if (!/^\+\d{8,15}$/.test(telefon)) return res.status(400).json({ error: 'Podaj poprawny numer telefonu.' });
    if (k.nick != null && (typeof k.nick !== 'string' || k.nick.length > 60)) {
      return res.status(400).json({ error: 'Nick może mieć maksymalnie 60 znaków.' });
    }
    if (zgoda !== true) return res.status(400).json({ error: 'Zaznacz zgodę, żebyśmy mogli się z Tobą skontaktować.' });

    try {
      const id = leadIdFor(token);
      const cur = await getLead(id);
      if (cur && cur.ukonczona) return res.json({ ok: true, segment: cur.segment });
      const now = new Date().toISOString();
      const segment = segmentFor(odp.budzet);
      const lead = await saveLead({
        ...(cur || { id, createdAt: now, notatki: [], historia: [], zrodlo: cleanAttribution(req.body.zrodlo) }),
        ukonczona: true,
        krok: 9,
        wyslanoAt: now,
        ostatniaAktywnosc: now,
        status: 'Nowy lead',
        odpowiedzi: odp,
        segment,
        budzet: BUDZET_KOD[odp.budzet],
        niepelnoletni: odp.wiek === 'poniżej 18',
        kontakt: {
          imie: k.imie.trim(),
          nazwisko: k.nazwisko.trim(),
          email,
          telefon,
          nick: typeof k.nick === 'string' && k.nick.trim() ? k.nick.trim() : null,
        },
        zgoda: { tresc: CONSENT_TEXT, at: now, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
        przypisany: (cur && cur.przypisany) || null,
        nastepnyKontakt: (cur && cur.nastepnyKontakt) || null,
      });
      sendLeadNotification({ lead, crmUrl: `${siteUrl}/crm.html#lead=${id}` }).catch((e) =>
        console.error('[lead-submit] powiadomienie mailowe:', e.message)
      );
      res.json({ ok: true, segment });
    } catch (err) {
      console.error('[lead-submit]', err.message);
      res.status(500).json({ error: 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę.' });
    }
  });

  // ── Panel: logowanie ──
  router.post('/api/crm/login', loginLimiter, (req, res) => {
    const { haslo, zapamietaj } = req.body || {};
    const name = sellerForPassword(haslo);
    if (!name) return res.status(401).json({ error: 'Nieprawidłowe hasło.' });
    try {
      const token = createSession(name, zapamietaj ? SESSION_HOURS_REMEMBER : SESSION_HOURS);
      console.log(`[crm] logowanie: ${name}`);
      res.set('Cache-Control', 'no-store').json({ token, name });
    } catch (err) {
      res.status(503).json({ error: err.message });
    }
  });

  router.get('/api/crm/me', crmLimiter, requireSeller, (req, res) => res.json({ name: req.seller }));

  // ── Panel: lista leadów + słowniki do filtrów ──
  router.get('/api/crm/leads', crmLimiter, requireSeller, async (req, res) => {
    try {
      const sellers = (process.env.PRO_SELLERS || '')
        .split(',')
        .map((e) => e.slice(0, e.indexOf(':')).trim())
        .filter(Boolean);
      res.json({ leads: await listLeads(), statuses: STATUSES, survey: SURVEY, sellers });
    } catch (err) {
      console.error('[crm-leads]', err.message);
      res.status(503).json({ error: 'Baza niedostępna - spróbuj za chwilę.' });
    }
  });

  // ── Panel: zmiana statusu / opiekuna / terminu kontaktu, notatka ──
  router.post('/api/crm/leads/:id', crmLimiter, requireSeller, async (req, res) => {
    if (!/^[0-9a-f]{32}$/.test(req.params.id)) return res.status(404).json({ error: 'not found' });
    try {
      const lead = await getLead(req.params.id);
      if (!lead) return res.status(404).json({ error: 'Nie ma takiego leada.' });
      const { status, przypisany, nastepnyKontakt, notatka, tylkoJesliWolny } = req.body || {};
      const now = new Date().toISOString();
      const zmiany = [];

      // „Biorę" z listy: dwie osoby klikające naraz - lead dostaje tylko pierwsza.
      if (tylkoJesliWolny && lead.przypisany && lead.przypisany !== req.seller) {
        return res.status(409).json({ error: `Ten lead ma już opiekuna: ${lead.przypisany}.`, lead });
      }

      if (status !== undefined) {
        if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Nieznany status.' });
        if (status !== lead.status) { zmiany.push(`status: ${lead.status} → ${status}`); lead.status = status; }
      }
      if (przypisany !== undefined) {
        const p = przypisany === null || przypisany === '' ? null : String(przypisany).trim().slice(0, 60);
        if (p !== (lead.przypisany || null)) { zmiany.push(`opiekun: ${p || 'brak'}`); lead.przypisany = p; }
      }
      if (nastepnyKontakt !== undefined) {
        const d = nastepnyKontakt ? new Date(nastepnyKontakt) : null;
        if (d && Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Nieprawidłowa data kontaktu.' });
        const iso = d ? d.toISOString() : null;
        if (iso !== (lead.nastepnyKontakt || null)) { zmiany.push(iso ? `następny kontakt: ${iso}` : 'usunięto termin kontaktu'); lead.nastepnyKontakt = iso; }
      }
      if (typeof notatka === 'string' && notatka.trim()) {
        lead.notatki = [...(lead.notatki || []), { at: now, autor: req.seller, tekst: notatka.trim().slice(0, 4000) }];
      }
      if (zmiany.length) lead.historia = [...(lead.historia || []), ...zmiany.map((z) => ({ at: now, autor: req.seller, zmiana: z }))];
      res.json({ lead: await saveLead(lead) });
    } catch (err) {
      console.error('[crm-update]', err.message);
      res.status(500).json({ error: 'Nie udało się zapisać zmian.' });
    }
  });

  router.post('/api/crm/leads/:id/delete', crmLimiter, requireSeller, async (req, res) => {
    if (!/^[0-9a-f]{32}$/.test(req.params.id)) return res.status(404).json({ error: 'not found' });
    try {
      await deleteLead(req.params.id);
      console.log(`[crm] ${req.seller} usunął lead ${req.params.id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm-delete]', err.message);
      res.status(500).json({ error: 'Nie udało się usunąć leada.' });
    }
  });

  // ── Panel: import leadów ze starego CRM (eksport CSV z Lovable) ──
  // Panel parsuje CSV i wysyła wiersze partiami (limit body 20 kB). Id liczone z e-maila i telefonu,
  // więc ponowny import tego samego pliku pomija istniejące leady i nie nadpisuje zmian zrobionych w panelu.
  const OLD_STATUS = { 'Umówiona rozmowa z closerem': 'Umówiona rozmowa' };
  router.post('/api/crm/import', crmLimiter, requireSeller, async (req, res) => {
    const { wiersze, plik, eksportAt } = req.body || {};
    if (!Array.isArray(wiersze) || !wiersze.length || wiersze.length > 50) return res.status(400).json({ error: 'Nieprawidłowe dane importu.' });
    const ref = Date.parse(eksportAt) || Date.now();
    const sellers = (process.env.PRO_SELLERS || '').split(',').map((e) => e.slice(0, e.indexOf(':')).trim()).filter(Boolean);
    const clean = (v, max) => (typeof v === 'string' && v.trim() && v.trim() !== '—' && v.trim() !== '-' ? v.trim().slice(0, max) : null);
    let dodane = 0, pominiete = 0;
    const bledy = [];
    try {
      for (const w of wiersze) {
        const nazwa = clean(w && w.lead, 140);
        const email = (clean(w.email, 254) || '').toLowerCase();
        let telefon = (clean(w.telefon, 30) || '').replace(/^'/, '').replace(/[\s()-]/g, '');
        if (/^\d{9}$/.test(telefon)) telefon = '+48' + telefon;
        if (!nazwa || (!email && !telefon)) { bledy.push(nazwa || '(bez nazwy)'); continue; }

        const id = createHash('sha256').update(`stary-crm:${email}|${telefon}`).digest('hex').slice(0, 32);
        if (await getLead(id)) { pominiete++; continue; }

        // „Czas w statusie" (np. 7h, 2 dni) liczony od momentu eksportu - przybliżona data wejścia w status.
        const m = /^(\d+)\s*(h|godz|dni|dzień|d)/i.exec(clean(w.czas, 20) || '');
        const wStatusieOd = m ? new Date(ref - Number(m[1]) * (m[2].toLowerCase() === 'h' || m[2].startsWith('godz') ? 3600e3 : 864e5)).toISOString() : null;
        const statusOryginalny = clean(w.status, 60);
        const status = STATUSES.includes(statusOryginalny) ? statusOryginalny : OLD_STATUS[statusOryginalny] || 'Nowy lead';
        const followUp = /^\d{4}-\d{2}-\d{2}$/.test(clean(w.followUp, 10) || '') ? w.followUp.trim() : null;
        const setter = clean(w.setter, 60), closer = clean(w.closer, 60);
        const [imie, ...reszta] = nazwa.split(/\s+/);
        const now = new Date().toISOString();
        const createdAt = wStatusieOd || new Date(ref).toISOString();

        await saveLead({
          id,
          stary: true,
          ukonczona: true,
          createdAt,
          wyslanoAt: createdAt,
          status,
          kontakt: { imie, nazwisko: reszta.join(' '), email, telefon, nick: null },
          odpowiedzi: {},
          segment: null,
          budzet: null,
          // Opiekun tylko, jeśli setter/closer ze starego CRM jest na liście PRO_SELLERS - inaczej zostaje w danych importu.
          przypisany: [closer, setter].find((n) => n && sellers.includes(n)) || null,
          // Follow-up ze starego CRM ląduje w kalendarzu, chyba że lead był już odrzucony. Godzinę (10:00 czasu
          // polskiego) liczy przeglądarka - serwer na Render działa w UTC.
          nastepnyKontakt: followUp && status !== 'Odrzucone' && !Number.isNaN(Date.parse(w.followUpAt)) ? new Date(w.followUpAt).toISOString() : null,
          notatki: [],
          historia: [{ at: now, autor: req.seller, zmiana: `import ze starego CRM (${String(plik || 'CSV').slice(0, 80)})` }],
          zrodlo: {},
          import: { z: 'Lovable CRM', plik: String(plik || '').slice(0, 120) || null, at: now, statusOryginalny, czasWStatusie: clean(w.czas, 20), wStatusieOd, setter, closer, followUp, wartosc: clean(w.wartosc, 40) },
        });
        dodane++;
      }
      console.log(`[crm] ${req.seller} import starego CRM: +${dodane}, pominięte ${pominiete}, błędne ${bledy.length}`);
      res.json({ dodane, pominiete, bledy });
    } catch (err) {
      console.error('[crm-import]', err.message);
      res.status(500).json({ error: 'Import przerwany - spróbuj ponownie (zaimportowane już leady zostaną pominięte).', dodane, pominiete });
    }
  });

  return router;
}
