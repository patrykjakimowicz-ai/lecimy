// Klient REST API Przelewy24 (v1).
// Dokumentacja: https://developers.przelewy24.pl/
//
// Wymagane zmienne środowiskowe (patrz .env.example):
//   P24_MERCHANT_ID, P24_POS_ID, P24_API_KEY (tzw. "klucz do raportów"), P24_CRC, P24_SANDBOX

import { createHash } from 'node:crypto';

const SANDBOX = process.env.P24_SANDBOX === 'true';
const BASE_URL = SANDBOX ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl';

const MERCHANT_ID = Number(process.env.P24_MERCHANT_ID);
const POS_ID = Number(process.env.P24_POS_ID || process.env.P24_MERCHANT_ID);
const API_KEY = process.env.P24_API_KEY;
const CRC = process.env.P24_CRC;

function assertConfigured() {
  const missing = [];
  if (!MERCHANT_ID) missing.push('P24_MERCHANT_ID');
  if (!POS_ID) missing.push('P24_POS_ID');
  if (!API_KEY) missing.push('P24_API_KEY');
  if (!CRC) missing.push('P24_CRC');
  if (missing.length) {
    throw new Error(
      `Przelewy24 nie jest skonfigurowane — brakuje w .env: ${missing.join(', ')}. ` +
      `Zobacz .env.example.`
    );
  }
}

function sha384(input) {
  return createHash('sha384').update(input, 'utf8').digest('hex');
}

// WAŻNE: kolejność kluczy w obiekcie musi być identyczna z dokumentacją P24 —
// od niej zależy wynik hasha. JS zachowuje kolejność wstawiania kluczy tekstowych,
// więc wystarczy budować literały obiektów w podanej kolejności.
function signRegister({ sessionId, amount, currency }) {
  return sha384(JSON.stringify({ sessionId, merchantId: MERCHANT_ID, amount, currency, crc: CRC }));
}

function signVerify({ sessionId, orderId, amount, currency }) {
  return sha384(JSON.stringify({ sessionId, orderId, amount, currency, crc: CRC }));
}

function signWebhook({ merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement }) {
  return sha384(
    JSON.stringify({ merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, crc: CRC })
  );
}

function authHeader() {
  const token = Buffer.from(`${POS_ID}:${API_KEY}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Rejestruje transakcję w Przelewy24 i zwraca URL, na który należy przekierować klienta.
 * @param {{sessionId: string, amount: number, currency?: string, description: string, email: string, urlReturn: string, urlStatus: string}} order
 *   `amount` w groszach (np. 159700 = 1597,00 zł).
 */
export async function registerTransaction(order) {
  assertConfigured();

  const currency = order.currency || 'PLN';
  const body = {
    merchantId: MERCHANT_ID,
    posId: POS_ID,
    sessionId: order.sessionId,
    amount: order.amount,
    currency,
    description: order.description,
    email: order.email,
    country: 'PL',
    language: 'pl',
    urlReturn: order.urlReturn,
    urlStatus: order.urlStatus,
    sign: signRegister({ sessionId: order.sessionId, amount: order.amount, currency }),
  };

  const res = await fetch(`${BASE_URL}/api/v1/transaction/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.data?.token) {
    const errMsg = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(`Rejestracja transakcji w Przelewy24 nie powiodła się: ${errMsg}`);
  }

  return {
    token: json.data.token,
    redirectUrl: `${BASE_URL}/trnRequest/${json.data.token}`,
  };
}

/**
 * Weryfikuje opłaconą transakcję (wywoływane po otrzymaniu webhooka).
 * @param {{sessionId: string, orderId: number, amount: number, currency?: string}} params
 */
export async function verifyTransaction({ sessionId, orderId, amount, currency = 'PLN' }) {
  assertConfigured();

  const body = {
    merchantId: MERCHANT_ID,
    posId: POS_ID,
    sessionId,
    amount,
    currency,
    orderId,
    sign: signVerify({ sessionId, orderId, amount, currency }),
  };

  const res = await fetch(`${BASE_URL}/api/v1/transaction/verify`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  const ok = res.ok && json?.data?.status === 'success';
  return { ok, raw: json };
}

/**
 * Sprawdza autentyczność powiadomienia (webhooka) przysłanego przez P24,
 * porównując przesłany `sign` z lokalnie wyliczonym.
 */
export function isWebhookSignatureValid(payload) {
  if (!CRC) return false;
  const expected = signWebhook(payload);
  return expected === payload.sign;
}

export const p24Config = { SANDBOX, BASE_URL, MERCHANT_ID, POS_ID };
