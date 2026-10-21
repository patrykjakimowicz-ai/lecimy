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
 * @param {{cena: number, email: string, imie?: string, nazwisko?: string, dni?: number}} o  cena w PLN brutto
 * @returns {string} token do parametru ?oferta=
 */
export function createProOffer({ cena, email, imie, nazwisko, dni = 7 }) {
  if (!Number.isInteger(cena) || cena < 100 || cena > 50000) throw new Error('Cena PRO musi być liczbą całkowitą 100–50 000 zł.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Podaj poprawny e-mail klienta.');
  const payload = {
    p: PRO_PACKAGE,
    c: cena,
    e: email.trim().toLowerCase(),
    i: imie || undefined,
    n: nazwisko || undefined,
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
  return { pakiet: o.p, cena: o.c, email: o.e, imie: o.i || '', nazwisko: o.n || '', expiresAt: new Date(o.x).toISOString() };
}
