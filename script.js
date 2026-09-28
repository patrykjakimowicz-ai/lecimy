/* ================================================
   INNER CIRCLE — SCRIPT.JS
   Moduły: Smooth scroll → Nav → Reveal → Parallax →
           Counters → Video → Slider → Pricing Toggle → FAQ
   ================================================ */

'use strict';

/* ── 0. SMOOTH SCROLL — Lenis ────────────────────
   Inercyjny, wygładzony scroll (jak w Framer/Lenis).
   Podpina się też pod linki kotwiczące (href="#...").
   ------------------------------------------------ */
function initSmoothScroll() {
  if (typeof Lenis === 'undefined') return null;

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.5,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId.length <= 1) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -navHeight });
    });
  });

  return lenis;
}

/* ── 1. NAV — sticky z blur po scrollu ──────────
   Dodaje klasę .scrolled gdy strona przekroczy 80px.
   CSS obsługuje animację tła/blur (transition).
   ------------------------------------------------ */
const nav = document.getElementById('nav');
const NAV_THRESHOLD = 1;

function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > NAV_THRESHOLD);
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();


/* ── 2. REVEAL — IntersectionObserver ───────────
   Każdy element [data-reveal] wchodzi z fade+slide
   gdy 15% powierzchni jest widoczne.
   Opcjonalne data-delay="NNN" (ms) opóźnia transition.
   data-stagger na kartach gridowych: JS numeruje delay automatycznie.
   ------------------------------------------------ */
function initReveal() {
  // Ustaw stagger delay na kartach z [data-stagger]
  const staggerGroups = document.querySelectorAll('[data-stagger]');
  let staggerIndex = 0;
  let lastParent = null;
  staggerGroups.forEach((el) => {
    if (el.parentElement !== lastParent) { staggerIndex = 0; lastParent = el.parentElement; }
    el.style.transitionDelay = `${staggerIndex * 60}ms`;
    staggerIndex++;
  });

  // Ustaw delay z data-delay na pozostałych elementach
  document.querySelectorAll('[data-reveal][data-delay]').forEach((el) => {
    el.style.transitionDelay = `${el.dataset.delay}ms`;
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // jednorazowe
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px 60px 0px' });

  document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
}


/* ── 3. PARALLAX — hero background ──────────────
   Element [data-parallax] przesuwa się 0.4× wolniej niż scroll.
   requestAnimationFrame zapobiega jankowaniu.
   ------------------------------------------------ */
function initParallax() {
  const parallaxEl = document.querySelector('[data-parallax]');
  if (!parallaxEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let ticking = false;

  function applyParallax() {
    parallaxEl.style.transform = `translateY(${window.scrollY * 0.4}px)`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(applyParallax);
      ticking = true;
    }
  }, { passive: true });
}


/* ── 4. COUNTER ANIMATION — statystyki ──────────
   Gdy stats__num wchodzi w viewport, liczba "odlicza"
   od 0 do wartości data-count przez 1.5s.
   ------------------------------------------------ */
function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1500;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.floor(eased * target).toLocaleString('pl-PL');
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString('pl-PL');
  }
  requestAnimationFrame(step);
}

function initCounters() {
  const counterEls = document.querySelectorAll('[data-count]');
  if (!counterEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counterEls.forEach((el) => observer.observe(el));
}


/* ── 5. VIDEO LIGHTBOX ───────────────────────────
   Klik na .video-thumb otwiera lightbox z iframe.
   Podmień src na docelowy URL YouTube/Vimeo.
   ------------------------------------------------ */
function initVideo() {
  const trigger = document.getElementById('videoTrigger');
  if (!trigger) return;

  // URL do podmiany na docelowy
  const VIDEO_URL = 'https://www.youtube.com/embed/Ib6mamWQEME?autoplay=1&rel=0&modestbranding=1';

  trigger.addEventListener('click', () => {
    // Utwórz overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:200;
      background:rgba(0,0,0,0.92);
      display:flex;align-items:center;justify-content:center;
      animation:fadeIn 0.3s ease;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = VIDEO_URL;
    iframe.style.cssText = 'width:min(90vw,960px);aspect-ratio:16/9;border:none;border-radius:8px;';
    iframe.allow = 'autoplay; fullscreen';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Zamknij');
    closeBtn.style.cssText = `
      position:absolute;top:1.5rem;right:1.5rem;
      font-size:2rem;color:#fff;background:none;border:none;cursor:pointer;
      line-height:1;opacity:0.7;
    `;
    closeBtn.onmouseenter = () => (closeBtn.style.opacity = '1');
    closeBtn.onmouseleave = () => (closeBtn.style.opacity = '0.7');

    function closeOverlay() {
      iframe.src = ''; // zatrzymaj wideo
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }

    function onEsc(e) { if (e.key === 'Escape') closeOverlay(); }

    closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', onEsc);

    overlay.append(iframe, closeBtn);
    document.body.append(overlay);
  });

  // Styl fadeIn dla overlay
  if (!document.getElementById('lightboxStyle')) {
    const style = document.createElement('style');
    style.id = 'lightboxStyle';
    style.textContent = '@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }';
    document.head.append(style);
  }
}


/* ── 6. TESTIMONIALS SLIDER ──────────────────────
   prev/next buttons + dot navigation + autoplay co 5s.
   Każda zmiana slajdu: fade via CSS animation.
   ------------------------------------------------ */
function initSlider() {
  const cards = document.querySelectorAll('.testimonial-card');
  const dots  = document.querySelectorAll('.dot');
  if (!cards.length) return;

  let current = 0;
  let animating = false;
  let autoplayTimer;

  function goTo(index, direction) {
    const next = (index + cards.length) % cards.length;
    if (next === current || animating) return;
    animating = true;

    const dir = direction || (next > current ? 'right' : 'left');
    const outClass = dir === 'right' ? 'slide-out-left' : 'slide-out-right';
    const inClass  = dir === 'right' ? 'slide-in-right' : 'slide-in-left';

    const oldCard = cards[current];
    const newCard = cards[next];

    oldCard.classList.add(outClass);
    oldCard.classList.remove('active');
    dots[current].classList.remove('active');

    newCard.classList.add(inClass);
    newCard.offsetHeight;
    newCard.classList.add('active');
    newCard.classList.remove(inClass);
    dots[next].classList.add('active');

    current = next;

    oldCard.addEventListener('transitionend', () => {
      oldCard.classList.remove(outClass);
      animating = false;
    }, { once: true });

    setTimeout(() => { animating = false; }, 600);
  }

  function startAutoplay() {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => goTo(current + 1, 'right'), 5000);
  }

  document.querySelector('.slider-btn--prev')?.addEventListener('click', () => {
    goTo(current - 1, 'left'); startAutoplay();
  });
  document.querySelector('.slider-btn--next')?.addEventListener('click', () => {
    goTo(current + 1, 'right'); startAutoplay();
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goTo(i, i > current ? 'right' : 'left');
      startAutoplay();
    });
  });

  startAutoplay();
}




/* ── 8. FAQ — smooth accordion height ───────────
   Natywny <details> działa, ale animacja zamknięcia
   nie jest obsługiwana przez przeglądarkę.
   Tu: JS animuje max-height dla płynnego close.
   ------------------------------------------------ */
function initFAQ() {
  const items = document.querySelectorAll('.faq-item');

  items.forEach((item) => {
    const summary = item.querySelector('summary');
    const answer  = item.querySelector('.faq-item__answer');
    if (!answer) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();

      if (item.open) {
        item.classList.add('is-closing');
        answer.addEventListener('transitionend', () => {
          item.open = false;
          item.classList.remove('is-closing');
        }, { once: true });
      } else {
        item.open = true;
      }
    });
  });
}


/* ── 9. ABOUT VIDEO — lazy YouTube embed ─────────
   Klik na thumbnail → zamienia na iframe.
   Obchodzi błąd 153 na plikach lokalnych (file://).
   ------------------------------------------------ */
function initAboutVideo() {
  const container = document.getElementById('aboutVideo');
  if (!container) return;

  container.addEventListener('click', () => {
    const videoId = container.dataset.videoId;
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0&modestbranding=1';
    iframe.title = 'O programie LECIMY';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:20px;';

    container.innerHTML = '';
    container.appendChild(iframe);
  });
}


/* ── 10. CURSOR DOT — kółko podąża za kursorem ── */
function initCursorGlow() {
  const dot = document.getElementById('cursorGlow');
  if (!dot || window.matchMedia('(max-width: 768px)').matches) return;

  let mx = 0, my = 0;
  let dx = 0, dy = 0;

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  });

  const size = { normal: 32, hover: 48 };
  let currentSize = size.normal;

  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      dot.classList.add('is-hover');
      currentSize = size.hover;
    });
    el.addEventListener('mouseleave', () => {
      dot.classList.remove('is-hover');
      currentSize = size.normal;
    });
  });

  function animate() {
    dx += (mx - dx) * 0.15;
    dy += (my - dy) * 0.15;
    const half = currentSize / 2;
    dot.style.transform = `translate(${dx - half}px, ${dy - half}px)`;
    requestAnimationFrame(animate);
  }
  animate();
}


/* ── 11. JOURNEY TIMELINE — scroll-fill line + step reveal + confetti ── */
function initJourney() {
  const timeline = document.getElementById('journeyTimeline');
  const line = document.getElementById('journeyLine');
  const finale = timeline?.querySelector('.journey__finale');
  if (!timeline || !line || !finale) return;

  let confettiFired = false;

  let ticking = false;
  function updateLine() {
    const rect = timeline.getBoundingClientRect();
    const finaleDot = finale.querySelector('.journey__dot--final');
    const viewportMid = window.innerHeight * 0.6;

    const fillTo = viewportMid - rect.top;
    const dotRect = finaleDot.getBoundingClientRect();
    const maxFill = dotRect.top - rect.top + dotRect.height / 2;
    const progress = Math.max(0, Math.min(fillTo, maxFill));
    line.style.height = progress + 'px';

    if (!confettiFired && fillTo >= maxFill - 5) {
      confettiFired = true;
      fireConfetti(finaleDot || finale);
    }

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateLine);
      ticking = true;
    }
  }, { passive: true });
  updateLine();

  const steps = timeline.querySelectorAll('.journey__step, .journey__finale');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px 40px 0px' });

  steps.forEach((step) => observer.observe(step));
}

function fireConfetti(origin) {
  const rect = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#e8780c', '#f09030', '#ffffff', '#ffd700', '#ff6b35', '#ff4500'];
  const count = 80;

  // Flash pulse on the origin dot
  origin.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
  origin.style.boxShadow = '0 0 60px rgba(232,120,12,0.9), 0 0 120px rgba(232,120,12,0.5)';
  origin.style.transform = 'scale(1.3)';
  setTimeout(() => {
    origin.style.boxShadow = '';
    origin.style.transform = '';
  }, 600);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    const size = Math.random() * 8 + 5;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const velocity = 150 + Math.random() * 280;
    const dx = Math.cos(angle) * velocity;
    const dy = Math.sin(angle) * velocity - 100;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const rotation = Math.random() * 720 - 360;

    particle.style.cssText =
      'position:fixed;left:' + cx + 'px;top:' + cy + 'px;width:' + size + 'px;height:' + size + 'px;' +
      'background:' + color + ';border-radius:' + (Math.random() > 0.4 ? '50%' : '2px') + ';' +
      'pointer-events:none;z-index:1000;box-shadow:0 0 6px ' + color + ';';
    document.body.appendChild(particle);

    const duration = 1000 + Math.random() * 800;
    const delay = Math.random() * 120;
    particle.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx + 'px, ' + (dy + 200) + 'px) rotate(' + rotation + 'deg) scale(0.2)', opacity: 0 }
    ], {
      duration,
      delay,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: 'forwards'
    }).onfinish = () => particle.remove();
  }
}


/* ── 12. FOR-WHO LINES — dynamic angle + length ── */
function initForWhoLines() {
  const hub = document.querySelector('.for-who__hub');
  if (!hub) return;

  const lines = hub.querySelectorAll('.for-who__line');
  const leftCards = document.querySelectorAll('.for-who__col--left .for-who__card');
  const rightCards = document.querySelectorAll('.for-who__col--right .for-who__card');

  const cardTargets = [
    leftCards[0],
    leftCards[1],
    rightCards[0],
    rightCards[1],
  ];

  function positionLines() {
    const hubRect = hub.getBoundingClientRect();
    const cx = hubRect.left + hubRect.width / 2;
    const cy = hubRect.top + hubRect.height / 2;

    cardTargets.forEach((card, i) => {
      if (!card || !lines[i]) return;

      const cardRect = card.getBoundingClientRect();
      let dotX, dotY;

      if (i < 2) {
        dotX = cardRect.right;
      } else {
        dotX = cardRect.left;
      }
      dotY = cardRect.top + cardRect.height / 2;

      const dx = dotX - cx;
      const dy = dotY - cy;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      lines[i].style.width = length + 'px';
      lines[i].style.transform = 'rotate(' + angle + 'deg)';
    });
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => { positionLines(); ticking = false; });
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', positionLines, { passive: true });

  positionLines();
  setTimeout(positionLines, 500);
  setTimeout(positionLines, 1200);
}


/* ── INIT ────────────────────────────────────────
   Uruchom wszystkie moduły po załadowaniu DOM.
   ------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  initSmoothScroll();
  initReveal();
  initParallax();
  initCounters();
  initVideo();
  initAboutVideo();
  initCursorGlow();
  initSlider();
  initFAQ();
  initJourney();
  initForWhoLines();
});
