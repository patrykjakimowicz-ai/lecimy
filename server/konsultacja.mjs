// Bezpłatna konsultacja przed zakupem Kompletnego Systemu (public/konsultacja.html, link pod kartą Fundament).
//
// Klient wybiera blok godzin (np. 12:00-15:00), w którym do niego zadzwonimy, i zostawia kontakt. W bloku jest
// ograniczona liczba miejsc - pełny blok znika z listy. Rezerwacja ląduje w CRM (crm.html) jako lead z typem
// „konsultacja", statusem „Umówiona rozmowa" i początkiem bloku w „Następny kontakt" (widać ją w kalendarzu panelu).
// Spotkania umówione ręcznie w CRM też zajmują miejsce w bloku, w który wypada ich godzina.
// W zakładce „Grafik konsultacji" panelu sprzedawca może wyłączyć pojedynczy blok albo cały dzień.
//
// Id leada liczone z e-maila - ta sama osoba rezerwująca drugi raz przesuwa swoją rozmowę zamiast tworzyć duplikat.

import express from 'express';
import { createHash } from 'node:crypto';
import { getLead, saveLead, listLeads } from './leadStore.mjs';
import { getSetting, setSetting } from './settingsStore.mjs';
import { requireSeller } from './crm.mjs';
import { sendConsultationEmails } from './mailer.mjs';

// ── Grafik rozmów (czas polski) ──
// Dzień tygodnia (0 = niedziela) → bloki [od, do) w godzinach. W każdym bloku dzwonimy do max MIEJSC_W_BLOKU osób
// (rozmowa 10-15 minut). Zapisy najwcześniej na następny dzień.
const DNI_ROBOCZE = [[12, 15], [15, 18], [18, 21]];
// Poniedziałek bez bloku 18-21.
const BLOKI = { 1: [[12, 15], [15, 18]], 2: DNI_ROBOCZE, 3: DNI_ROBOCZE, 4: DNI_ROBOCZE, 5: DNI_ROBOCZE, 6: [[12, 15]] };
const MIEJSC_W_BLOKU = 5;
const DNI_NAPRZOD = 14;
const TZ = 'Europe/Warsaw';

export const PAKIET = 'Kompletny System';
const PYTANIE_MAX = 1000;
const CONSENT_TEXT =
  'Akceptuję regulamin i politykę prywatności oraz zgadzam się na kontakt telefoniczny i mailowy w sprawie bezpłatnej konsultacji i oferty Lecimy po swoje.';

const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid'];
function cleanAttribution(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const k of ATTR_KEYS) if (typeof raw[k] === 'string' && raw[k]) out[k] = raw[k].slice(0, 200);
    if (typeof raw.referrer === 'string' && raw.referrer) out.referrer = raw.referrer.slice(0, 300);
  }
  return out;
}

// Serwer na Render działa w UTC - godziny z grafiku przeliczamy z czasu polskiego (z uwzględnieniem zmiany czasu).
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' });
function warsawParts(ms) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
function warsawToUtc(y, m, d, h, min) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = warsawParts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return guess - offset;
}

/** Bloki z grafiku od jutra na DNI_NAPRZOD dni ({ start, koniec } w ISO, UTC), bez sprawdzania zapisów i wyłączeń. */
function scheduleBlocks(now = Date.now()) {
  const out = [];
  const today = warsawParts(now);
  for (let i = 1; i <= DNI_NAPRZOD; i++) {
    const noon = Date.UTC(today.y, today.m - 1, today.d + i, 12);
    const day = warsawParts(noon);
    for (const [od, doH] of BLOKI[day.wd] || []) {
      const start = warsawToUtc(day.y, day.m, day.d, od, 0);
      const koniec = warsawToUtc(day.y, day.m, day.d, doH, 0);
      out.push({ start: new Date(start).toISOString(), koniec: new Date(koniec).toISOString() });
    }
  }
  return out;
}

// Kto zajmuje każdy blok (klucz = początek bloku): rezerwacje klientów ze strony zapisów (aktywne, status
// „Umówiona rozmowa") oraz spotkania umówione w CRM (lead.spotkania), których godzina wypada w bloku.
// Jedna osoba liczy się w danym bloku raz, nawet jeśli ma i rezerwację, i spotkanie.
const ACTIVE = ['Umówiona rozmowa'];
function occupancy(leads, blocks, exceptId) {
  const out = new Map(blocks.map((b) => [b.start, []]));
  const blockOf = (iso) => {
    const t = Date.parse(iso);
    const b = blocks.find((x) => t >= Date.parse(x.start) && t < Date.parse(x.koniec));
    return b ? b.start : null;
  };
  for (const l of leads) {
    if (l.id === exceptId) continue;
    const imie = l.kontakt && l.kontakt.imie;
    const seen = new Set();
    const push = (start, entry) => {
      if (!start || !out.has(start) || seen.has(start)) return; // bloki z przeszłości nie są w grafiku
      seen.add(start);
      out.get(start).push({ id: l.id, imie, ...entry });
    };
    if (l.typ === 'konsultacja' && ACTIVE.includes(l.status) && l.konsultacja && l.konsultacja.termin) {
      push(new Date(l.konsultacja.termin).toISOString(), { zrodlo: 'zapis' });
    }
    for (const m of l.spotkania || []) push(blockOf(m.at), { zrodlo: 'crm', at: m.at, kto: m.kto });
  }
  return out;
}
async function bookedPerBlock(exceptId) {
  const occ = occupancy(await listLeads(), scheduleBlocks(), exceptId);
  return new Map([...occ].map(([k, v]) => [k, v.length]));
}

// Bloki wyłączone w panelu CRM: { [początek bloku ISO]: { autor, at } }.
const WYLACZONE_KEY = 'konsultacje_wylaczone';
async function disabledBlocks({ strict = false } = {}) {
  try {
    return (await getSetting(WYLACZONE_KEY)) || {};
  } catch (err) {
    // Brak tabeli `ustawienia` nie może blokować zapisów - klient widzi wtedy pełny grafik, a panel dostaje błąd.
    if (strict) throw err;
    console.error('[konsultacja] wyłączone bloki:', err.message);
    return {};
  }
}

// Sprawdzenie wolnych miejsc w bloku i zapis idą po kolei - blok nie przekroczy limitu przy równoczesnych zapisach.
let bookingLock = Promise.resolve();
function withBookingLock(fn) {
  const run = bookingLock.then(fn, fn);
  bookingLock = run.catch(() => {});
  return run;
}

/**
 * @param {{ clientIp: (req) => string, limiter: (opts) => Function, siteUrl: string }} deps
 */
export function konsultacjaRouter({ clientIp, limiter, siteUrl }) {
  const router = express.Router();
  const readLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });
  const bookLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 10 });

  router.get('/api/konsultacja/terminy', readLimiter, async (req, res) => {
    try {
      const [booked, off] = await Promise.all([bookedPerBlock(null), disabledBlocks()]);
      // Bez liczby wolnych miejsc - klient widzi tylko bloki, w których jeszcze jest miejsce.
      const terminy = scheduleBlocks().filter((b) => !off[b.start] && (booked.get(b.start) || 0) < MIEJSC_W_BLOKU);
      res.set('Cache-Control', 'no-store').json({ terminy, czasRozmowy: '10-15 minut' });
    } catch (err) {
      console.error('[konsultacja-terminy]', err.message);
      res.status(503).json({ error: 'Kalendarz chwilowo niedostępny. Spróbuj za chwilę.' });
    }
  });

  router.post('/api/konsultacja', bookLimiter, async (req, res) => {
    const { termin, kontakt, pytanie, problem, zgoda } = req.body || {};
    const k = kontakt && typeof kontakt === 'object' ? kontakt : {};
    const imie = typeof k.imie === 'string' ? k.imie.trim() : '';
    const email = typeof k.email === 'string' ? k.email.trim().toLowerCase() : '';
    const telefon = typeof k.telefon === 'string' ? k.telefon.replace(/[\s()-]/g, '') : '';

    if (imie.length < 2 || imie.length > 60) return res.status(400).json({ error: 'Podaj imię.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Podaj poprawny adres e-mail.' });
    if (!/^\+\d{8,15}$/.test(telefon)) return res.status(400).json({ error: 'Podaj poprawny numer telefonu.' });
    if (zgoda !== true) return res.status(400).json({ error: 'Zaznacz zgodę, żebyśmy mogli do Ciebie zadzwonić.' });
    const at = typeof termin === 'string' ? Date.parse(termin) : NaN;
    if (Number.isNaN(at)) return res.status(400).json({ error: 'Wybierz termin rozmowy.' });
    const start = new Date(at).toISOString();
    const notatka = typeof pytanie === 'string' ? pytanie.trim().slice(0, PYTANIE_MAX) : '';
    const problemTxt = typeof problem === 'string' ? problem.trim().slice(0, PYTANIE_MAX) : '';
    if (problemTxt.length < 5) return res.status(400).json({ error: 'Napisz, co jest dziś Twoim największym problemem.' });
    if (notatka.length < 5) return res.status(400).json({ error: 'Napisz, co Cię wstrzymuje przed dołączeniem.' });

    try {
      const result = await withBookingLock(async () => {
        const id = createHash('sha256').update(`konsultacja:${email}`).digest('hex').slice(0, 32);
        const blok = scheduleBlocks().find((b) => b.start === start);
        if (!blok || (await disabledBlocks())[start] || ((await bookedPerBlock(id)).get(start) || 0) >= MIEJSC_W_BLOKU) {
          return { conflict: true };
        }
        const cur = await getLead(id);
        const now = new Date().toISOString();
        const przesuniecie = cur && cur.status === 'Umówiona rozmowa' && cur.nastepnyKontakt && Date.parse(cur.nastepnyKontakt) > Date.now();
        const historia = [...((cur && cur.historia) || [])];
        historia.push({ at: now, autor: 'klient', zmiana: `${przesuniecie ? 'przesunięcie' : 'rezerwacja'} konsultacji (${PAKIET}): następny kontakt: ${start}` });

        const lead = await saveLead({
          ...(cur || { id, createdAt: now, notatki: [], zrodlo: cleanAttribution(req.body.zrodlo), przypisany: null, odpowiedzi: {}, segment: null, budzet: null }),
          typ: 'konsultacja',
          pakiet: PAKIET,
          ukonczona: true,
          wyslanoAt: now,
          ostatniaAktywnosc: now,
          status: 'Umówiona rozmowa',
          nastepnyKontakt: start,
          historia,
          kontakt: { imie, nazwisko: '', email, telefon, nick: null },
          konsultacja: { termin: start, koniec: blok.koniec, pytanie: notatka, problem: problemTxt, umowionoAt: now, rezerwacje: ((cur && cur.konsultacja && cur.konsultacja.rezerwacje) || 0) + 1 },
          zgoda: { tresc: CONSENT_TEXT, at: now, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
        });
        return { lead, przesuniecie, blok };
      });

      if (result.conflict) return res.status(409).json({ error: 'Ten blok nie jest już dostępny. Wybierz inny.', zajety: true });
      sendConsultationEmails({ lead: result.lead, crmUrl: `${siteUrl}/crm.html#lead=${result.lead.id}`, przesuniecie: result.przesuniecie }).catch((e) =>
        console.error('[konsultacja] e-mail:', e.message)
      );
      res.json({ ok: true, termin: start, koniec: result.blok.koniec });
    } catch (err) {
      console.error('[konsultacja]', err.message);
      res.status(500).json({ error: 'Nie udało się zarezerwować rozmowy. Spróbuj ponownie za chwilę.' });
    }
  });

  // ── Panel CRM: grafik konsultacji (podgląd zapisów, wyłączanie bloków) ──
  const crmLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

  async function grafik() {
    const [leads, off] = await Promise.all([listLeads(), disabledBlocks({ strict: true })]);
    const blocks = scheduleBlocks();
    const zapisani = occupancy(leads, blocks, null);
    const bloki = blocks.map((b) => ({ ...b, wylaczony: off[b.start] || null, zapisani: zapisani.get(b.start) || [] }));
    return { bloki, limit: MIEJSC_W_BLOKU };
  }

  router.get('/api/crm/konsultacje/grafik', crmLimiter, requireSeller, async (req, res) => {
    try {
      res.json(await grafik());
    } catch (err) {
      console.error('[crm-grafik]', err.message);
      res.status(503).json({ error: 'Nie udało się wczytać grafiku. Jeśli to pierwsze uruchomienie, dodaj tabelę `ustawienia` w Supabase (supabase-schema.sql).' });
    }
  });

  // { starty: [początki bloków], wylaczony: true|false } - jeden blok albo cały dzień naraz.
  router.post('/api/crm/konsultacje/grafik', crmLimiter, requireSeller, async (req, res) => {
    const { starty, wylaczony } = req.body || {};
    const known = new Set(scheduleBlocks().map((b) => b.start));
    if (!Array.isArray(starty) || !starty.length || starty.length > 10 || typeof wylaczony !== 'boolean' || !starty.every((x) => known.has(x))) {
      return res.status(400).json({ error: 'Nieprawidłowy blok.' });
    }
    try {
      await withBookingLock(async () => {
        const off = await disabledBlocks({ strict: true });
        const now = Date.now();
        // Przy okazji czyścimy wyłączenia z przeszłości.
        for (const k of Object.keys(off)) if (Date.parse(k) < now) delete off[k];
        for (const k of starty) {
          if (wylaczony) off[k] = off[k] || { autor: req.seller, at: new Date().toISOString() };
          else delete off[k];
        }
        await setSetting(WYLACZONE_KEY, off);
      });
      console.log(`[crm] ${req.seller} ${wylaczony ? 'wyłączył' : 'włączył'} bloki konsultacji: ${starty.join(', ')}`);
      res.json(await grafik());
    } catch (err) {
      console.error('[crm-grafik-zapis]', err.message);
      res.status(500).json({ error: 'Nie udało się zapisać zmiany. Jeśli to pierwsze uruchomienie, dodaj tabelę `ustawienia` w Supabase (supabase-schema.sql).' });
    }
  });

  return router;
}
