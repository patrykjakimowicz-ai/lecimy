// Model sprzedaży: jedna wspólna edycja, wszyscy mają dostęp w tym samym oknie czasowym
// (niezależnie od daty zakupu przed końcem edycji). Zmieniając edycję, zmień TE SAME daty
// w public/edition.js oraz teksty w public/index.html, regulamin.html i zamowienie.html.
export const EDITION = {
  name: 'Edycja 1',
  startISO: '2026-11-01T00:00:00+01:00',
  endISO: '2027-01-31T23:59:59+01:00',
  startLabel: '1 listopada 2026',
  endLabel: '31 stycznia 2027',
};
