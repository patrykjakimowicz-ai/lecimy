// Model sprzedaży: jedna wspólna edycja. Sprzedaż trwa tylko do dnia zamknięcia (przed startem),
// wszyscy uczestnicy mają dostęp w tym samym oknie czasowym. Zmieniając edycję, zmień TE SAME daty
// w public/edition.js oraz teksty w public/index.html, regulamin.html i zamowienie.html.
export const EDITION = {
  name: 'Edycja 1',
  salesCloseISO: '2026-11-20T00:00:00+01:00', // po tej chwili nie przyjmujemy zamówień
  salesCloseLabel: '20 listopada 2026',
  startISO: '2026-11-20T00:00:00+01:00',
  endISO: '2027-02-19T23:59:59+01:00',
  startLabel: '20 listopada 2026',
  endLabel: '19 lutego 2027',
};
