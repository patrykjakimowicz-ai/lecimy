// Źródło prawdy dla cen — musi być zgodne z cennikiem w index.html (#pricing).
// Ceny w PLN (złotych), przeliczane na grosze przy komunikacji z Przelewy24.

export const PACKAGES = {
  'Fundament': 997,
  'Kompletny System': 1597,
  'VIP': 2497,
};

// Limit miejsc w pakiecie (na edycję). Musi być zgodny z cennikiem w index.html i regulaminem (pkt 3).
export const SEAT_LIMITS = {
  'VIP': 25,
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
