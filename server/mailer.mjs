// Wysyłka e-maila z dostępem do programu po potwierdzonej płatności.
// Wymaga danych SMTP w .env (patrz .env.example). Można użyć np. skrzynki
// firmowej, Gmaila (hasło aplikacji) albo usługi transakcyjnej (Resend, SendGrid, Mailgun...).

import nodemailer from 'nodemailer';
import { resolve4 } from 'node:dns/promises';

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

export async function sendOrderConfirmationEmail(order) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const siteUrl = process.env.SITE_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
  const loginUrl = `${siteUrl}/logowanie.html`;

  const addonLine = order.addonMasterclass
    ? '<li>Masterclass Wdrożeniowy (+157 zł)</li>'
    : '';

  const accessBlock = order.setPasswordUrl
    ? `
      <p>Utworzyliśmy dla Ciebie konto na platformie (login: <strong>${escapeHtml(order.email)}</strong>). Ustaw hasło, klikając poniższy przycisk:</p>
      <p style="margin: 24px 0;">
        <a href="${order.setPasswordUrl}" style="background:#c9a24b;color:#111;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:6px;display:inline-block;">Ustaw hasło i wejdź do programu</a>
      </p>
      <p style="font-size:13px;color:#555;">Link jest jednorazowy i ma ograniczoną ważność. Jeśli wygaśnie, wejdź na
        <a href="${loginUrl}">${loginUrl}</a> i kliknij „Nie pamiętasz hasła?", podając ten adres e-mail — wyślemy nowy link.</p>`
    : `
      <p>Twoje konto na platformie jest już przygotowane (login: <strong>${escapeHtml(order.email)}</strong>).
        Wejdź na <a href="${loginUrl}">${loginUrl}</a>, kliknij „Nie pamiętasz hasła?", podaj ten adres e-mail
        i ustaw hasło z linku, który do Ciebie wyślemy.</p>`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2>Dziękujemy za zakup, ${escapeHtml(order.imie)}! 🎉</h2>
      <p>Twoja płatność za pakiet <strong>${escapeHtml(order.pakiet)}</strong> została potwierdzona.</p>
      <ul>
        <li>${escapeHtml(order.pakiet)}</li>
        ${addonLine}
      </ul>
      <p><strong>Kwota:</strong> ${(order.amount / 100).toFixed(2).replace('.', ',')} zł</p>
      ${accessBlock}
      <p>W razie pytań odpisz po prostu na tego maila.</p>
      <p>— Zespół Lecimy po swoje</p>
    </div>
  `;

  await (await getTransporter()).sendMail({
    from,
    to: order.email,
    subject: `Twój dostęp do programu „${order.pakiet}” — Lecimy po swoje`,
    html,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
