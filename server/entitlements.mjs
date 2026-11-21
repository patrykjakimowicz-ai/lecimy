// Co klient ma wykupione (z opłaconych zamówień w bieżącej edycji). Admin pomija ten mechanizm.
import { listOrdersByEmail } from './orderStore.mjs';
import { PRO_PACKAGE } from './products.mjs';
import { EDITION } from './edition.mjs';

/** @returns {Promise<{masterclass: boolean, system: boolean, pakiety: string[]}>} */
export async function entitlementsFor(email) {
  const orders = (await listOrdersByEmail(email)).filter(
    (o) => o.status === 'paid' && (!o.edycja || o.edycja === EDITION.name)
  );
  return {
    // Masterclass: dodatek (płatny albo gratis z linku) albo pakiet PRO (zawiera pełny zakres).
    masterclass: orders.some((o) => o.addonMasterclass === true || o.pakiet === PRO_PACKAGE),
    // Szczęście, Finanse i Duchowość: tylko Kompletny System i PRO (Fundament = Wstęp + Dyscyplina).
    system: orders.some((o) => o.pakiet === 'Kompletny System' || o.pakiet === PRO_PACKAGE),
    pakiety: [...new Set(orders.map((o) => o.pakiet))],
  };
}
