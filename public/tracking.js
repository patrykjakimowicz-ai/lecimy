/* ============================================================
   Śledzenie ruchu i konwersji + zgody na cookies (RODO / PKE)
   ------------------------------------------------------------
   1) Uzupełnij identyfikatory poniżej. Puste ID = dane narzędzie
      NIE jest ładowane. Gdy wszystkie są puste, baner się nie
      pokazuje i nic nie jest śledzone.
   2) Skrypty analityczne i marketingowe ładują się dopiero PO
      wyrażeniu zgody (zgodę można cofnąć w stopce: „Ustawienia cookies”).
   3) Atrybucja UTM (skąd przyszło zamówienie) działa zawsze i bez
      cookies: parametry z adresu są przenoszone w linkach do
      zamówienia i zapisywane przy zamówieniu na serwerze.
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = {
    ga4: '',          // np. 'G-XXXXXXXXXX'   (Google Analytics 4)
    metaPixel: '',    // np. '1234567890123456' (Meta Pixel — Facebook/Instagram)
    tiktokPixel: '',  // np. 'CXXXXXXXXXXXXXXXXXXX' (TikTok Pixel)
  };

  var STORAGE_KEY = 'lecimy_consent_v1';
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ttclid', 'gclid'];

  var trackingConfigured = !!(CONFIG.ga4 || CONFIG.metaPixel || CONFIG.tiktokPixel);

  /* ── Atrybucja UTM (bez cookies) ───────────────────────── */
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

  /* ── Zgody ──────────────────────────────────────────────── */
  function readConsent() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveConsent(c) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ analytics: !!c.analytics, marketing: !!c.marketing, ts: Date.now() })); } catch (e) { /* brak localStorage */ }
  }

  /* ── Ładowanie narzędzi (tylko po zgodzie) ──────────────── */
  var loaded = { ga4: false, meta: false, tiktok: false };
  var queue = []; // zdarzenia zgłoszone zanim narzędzie się załadowało

  function loadScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function loadGA4() {
    if (loaded.ga4 || !CONFIG.ga4) return;
    loaded.ga4 = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.ga4, { anonymize_ip: true });
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.ga4));
    flush();
  }

  function loadMeta() {
    if (loaded.meta || !CONFIG.metaPixel) return;
    loaded.meta = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', CONFIG.metaPixel);
    window.fbq('track', 'PageView');
    flush();
  }

  function loadTikTok() {
    if (loaded.tiktok || !CONFIG.tiktokPixel) return;
    loaded.tiktok = true;
    /* eslint-disable */
    !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(CONFIG.tiktokPixel);ttq.page()}(window,document,'ttq');
    /* eslint-enable */
    flush();
  }

  function applyConsent(c) {
    if (c && c.analytics) loadGA4();
    if (c && c.marketing) { loadMeta(); loadTikTok(); }
  }

  /* ── Zdarzenia konwersji ────────────────────────────────── */
  // lecimyTrack('begin_checkout', {value: 1597, currency: 'PLN', item: 'Kompletny System'})
  // lecimyTrack('purchase', {transaction_id, value, currency, item})
  function sendTo(tool, name, p) {
    if (tool === 'ga4' && window.gtag) {
      var items = p.item ? [{ item_name: p.item, price: p.value, quantity: 1 }] : undefined;
      window.gtag('event', name, { transaction_id: p.transaction_id, value: p.value, currency: p.currency || 'PLN', items: items });
      return true;
    }
    if (tool === 'meta' && window.fbq) {
      var metaName = name === 'purchase' ? 'Purchase' : name === 'begin_checkout' ? 'InitiateCheckout' : null;
      if (metaName) window.fbq('track', metaName, { value: p.value, currency: p.currency || 'PLN', content_name: p.item });
      return true;
    }
    if (tool === 'tiktok' && window.ttq) {
      var ttName = name === 'purchase' ? 'CompletePayment' : name === 'begin_checkout' ? 'InitiateCheckout' : null;
      if (ttName) window.ttq.track(ttName, { value: p.value, currency: p.currency || 'PLN', content_name: p.item });
      return true;
    }
    return false;
  }

  // Wysyła zakolejkowane zdarzenia do tych narzędzi, które są już załadowane (czyli: za zgodą).
  function flush() {
    queue.forEach(function (ev) {
      ['ga4', 'meta', 'tiktok'].forEach(function (tool) {
        var isLoaded = tool === 'ga4' ? loaded.ga4 : tool === 'meta' ? loaded.meta : loaded.tiktok;
        if (isLoaded && !ev.done[tool]) ev.done[tool] = sendTo(tool, ev.name, ev.params);
      });
    });
  }

  window.lecimyTrack = function (name, params) {
    if (!trackingConfigured) return;
    queue.push({ name: name, params: params || {}, done: {} });
    if (queue.length > 20) queue.shift();
    flush();
  };

  /* ── Baner zgód ─────────────────────────────────────────── */
  var bannerEl = null;

  function closeBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function decide(analytics, marketing) {
    var c = { analytics: analytics, marketing: marketing };
    saveConsent(c);
    applyConsent(c);
    closeBanner();
  }

  function openBanner() {
    if (!trackingConfigured || bannerEl) return;
    var current = readConsent() || { analytics: false, marketing: false };

    bannerEl = document.createElement('div');
    bannerEl.className = 'cookie-banner';
    bannerEl.setAttribute('role', 'dialog');
    bannerEl.setAttribute('aria-label', 'Ustawienia cookies');
    bannerEl.innerHTML =
      '<div class="cookie-banner__inner">' +
        '<p class="cookie-banner__title">Szanujemy Twoją prywatność</p>' +
        '<p class="cookie-banner__text">Używamy plików cookies i podobnych technologii. Niezbędne zawsze działają (np. logowanie). ' +
        'Za Twoją zgodą korzystamy też z cookies <strong>analitycznych</strong> (Google Analytics — statystyki odwiedzin) ' +
        'oraz <strong>marketingowych</strong> (piksele Meta i TikTok — pomiar skuteczności reklam). ' +
        'Zgodę możesz w każdej chwili zmienić w stopce. <a href="polityka-prywatnosci.html#cookies">Więcej w polityce prywatności</a>.</p>' +
        '<div class="cookie-banner__details" hidden>' +
          '<label class="cookie-banner__opt"><input type="checkbox" checked disabled /> <span>Niezbędne (zawsze włączone)</span></label>' +
          '<label class="cookie-banner__opt"><input type="checkbox" id="cookieAnalytics"' + (current.analytics ? ' checked' : '') + ' /> <span>Analityczne — Google Analytics</span></label>' +
          '<label class="cookie-banner__opt"><input type="checkbox" id="cookieMarketing"' + (current.marketing ? ' checked' : '') + ' /> <span>Marketingowe — Meta Pixel, TikTok Pixel</span></label>' +
        '</div>' +
        '<div class="cookie-banner__actions">' +
          '<button type="button" class="cookie-btn" data-act="reject">Tylko niezbędne</button>' +
          '<button type="button" class="cookie-btn" data-act="custom">Dostosuj</button>' +
          '<button type="button" class="cookie-btn" data-act="accept">Akceptuję wszystkie</button>' +
        '</div>' +
      '</div>';

    bannerEl.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      var details = bannerEl.querySelector('.cookie-banner__details');
      if (act === 'reject') decide(false, false);
      else if (act === 'accept') decide(true, true);
      else if (act === 'custom') {
        if (details.hidden) {
          details.hidden = false;
          e.target.textContent = 'Zapisz wybór';
        } else {
          decide(bannerEl.querySelector('#cookieAnalytics').checked, bannerEl.querySelector('#cookieMarketing').checked);
        }
      }
    });

    document.body.appendChild(bannerEl);
  }

  window.lecimyConsent = { open: openBanner };

  function addFooterLink() {
    if (!trackingConfigured) return;
    var targets = document.querySelectorAll('.footer__bottom');
    for (var i = 0; i < targets.length; i++) {
      var p = document.createElement('p');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cookie-settings-link';
      btn.textContent = 'Ustawienia cookies';
      btn.addEventListener('click', function () { bannerEl ? closeBanner() : openBanner(); });
      p.appendChild(btn);
      targets[i].appendChild(p);
    }
  }

  function init() {
    propagateAttribution();
    if (!trackingConfigured) return;
    var c = readConsent();
    if (c) applyConsent(c); else openBanner();
    addFooterLink();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
