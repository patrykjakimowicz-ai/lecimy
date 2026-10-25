// Realizacja opłaconego zamówienia - wspólna dla wszystkich operatorów płatności (Przelewy24, Stripe).
// Wywoływana dopiero PO zweryfikowaniu płatności przez dany operator.

import { updateOrder, listOrders } from './orderStore.mjs';
import { sendOrderConfirmationEmail, sendOwnerNotification } from './mailer.mjs';
import { ensureCustomerAccount } from './supabaseAuth.mjs';
import { SEAT_LIMITS } from './products.mjs';
import { EDITION } from './edition.mjs';

/**
 * Oznacza zamówienie jako opłacone, zakłada konto klienta, wysyła maile (klient + właściciel).
 * Błędy konta/maila nie cofają płatności - są logowane i trafiają w alercie do właściciela.
 * @param {{sessionId: string, order: object, siteUrl: string, patch?: object, tag: string}} p
 *   `patch` - dodatkowe pola do zapisu przy zamówieniu (np. orderId z P24, id płatności Stripe).
 */
export async function fulfillPaidOrder({ sessionId, order, siteUrl, patch = {}, tag }) {
  await updateOrder(sessionId, { status: 'paid', ...patch });

  // Konto klienta w Supabase (bez hasła) + link do ustawienia hasła. Błąd tutaj nie cofa płatności:
  // mail i tak wychodzi (z informacją, jak odzyskać dostęp), a Ty dostajesz alert.
  let setPasswordUrl = null;
  let accountError = null;
  try {
    setPasswordUrl = await ensureCustomerAccount(order.email, `${siteUrl}/logowanie.html`);
  } catch (accErr) {
    accountError = accErr;
    console.error(`[${tag}] płatność potwierdzona, ale nie udało się założyć konta klienta:`, accErr);
  }

  let mailError = null;
  try {
    await sendOrderConfirmationEmail({ ...order, sessionId, setPasswordUrl });
  } catch (mailErr) {
    mailError = mailErr;
    // Płatność jest już potwierdzona i zapisana - błąd maila nie powinien cofać tego faktu,
    // ale trzeba go głośno zalogować, żeby ręcznie dosłać dostęp klientowi.
    console.error(`[${tag}] płatność potwierdzona, ale wysyłka e-maila nie powiodła się:`, mailErr);
  }

  // Płatność mogła dojść po czasie rezerwacji miejsca (np. przelew tradycyjny) - wtedy limit może zostać przekroczony.
  const extraProblems = [];
  const seatLimit = SEAT_LIMITS[order.pakiet];
  if (seatLimit) {
    try {
      const paid = (await listOrders({ pakiet: order.pakiet, edycja: order.edycja || EDITION.name })).filter((o) => o.status === 'paid').length;
      if (paid > seatLimit) extraProblems.push(`Przekroczony limit miejsc ${order.pakiet}: opłaconych ${paid} z ${seatLimit}. Zdecyduj, czy przyjmujesz uczestnika, czy zwracasz płatność.`);
    } catch (seatErr) {
      console.error(`[${tag}] nie udało się sprawdzić limitu miejsc:`, seatErr.message);
    }
  }

  // Powiadomienie dla właściciela: nowa sprzedaż + dane do faktury + ewentualne problemy.
  try {
    await sendOwnerNotification({ order: { ...order, sessionId }, accountError, mailError, extraProblems });
  } catch (ownerErr) {
    console.error(`[${tag}] nie udało się wysłać powiadomienia do właściciela:`, ownerErr.message);
  }
}
