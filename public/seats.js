// Limit miejsc w pakietach (VIP: 25 na edycję). Źródłem prawdy jest serwer (/api/seats) — on też odrzuca
// zamówienia po wyczerpaniu miejsc. Ten skrypt tylko pokazuje stan w cenniku i blokuje wybór pakietu w formularzu.
(function () {
  // Ten sam backend co API_BASE w zamowienie.html i podziekowanie.html (lokalnie: ten sam host).
  var API_BASE = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? '' : 'https://lecimy-xlxt.onrender.com';

  function applyPricing(pakiet, info) {
    var card = document.querySelector('.pricing-card--' + pakiet.toLowerCase());
    if (!card) return;
    var badge = card.querySelector('.pricing-card__limit');
    var btn = card.querySelector('.btn--pricing');
    if (info.left <= 0) {
      if (badge) badge.textContent = 'Miejsca wyprzedane';
      if (btn && !window.LECIMY_SALES_CLOSED) {
        btn.textContent = 'Brak wolnych miejsc';
        btn.removeAttribute('href');
        btn.setAttribute('aria-disabled', 'true');
        btn.style.opacity = '0.55';
        btn.style.pointerEvents = 'none';
      }
    } else if (badge && info.left < info.limit) {
      badge.textContent = 'Zostało ' + info.left + ' z ' + info.limit + ' miejsc';
    }
  }

  function applyOrderForm(pakiet, info) {
    var label = document.querySelector('.order-package[data-package="' + pakiet + '"]');
    if (!label || info.left > 0) return;
    var input = label.querySelector('input');
    var price = label.querySelector('.order-package__price');
    input.disabled = true;
    label.style.opacity = '0.5';
    label.style.cursor = 'not-allowed';
    if (price) price.textContent = 'Wyprzedane';
    if (input.checked) {
      // Wybrany był pakiet bez miejsc (np. z linku ?pakiet=VIP) — przełączamy na Kompletny System.
      var fallback = document.querySelector('.order-package[data-package="Kompletny System"] input');
      if (fallback) {
        fallback.checked = true;
        fallback.dispatchEvent(new Event('change'));
      }
      var status = document.getElementById('orderStatus');
      if (status) {
        status.textContent = 'Wszystkie miejsca w pakiecie ' + pakiet + ' zostały zajęte — wybraliśmy dla Ciebie pakiet Kompletny System.';
        status.classList.add('is-visible');
      }
    }
  }

  function run() {
    fetch(API_BASE + '/api/seats')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        Object.keys(data).forEach(function (pakiet) {
          applyPricing(pakiet, data[pakiet]);
          applyOrderForm(pakiet, data[pakiet]);
        });
      })
      .catch(function () { /* brak danych — serwer i tak pilnuje limitu przy zamówieniu */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
