// Wysyłka e-maila z dostępem do programu po potwierdzonej płatności.
// Wymaga danych SMTP w .env (patrz .env.example). Można użyć np. skrzynki
// firmowej, Gmaila (hasło aplikacji) albo usługi transakcyjnej (Resend, SendGrid, Mailgun...).

import nodemailer from 'nodemailer';
import { resolve4 } from 'node:dns/promises';
import { EDITION } from './edition.mjs';

let transporter = null;

// Render nie ma wychodzącego IPv6, a nodemailer potrafi wybrać adres AAAA (błąd ENETUNREACH).
// Dlatego sami rozwiązujemy nazwę hosta do IPv4 i łączymy się po adresie IP
// (tls.servername zapewnia poprawną weryfikację certyfikatu).
async function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Brak konfiguracji SMTP w .env (SMTP_HOST / SMTP_USER / SMTP_PASS) — nie mogę wysłać e-maila. Zobacz .env.example.'
    );
  }

  let host = SMTP_HOST;
  try {
    const [ip] = await resolve4(SMTP_HOST);
    if (ip) host = ip;
  } catch {
    // brak rekordu A — spróbujemy połączyć się po nazwie
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { servername: SMTP_HOST },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return transporter;
}

// Wersja tekstowa maila (lepsza dostarczalność: filtry antyspamowe wolą wiadomości multipart).
function htmlToText(html) {
  return String(html)
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, (m, href, label) => (label.trim() === href ? href : `${label} (${href})`))
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fmtPln(grosze) {
  return (grosze / 100).toFixed(2).replace('.', ',') + ' zł';
}

const VAT_RATE = 23; // stawka VAT w %, kwoty na stronie są brutto

function vatAmount(grosze) {
  return Math.round((grosze * VAT_RATE) / (100 + VAT_RATE));
}

function orderNumber(order) {
  return String(order.sessionId || '').slice(0, 8).toUpperCase();
}

export async function sendOrderConfirmationEmail(order) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const siteUrl = process.env.SITE_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
  const loginUrl = `${siteUrl}/logowanie.html`;
  const regulaminUrl = `${siteUrl}/regulamin.html`;
  const politykaUrl = `${siteUrl}/polityka-prywatnosci.html`;
  const wzorUrl = `${siteUrl}/regulamin.html#wzor-odstapienia`;

  const addonLine = order.addonMasterclass
    ? '<li>Masterclass Wdrożeniowy (+157 zł) — dostęp do niego udostępnimy w panelu programu najpóźniej w dniu startu edycji.</li>'
    : '';

  const accessBlock = order.setPasswordUrl
    ? `
      <p>Utworzyliśmy dla Ciebie konto na platformie (login: <strong>${escapeHtml(order.email)}</strong>). Ustaw hasło, klikając poniższy przycisk:</p>
      <p style="margin: 24px 0;">
        <a href="${order.setPasswordUrl}" style="background:#e8780c;color:#111;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:6px;display:inline-block;">Ustaw hasło i wejdź do programu</a>
      </p>
      <p style="font-size:13px;color:#555;">Link jest jednorazowy i ma ograniczoną ważność. Jeśli wygaśnie, wejdź na
        <a href="${loginUrl}">${loginUrl}</a> i kliknij „Nie pamiętasz hasła?", podając ten adres e-mail — wyślemy nowy link.</p>`
    : `
      <p>Twoje konto na platformie jest już przygotowane (login: <strong>${escapeHtml(order.email)}</strong>).
        Wejdź na <a href="${loginUrl}">${loginUrl}</a>, kliknij „Nie pamiętasz hasła?", podaj ten adres e-mail
        i ustaw hasło z linku, który do Ciebie wyślemy.</p>`;

  const fakturaBlock = order.faktura
    ? `<p><strong>Faktura VAT</strong> zostanie wystawiona na: ${escapeHtml(order.faktura.firma)}, NIP ${escapeHtml(order.faktura.nip)}, ${escapeHtml(order.faktura.ulica)}, ${escapeHtml(order.faktura.kod)} ${escapeHtml(order.faktura.miasto)} i przesłana na ten adres e-mail.</p>`
    : '<p>Jeśli potrzebujesz faktury, napisz do nas, odpowiadając na tę wiadomość, i podaj dane do faktury.</p>';

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111; line-height: 1.5;">
      <h2>Dziękujemy za zakup, ${escapeHtml(order.imie)}! 🎉</h2>
      <p>Twoja płatność została potwierdzona.</p>
      <p><strong>Zamówienie nr ${orderNumber(order)}</strong></p>
      <ul>
        <li>${escapeHtml(order.pakiet)}</li>
        ${addonLine}
      </ul>
      <p><strong>Kwota brutto:</strong> ${fmtPln(order.amount)} (w tym VAT ${VAT_RATE}%: ${fmtPln(vatAmount(order.amount))})</p>
      <p><strong>${EDITION.name}:</strong> dostęp do programu od ${EDITION.startLabel} do ${EDITION.endLabel} (wspólny dla wszystkich uczestników). Po zakończeniu edycji dostęp wygasa.</p>
      ${accessBlock}
      ${fakturaBlock}
      <hr style="border:0;border-top:1px solid #ddd;margin:24px 0;" />
      <p style="font-size:13px;color:#444;"><strong>Potwierdzenie zawarcia umowy.</strong> Zakupiłeś treści cyfrowe niedostarczane na nośniku materialnym.
        Potwierdzamy, że przed zawarciem umowy wyraziłeś wyraźną zgodę na rozpoczęcie ich świadczenia przed upływem 14 dni od zawarcia umowy
        i zostałeś poinformowany, że w związku z tym tracisz prawo do odstąpienia od umowy (art. 38 pkt 13 ustawy o prawach konsumenta).
        Zapoznałeś się z <a href="${regulaminUrl}">Regulaminem</a> i <a href="${politykaUrl}">Polityką Prywatności</a>, które akceptowałeś w formularzu zamówienia.
        Wzór formularza odstąpienia (do celów informacyjnych) znajdziesz <a href="${wzorUrl}">w Regulaminie</a>.</p>
      <p>W razie pytań odpisz po prostu na tego maila.</p>
      <p>— Zespół Lecimy po swoje<br/><span style="font-size:12px;color:#666;">Weska Academy Sp. z o.o., ul. Złota 7/28, 00-019 Warszawa, NIP 5253083214</span></p>
    </div>
  `;

  const t = await getTransporter();
  await t.sendMail({
    from,
    to: order.email,
    replyTo: from,
    subject: `Twój dostęp do programu „${order.pakiet}” — Lecimy po swoje (zamówienie ${orderNumber(order)})`,
    html,
    text: htmlToText(html),
  });
}

/**
 * Powiadomienie dla właściciela: nowe opłacone zamówienie (+ dane do faktury) i ewentualne problemy
 * (nie założono konta / nie wysłano maila do klienta). Wymaga zmiennej OWNER_EMAIL; bez niej nic nie robi.
 */
export async function sendOwnerNotification({ order, accountError, mailError }) {
  const to = process.env.OWNER_EMAIL;
  if (!to) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const problems = [];
  if (accountError) problems.push(`⚠️ NIE założono konta klienta: ${escapeHtml(accountError.message)}. Załóż je ręcznie w Supabase (Authentication → Users).`);
  if (mailError) problems.push(`⚠️ NIE wysłano maila do klienta: ${escapeHtml(mailError.message)}. Wyślij dostęp ręcznie.`);

  const faktura = order.faktura
    ? `<p><strong>Dane do faktury VAT:</strong><br/>${escapeHtml(order.faktura.firma)}<br/>NIP ${escapeHtml(order.faktura.nip)}<br/>${escapeHtml(order.faktura.ulica)}<br/>${escapeHtml(order.faktura.kod)} ${escapeHtml(order.faktura.miasto)}</p>`
    : '<p>Dane do faktury: klient nie podał (faktura na żądanie).</p>';

  const attr = order.attribution && Object.keys(order.attribution).length
    ? Object.entries(order.attribution).map(([k, v]) => `${escapeHtml(k)}=${escapeHtml(v)}`).join(', ')
    : 'brak (wejście bezpośrednie)';

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; color: #111; line-height: 1.5;">
      <h3>Nowe opłacone zamówienie ${orderNumber(order)}</h3>
      ${problems.length ? `<p style="background:#fff3cd;padding:10px;border-radius:6px;">${problems.join('<br/>')}</p>` : ''}
      <p><strong>${escapeHtml(order.pakiet)}</strong>${order.addonMasterclass ? ' + Masterclass Wdrożeniowy' : ''} — ${fmtPln(order.amount)}</p>
      <p>Klient: ${escapeHtml(order.imie)} ${escapeHtml(order.nazwisko)}, ${escapeHtml(order.email)}</p>
      ${faktura}
      <p>Źródło ruchu: ${attr}</p>
    </div>
  `;

  const t = await getTransporter();
  await t.sendMail({
    from,
    to,
    subject: `${problems.length ? '⚠️ ' : ''}Nowe zamówienie ${orderNumber(order)}: ${order.pakiet} (${fmtPln(order.amount)})`,
    html,
    text: htmlToText(html),
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
