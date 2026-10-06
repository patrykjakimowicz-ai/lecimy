/* ============================================================
   Pomiar ruchu i konwersji — bez cookies, bez zgód
   ------------------------------------------------------------
   - Analityka: Plausible (skrypt w <head> każdej strony; nie zapisuje
     nic na urządzeniu użytkownika).
   - Atrybucja UTM: parametry z adresu (utm_*, ttclid, fbclid, gclid)
     są przenoszone w linkach do zamówienia i zapisywane przy zamówieniu
     na serwerze — dzięki temu wiadomo, z jakiego źródła przyszła sprzedaż.
   - Zdarzenia: lecimyTrack('begin_checkout' | 'purchase', {...}) → Plausible.
   ============================================================ */
(function () {
  'use strict';

  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid'];

  function readAttribution() {
    var out = {};
    try {
      var params = new URLSearchParams(window.location.search);
      ATTR_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) out[k] = v.slice(0, 200);
      });
    } catch (e) { /* stare przeglądarki */ }
    return out;
  }
  window.lecimyAttribution = readAttribution;

  // Przenieś UTM do linków prowadzących do zamówienia, żeby źródło nie zginęło po drodze.
  function propagateAttribution() {
    var attr = readAttribution();
    var keys = Object.keys(attr);
    if (!keys.length) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || !/^(\/?zamowienie\.html)(\?|#|$)/.test(href)) continue;
      var url = new URL(href, window.location.href);
      keys.forEach(function (k) { if (!url.searchParams.has(k)) url.searchParams.set(k, attr[k]); });
      links[i].setAttribute('href', url.pathname.replace(/^\//, '') + url.search + url.hash);
    }
  }

  // lecimyTrack('begin_checkout', {value, currency, item})
  // lecimyTrack('purchase', {transaction_id, value, currency, item})
  window.lecimyTrack = function (name, params) {
    params = params || {};
    if (!window.plausible) return;
    var label = name === 'purchase' ? 'Purchase' : name === 'begin_checkout' ? 'Begin checkout' : name;
    var opts = { props: { item: params.item || '' } };
    if (name === 'purchase' && params.value) opts.revenue = { currency: params.currency || 'PLN', amount: params.value };
    try { window.plausible(label, opts); } catch (e) { /* analityka nie może psuć zakupu */ }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', propagateAttribution);
  else propagateAttribution();
})();
