// Powiadomienie uczestników o zmianie Regulaminu (wymóg: Regulamin pkt 11 — informacja e-mailem uczestników trwającej Edycji).
//
// Domyślnie TRYB PRÓBNY: pokazuje, do kogo wiadomość by poszła, i NIC nie wysyła.
//   node tools/powiadom_uczestnikow.mjs --od "1 grudnia 2026" --zmiany "Doprecyzowano zasady reklamacji (pkt 7)."
// Faktyczna wysyłka wymaga flagi --wyslij:
//   node tools/powiadom_uczestnikow.mjs --od "1 grudnia 2026" --zmiany "..." --wyslij
// Tryb lokalny (pliki server/data/, do testów):  dodaj --local
//
// Wymaga w środowisku: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SITE_URL oraz (poza --local)
// SUPABASE_URL i SUPABASE_SERVICE_KEY. Wartości ustaw w tej sesji powłoki (nie zapisuj ich w plikach).
// Odbiorcy: unikalne adresy z zamówień opłaconych (status "paid").
// Przed wysyłką zmień wersję w server/legalVersions.mjs, wdróż nowy regulamin na stronę i na Render.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendServiceEmail, currentLegalAttachments } from '../server/mailer.mjs';
import { LEGAL_VERSIONS } from '../server/legalVersions.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const send = flag('--wyslij');
const local = flag('--local');
const od = val('--od');           // data wejścia zmian w życie, np. "1 grudnia 2026"
const zmiany = val('--zmiany');   // krótki opis najważniejszych zmian

if (!od || !zmiany) {
  console.error('Wymagane: --od "<data wejścia w życie>" oraz --zmiany "<krótki opis zmian>".');
  process.exit(1);
}

const siteUrl = (process.env.SITE_URL || 'https://lecimyposwoje.pl').replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadRecipients() {
  let orders = [];
  if (local) {
    const f = path.join(ROOT, 'server/data/orders.json');
    orders = existsSync(f) ? Object.values(JSON.parse(await readFile(f, 'utf8') || '{}')) : [];
  } else {
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_KEY || '';
    if (!base || !key) { console.error('Brak SUPABASE_URL / SUPABASE_SERVICE_KEY w środowisku.'); process.exit(1); }
    const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
    const res = await fetch(`${base}/rest/v1/orders?data-%3E%3Estatus=eq.paid&select=data`, { headers });
    if (!res.ok) { console.error('Błąd odczytu zamówień:', res.status); process.exit(1); }
    orders = (await res.json()).map((r) => r.data);
  }
  const byEmail = new Map();
  for (const o of orders) {
    if (o.status !== 'paid' || !o.email) continue;
    const e = String(o.email).trim().toLowerCase();
    if (!byEmail.has(e)) byEmail.set(e, { email: e, imie: o.imie || '' });
  }
  return [...byEmail.values()];
}

function buildHtml(imie) {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111; line-height: 1.5;">
      <p>Dzień dobry${imie ? ', ' + esc(imie) : ''},</p>
      <p>informujemy o zmianie <strong>Regulaminu</strong> sklepu Lecimy po swoje. Nowa wersja wchodzi w życie <strong>${esc(od)}</strong>.</p>
      <p><strong>Najważniejsze zmiany:</strong> ${esc(zmiany)}</p>
      <p>Pełna treść Regulaminu (oraz Polityki Prywatności) jest w załączniku do tej wiadomości i dostępna na stronie:
        <a href="${siteUrl}/regulamin.html">${siteUrl}/regulamin.html</a>.</p>
      <p>Zmiana nie wpływa na umowy zawarte przed jej wejściem w życie, które są realizowane na dotychczasowych zasadach.
        Jeżeli nie akceptujesz zmiany dotyczącej trwającego świadczenia usług elektronicznych (konto w panelu programu),
        możesz w terminie 14 dni od otrzymania tej wiadomości rozwiązać umowę o prowadzenie konta, pisząc na adres kontakt@weskaacademy.pl.</p>
      <p>— Zespół Lecimy po swoje<br/><span style="font-size:12px;color:#666;">Weska Academy Sp. z o.o., ul. Złota 7/28, 00-019 Warszawa, NIP 5253083214</span></p>
    </div>`;
}

const recipients = await loadRecipients();
console.log(`Tryb: ${send ? 'WYSYŁKA' : 'PRÓBNY (nic nie zostanie wysłane)'} | źródło: ${local ? 'pliki lokalne' : 'Supabase'}`);
console.log(`Wersje dokumentów: regulamin ${LEGAL_VERSIONS.regulamin}, polityka ${LEGAL_VERSIONS.polityka}`);
console.log(`Odbiorców (unikalne e-maile z zamówień opłaconych): ${recipients.length}`);
recipients.slice(0, 20).forEach((r) => console.log('  -', r.email));
if (recipients.length > 20) console.log(`  … i ${recipients.length - 20} kolejnych`);

if (!send) {
  console.log('\nTo był tryb próbny. Aby wysłać, uruchom to samo polecenie z flagą --wyslij.');
  process.exit(0);
}
if (!recipients.length) { console.log('Brak odbiorców — nic do wysłania.'); process.exit(0); }

const attachments = await currentLegalAttachments();
const subject = `Zmiana Regulaminu — Lecimy po swoje (od ${od})`;
const log = { data: new Date().toISOString(), od, zmiany, subject, wyslane: [], bledy: [] };
for (const r of recipients) {
  try {
    await sendServiceEmail({ to: r.email, subject, html: buildHtml(r.imie), attachments });
    log.wyslane.push(r.email);
    console.log('✓', r.email);
  } catch (err) {
    log.bledy.push({ email: r.email, blad: err.message });
    console.error('✗', r.email, err.message);
  }
  await new Promise((res) => setTimeout(res, 1200)); // nie przekraczamy limitów dostawcy poczty
}
await mkdir(path.join(ROOT, '.tmp'), { recursive: true });
const file = path.join(ROOT, '.tmp', `powiadomienie_regulamin_${log.data.slice(0, 10)}.json`);
await writeFile(file, JSON.stringify(log, null, 2), 'utf8');
console.log(`\nWysłano: ${log.wyslane.length}, błędów: ${log.bledy.length}. Raport: ${path.relative(ROOT, file)} (zachowaj jako dowód powiadomienia).`);
