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
  var units = {};

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function plural(n, one, few, many) {
    if (n === 1) return one;
    var m10 = n % 10, m100 = n % 100;
    return (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? few : many;
  }

  function setUnit(key, value, label) {
    var u = units[key];
    if (!u) return;
    var text = key === 'd' ? String(value) : pad(value);
    if (u.value.textContent !== text) {
      u.value.textContent = text;
      u.value.classList.remove('tick');
      void u.value.offsetWidth; // restart animacji
      u.value.classList.add('tick');
    }
    if (u.label.textContent !== label) u.label.textContent = label;
  }

  function render(bar) {
    var left = Date.parse(ed.salesCloseISO) - Date.now();
    if (left <= 0) {
      clearInterval(timer);
      bar.classList.add('is-leaving');
      setTimeout(function () {
        bar.remove();
        document.body.classList.remove('has-countdown');
        window.LECIMY_applySalesState();
      }, 600);
      return;
    }
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;

    units.d.root.hidden = d === 0;
    setUnit('d', d, plural(d, 'dzień', 'dni', 'dni'));
    setUnit('h', h, 'godz');
    setUnit('m', m, 'min');
    setUnit('s', s, 'sek');

    // Im bliżej końca, tym mocniejsze podświetlenie
    bar.classList.toggle('is-urgent', left < 24 * 3600 * 1000);
    bar.classList.toggle('is-critical', left < 3600 * 1000);
  }

  function unitHtml(key) {
    return '<div class="cd-unit" data-u="' + key + '"><b class="cd-unit__v">00</b><small class="cd-unit__l"></small></div>';
  }

  function init() {
    if (Date.now() >= Date.parse(ed.salesCloseISO)) return;
    if (!document.getElementById('nav') && !document.getElementById('orderForm')) return; // tylko index i zamówienie

    var bar = document.createElement('div');
    bar.className = 'countdown-bar';
    bar.setAttribute('role', 'timer');
    bar.innerHTML =
      '<div class="countdown-bar__inner">' +
        '<span class="cd-label"><span class="cd-dot" aria-hidden="true"></span><span class="cd-label__text">Zapisy zamykamy za</span></span>' +
        '<div class="cd-units">' + unitHtml('d') + unitHtml('h') + unitHtml('m') + unitHtml('s') + '</div>' +
      '</div>';
    document.body.insertBefore(bar, document.body.firstChild);

    ['d', 'h', 'm', 's'].forEach(function (k) {
      var root = bar.querySelector('[data-u="' + k + '"]');
      units[k] = { root: root, value: root.querySelector('.cd-unit__v'), label: root.querySelector('.cd-unit__l') };
    });

    render(bar);
    document.body.classList.add('has-countdown');
    requestAnimationFrame(function () { bar.classList.add('is-in'); });
    timer = setInterval(function () { render(bar); }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
