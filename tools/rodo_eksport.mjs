// Eksport danych jednej osoby (prośba o dostęp / przeniesienie danych — RODO).
// Użycie:
//   node tools/rodo_eksport.mjs klient@example.com            (Supabase; wymaga SUPABASE_URL i SUPABASE_SERVICE_KEY w środowisku)
//   node tools/rodo_eksport.mjs --local klient@example.com    (lokalne pliki server/data/ — do testów)
// Wynik: .tmp/rodo_<e-mail>_<data>.json. Plik zawiera dane osobowe — wyślij bezpiecznym kanałem i usuń po wysyłce.
// Skrypt tylko ODCZYTUJE dane (nic nie usuwa ani nie zmienia).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const local = args.includes('--local');
const email = (args.find((a) => !a.startsWith('--')) || '').trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Podaj poprawny adres e-mail osoby, której dotyczy wniosek.\nPrzykład: node tools/rodo_eksport.mjs klient@example.com');
  process.exit(1);
}

const sameEmail = (v) => String(v || '').trim().toLowerCase() === email;

async function fromLocal() {
  const out = { orders: [], consents: [], authUser: null };
  const ordersFile = path.join(ROOT, 'server/data/orders.json');
  const consentsFile = path.join(ROOT, 'server/data/consents.jsonl');
  if (existsSync(ordersFile)) {
    const all = JSON.parse(await readFile(ordersFile, 'utf8') || '{}');
    out.orders = Object.values(all).filter((o) => sameEmail(o.email));
  }
  if (existsSync(consentsFile)) {
    const lines = (await readFile(consentsFile, 'utf8')).split('\n').filter(Boolean);
    out.consents = lines.map((l) => JSON.parse(l)).filter((c) => sameEmail(c.email));
  }
  return out;
}

async function fromSupabase() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) {
    console.error('Brak SUPABASE_URL lub SUPABASE_SERVICE_KEY w środowisku. Ustaw je w tej sesji powłoki (nie zapisuj w plikach).');
    process.exit(1);
  }
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  const get = async (url) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url.split('?')[0]}`);
    return res.json();
  };
  const filter = `data-%3E%3Eemail=ilike.${encodeURIComponent(email)}`;
  const orders = (await get(`${base}/rest/v1/orders?${filter}&select=*`)).map((r) => r.data);
  const consents = (await get(`${base}/rest/v1/consents?${filter}&select=*`)).map((r) => r.data);

  // konto w Supabase Auth (wyszukanie po e-mailu; lista stronicowana)
  let authUser = null;
  for (let page = 1; page <= 20 && !authUser; page++) {
    const list = await get(`${base}/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = list.users || [];
    authUser = users.find((u) => sameEmail(u.email)) || null;
    if (users.length < 200) break;
  }
  if (authUser) {
    authUser = { id: authUser.id, email: authUser.email, created_at: authUser.created_at, last_sign_in_at: authUser.last_sign_in_at, email_confirmed_at: authUser.email_confirmed_at };
  }
  return { orders, consents, authUser };
}

const data = local ? await fromLocal() : await fromSupabase();
const result = {
  przygotowano: new Date().toISOString(),
  osoba: email,
  zrodlo: local ? 'pliki lokalne (test)' : 'Supabase',
  zamowienia: data.orders,
  dowody_zgod: data.consents,
  konto_w_panelu: data.authUser,
};

const dir = path.join(ROOT, '.tmp');
await mkdir(dir, { recursive: true });
const file = path.join(dir, `rodo_${email.replace(/[^a-z0-9]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`);
await writeFile(file, JSON.stringify(result, null, 2), 'utf8');

console.log(`Zamówienia: ${data.orders.length}, dowody zgód: ${data.consents.length}, konto w panelu: ${data.authUser ? 'tak' : 'nie'}`);
console.log(`Zapisano: ${path.relative(ROOT, file)}`);
console.log('Uwaga: plik zawiera dane osobowe — wyślij bezpiecznym kanałem i usuń po wysyłce.');
