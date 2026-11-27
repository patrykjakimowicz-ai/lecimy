// Źródło prawdy dla cen - musi być zgodne z cennikiem w index.html (#pricing).
// Ceny w PLN (złotych), przeliczane na grosze przy komunikacji z Przelewy24.

export const PACKAGES = {
  'Fundament': 1097,
  'Kompletny System': 1697,
};

// Black Friday: ceny promocyjne do końca listopada, potem automatycznie wracają ceny z PACKAGES.
// Termin i kwoty muszą zgadzać się z public/edition.js (promoEndISO), index.html i zamowienie.html.
export const PROMO = {
  endISO: '2026-11-30T23:59:59+01:00',
  prices: { 'Fundament': 997, 'Kompletny System': 1297 },
};

export function packagePrice(pakiet, now = Date.now()) {
  return now <= Date.parse(PROMO.endISO) && Object.hasOwn(PROMO.prices, pakiet) ? PROMO.prices[pakiet] : PACKAGES[pakiet];
}

// Pakiet PRO: oferta indywidualna po kwalifikacji, bez ceny w PACKAGES - cenę niesie podpisany link (server/proOffer.mjs).
export const PRO_PACKAGE = 'Lecimy po swoje PRO';

// Limit miejsc w pakiecie (na edycję). Musi być zgodny z cennikiem w index.html i regulaminem (pkt 3).
export const SEAT_LIMITS = {
  [PRO_PACKAGE]: 25,
};

export const ADDONS = {
  masterclass: {
    label: 'Masterclass Wdrożeniowy',
    price: 157,
  },
};

// Rabat za wyrażenie zgody marketingowej (e-mail + telefon) na checkoucie.
export const MARKETING_CONSENT_DISCOUNT = 50;

export function toGrosze(pln) {
  return Math.round(pln * 100);
}
