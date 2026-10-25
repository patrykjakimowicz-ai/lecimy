// Klient Stripe (Checkout Session - strona płatności hostowana przez Stripe).
// Dokumentacja: https://docs.stripe.com/payments/checkout
//
// Wymagane zmienne środowiskowe (patrz .env.example):
//   STRIPE_SECRET_KEY (sk_test_... / sk_live_...), STRIPE_WEBHOOK_SECRET (whsec_...)
//
// Metody płatności (karty, BLIK, Przelewy24, Apple/Google Pay) włączasz w panelu Stripe
// (Ustawienia -> Metody płatności) - kod ich nie wymienia, Stripe pokazuje klientowi te dostępne dla PLN.

import Stripe from 'stripe';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Minimalny czas wygaśnięcia sesji w Stripe to 30 min - dokładnie tyle trzyma się miejsce w limicie (SEAT_HOLD_MS).
const SESSION_TTL_S = 30 * 60 + 60;

let client = null;
function stripe() {
  if (!SECRET_KEY) {
    throw new Error('Stripe nie jest skonfigurowany - brakuje w .env: STRIPE_SECRET_KEY. Zobacz .env.example.');
  }
  return (client ??= new Stripe(SECRET_KEY));
}

/**
 * Tworzy sesję Stripe Checkout i zwraca URL, na który należy przekierować klienta.
 * @param {{sessionId: string, amount: number, currency?: string, description: string, email: string, urlReturn: string, urlCancel: string}} order
 *   `amount` w groszach (tak samo jak w P24).
 */
export async function createCheckoutSession(order) {
  const currency = (order.currency || 'PLN').toLowerCase();
  const session = await stripe().checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'pl',
      customer_email: order.email,
      client_reference_id: order.sessionId,
      metadata: { sessionId: order.sessionId },
      payment_intent_data: { metadata: { sessionId: order.sessionId }, description: order.description },
      line_items: [
        {
          quantity: 1,
          price_data: { currency, unit_amount: order.amount, product_data: { name: order.description } },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
      success_url: order.urlReturn,
      cancel_url: order.urlCancel,
    },
    { idempotencyKey: `checkout-${order.sessionId}` }
  );
  if (!session.url) throw new Error('Stripe nie zwrócił adresu płatności (session.url).');
  return { checkoutSessionId: session.id, redirectUrl: session.url };
}

/**
 * Weryfikuje podpis webhooka na SUROWYM body (Buffer) i zwraca zdarzenie.
 * Rzuca wyjątek, gdy podpis jest nieprawidłowy.
 */
export function constructWebhookEvent(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) {
    throw new Error('Brakuje STRIPE_WEBHOOK_SECRET w .env - nie można zweryfikować webhooka Stripe.');
  }
  return stripe().webhooks.constructEvent(rawBody, signatureHeader, WEBHOOK_SECRET);
}
