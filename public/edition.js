// Okno dostępu do bieżącej edycji (używane przez panel). Daty muszą zgadzać się z
// server/edition.mjs oraz z tekstami w index.html, regulamin.html i zamowienie.html.
window.LECIMY_EDITION = {
  name: 'Edycja 1',
  startISO: '2026-11-01T00:00:00+01:00',
  endISO: '2027-01-31T23:59:59+01:00',
  startLabel: '1 listopada 2026',
  endLabel: '31 stycznia 2027',
  // Adresy e-mail, które widzą panel poza oknem edycji (testy właściciela przed startem), np. ['ty@domena.pl'].
  previewEmails: [],
};
