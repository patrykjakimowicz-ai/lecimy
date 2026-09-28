// Wysyłka e-maila z dostępem do programu po potwierdzonej płatności.
// Wymaga danych SMTP w .env (patrz .env.example). Można użyć np. skrzynki
// firmowej, Gmaila (hasło aplikacji) albo usługi transakcyjnej (Resend, SendGrid, Mailgun...).

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'Brak konfiguracji SMTP w .env (SMTP_HOST / SMTP_USER / SMTP_PASS) — nie mogę wysłać e-maila. Zobacz .env.example.'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
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

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2>Dziękujemy za zakup, ${escapeHtml(order.imie)}! 🎉</h2>
      <p>Twoja płatność za pakiet <strong>${escapeHtml(order.pakiet)}</strong> została potwierdzona.</p>
      <ul>
        <li>${escapeHtml(order.pakiet)}</li>
        ${addonLine}
      </ul>
      <p><strong>Kwota:</strong> ${(order.amount / 100).toFixed(2).replace('.', ',')} zł</p>
      <p>
        Zaloguj się do platformy programu, aby uzyskać dostęp do materiałów:
        <a href="${loginUrl}">${loginUrl}</a>
      </p>
      <p>W razie pytań odpisz po prostu na tego maila.</p>
      <p>— Zespół Lecimy po swoje</p>
    </div>
  `;

  await getTransporter().sendMail({
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
