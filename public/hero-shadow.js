/* Animowane tło hero (tylko desktop): zapętlone wideo fx/shadow-loop.mp4.
   Ładowane dopiero na desktopie (telefon nic nie pobiera), pauza poza ekranem i w tle karty. */
(function () {
  var video = document.querySelector('.hero__video');
  if (!video) return;

  var desktop = window.matchMedia('(min-width: 769px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var visible = true, loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    video.poster = video.dataset.poster;
    if (!reduced.matches) video.src = video.dataset.src;
  }

  function update() {
    if (!desktop.matches) { video.pause(); return; }
    load();
    if (reduced.matches) { video.pause(); return; }
    if (!video.src) video.src = video.dataset.src;
    if (visible && !document.hidden) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      video.pause();
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }).observe(video);
  }
  document.addEventListener('visibilitychange', update);
  if (desktop.addEventListener) desktop.addEventListener('change', update);
  if (reduced.addEventListener) reduced.addEventListener('change', update);
  update();
})();
