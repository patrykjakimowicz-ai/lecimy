// Oferta indywidualna PRO: pakiet nie jest dostępny w publicznym formularzu. Po rozmowie kwalifikacyjnej
// generujesz osobisty link (tools/link_pro.mjs) z ceną ustaloną z klientem; link jest podpisany HMAC,
// więc klient nie zmieni ceny ani adresu e-mail. Sekret: PRO_OFFER_SECRET (Render -> Environment).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { PRO_PACKAGE } from './products.mjs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function secret() {
  const s = process.env.PRO_OFFER_SECRET;
  if (!s || s.length < 32) throw new Error('Brak PRO_OFFER_SECRET (min. 32 znaki) — oferty PRO są wyłączone.');
  return s;
}

function sign(payloadB64) {
  return b64url(createHmac('sha256', secret()).update(payloadB64).digest());
}

/**
 * @param {{cena: number, email: string, imie?: string, nazwisko?: string, dni?: number, sprzedawca?: string}} o  cena w PLN brutto
 * @returns {string} token do parametru ?oferta=
 */
export function createProOffer({ cena, email, imie, nazwisko, dni = 7, sprzedawca }) {
  if (!Number.isInteger(cena) || cena < 100 || cena > 50000) throw new Error('Cena PRO musi być liczbą całkowitą 100–50 000 zł.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Podaj poprawny e-mail klienta.');
  const payload = {
    p: PRO_PACKAGE,
    c: cena,
    e: email.trim().toLowerCase(),
    i: imie || undefined,
    n: nazwisko || undefined,
    s: sprzedawca || undefined,
    x: Date.now() + dni * 24 * 60 * 60 * 1000,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Zwraca dane oferty albo null (zły podpis, wygasła, brak sekretu). */
export function readProOffer(token) {
  if (typeof token !== 'string' || token.length > 1000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let expected;
  try { expected = sign(body); } catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let o;
  try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (o.p !== PRO_PACKAGE || !Number.isInteger(o.c) || typeof o.e !== 'string' || !(o.x > Date.now())) return null;
  return { pakiet: o.p, cena: o.c, email: o.e, imie: o.i || '', nazwisko: o.n || '', sprzedawca: o.s || '', expiresAt: new Date(o.x).toISOString() };
}

// Sprzedawcy generujący linki na stronie generator-pro.html. PRO_SELLERS="Ania:haslo1,Tomek:haslo2"
// (Render -> Environment). Imię trafia do linku i do powiadomienia o sprzedaży. Usunięcie wpisu odbiera dostęp.
export function sellerForPassword(password) {
  if (typeof password !== 'string' || !password) return null;
  const given = Buffer.from(password);
  for (const entry of (process.env.PRO_SELLERS || '').split(',')) {
    const i = entry.indexOf(':');
    if (i < 1) continue;
    const name = entry.slice(0, i).trim();
    const pw = Buffer.from(entry.slice(i + 1).trim());
    if (pw.length >= 8 && pw.length === given.length && timingSafeEqual(pw, given)) return name;
  }
  return null;
}
