// Okno sprzedaży i dostępu bieżącej edycji (używane przez panel, ofertę i zamówienie).
// Daty muszą zgadzać się z server/edition.mjs oraz z tekstami w index.html, regulamin.html i zamowienie.html.
window.LECIMY_EDITION = {
  name: 'Edycja 1',
  salesCloseISO: '2026-11-14T00:00:00+01:00',
  salesCloseLabel: '14 listopada 2026',
  startISO: '2026-11-14T00:00:00+01:00',
  endISO: '2027-02-13T23:59:59+01:00',
  startLabel: '14 listopada 2026',
  endLabel: '13 lutego 2027',
  // Adresy e-mail, które widzą panel poza oknem edycji (testy właściciela przed startem), np. ['ty@domena.pl'].
  previewEmails: [],
};

// Stan sprzedaży: po terminie zamknięcia ukrywamy możliwość zakupu (serwer też odrzuca zamówienia).
window.LECIMY_applySalesState = function () {
  var ed = window.LECIMY_EDITION;
  var closed = Date.now() >= Date.parse(ed.salesCloseISO);
  window.LECIMY_SALES_CLOSED = closed;
  if (!closed) return;

  // Strona główna: przyciski w cenniku
  document.querySelectorAll('.btn--pricing').forEach(function (btn) {
    btn.textContent = 'Sprzedaż zamknięta';
    btn.removeAttribute('href');
    btn.setAttribute('aria-disabled', 'true');
    btn.style.opacity = '0.55';
    btn.style.pointerEvents = 'none';
  });

  // Strona zamówienia: zamiast formularza komunikat
  var form = document.getElementById('orderForm');
  if (form) {
    var box = document.createElement('div');
    box.style.cssText = 'padding:24px;border:1px solid var(--clr-border);border-radius:12px;text-align:center;';
    box.innerHTML = '<h2 style="margin-bottom:8px;">Sprzedaż tej edycji została zamknięta</h2>' +
      '<p style="color:var(--clr-text-muted);">Zapisy trwały do ' + ed.salesCloseLabel + '. Chcesz dołączyć do kolejnej edycji? Napisz do nas: kontakt@weskaacademy.pl.</p>';
    form.parentNode.insertBefore(box, form);
    form.style.display = 'none';
  }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.LECIMY_applySalesState);
else window.LECIMY_applySalesState();

// ── Licznik do zamknięcia sprzedaży (pasek na górze strony) ──
(function () {
  var ed = window.LECIMY_EDITION;
  var timer = null;

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function render(bar) {
    var left = Date.parse(ed.salesCloseISO) - Date.now();
    if (left <= 0) {
      clearInterval(timer);
      bar.remove();
      document.documentElement.style.removeProperty('--bar-h');
      document.body.classList.remove('has-countdown');
      window.LECIMY_applySalesState();
      return;
    }
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    bar.querySelector('[data-cd]').innerHTML =
      (d > 0 ? '<b>' + d + '</b><i>d</i> ' : '') +
      '<b>' + pad(h) + '</b><i>g</i> <b>' + pad(m) + '</b><i>min</i> <b>' + pad(s) + '</b><i>s</i>';
  }

  function init() {
    if (Date.now() >= Date.parse(ed.salesCloseISO)) return;
    if (!document.getElementById('nav') && !document.getElementById('orderForm')) return; // tylko index i zamówienie
    var bar = document.createElement('div');
    bar.className = 'countdown-bar';
    bar.setAttribute('role', 'timer');
    bar.innerHTML = '<span class="countdown-bar__label">Zapisy zamykamy za:</span> <span class="countdown-bar__time" data-cd></span>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('has-countdown');
    render(bar);
    timer = setInterval(function () { render(bar); }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
