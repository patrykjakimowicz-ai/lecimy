// Treść kursu - mieszka WYŁĄCZNIE na serwerze. Panel dostaje stąd tylko to, co jest odblokowane
// (zablokowany moduł wychodzi bez tytułów lekcji i bez linków do wideo).
//
// Wideo: YouTube = pełny adres embed; Bunny Stream = https://iframe.mediadelivery.net/embed/{library}/{videoId}.
// Zamień PLACEHOLDER_VIDEO i materials na prawdziwe, kiedy filmy będą wgrane.
//
// unlockISO  - kiedy moduł się odblokowuje (liczone od startu edycji 20.11.2026).
// requires   - (na module albo na pojedynczej lekcji) 'masterclass': tylko dla kupujących dodatek Masterclass Wdrożeniowy (albo PRO).
//              'system': tylko pakiety Kompletny System i PRO (Fundament ma wyłącznie Wstęp i Dyscyplinę).
const V = 'https://www.youtube-nocookie.com/embed/Ib6mamWQEME'; // zaślepka
const L = (num, title, description = '', video = V) => ({ id: 'l' + num.replace('.', '_'), num, title, description, video, materials: [] });
const TOOL = (file, label) => ({ label, url: '/narzedzia/' + file }); // narzędzie wdrożeniowe (PDF w public/narzedzia)
const BUNNY = (videoId) => `https://iframe.mediadelivery.net/embed/815715/${videoId}`; // biblioteka Bunny: Lecimy

export const COURSE = [
  {
    id: 'wstep',
    title: '1. Wstęp',
    unlockISO: '2026-11-20T00:00:00+01:00',
    unlockLabel: '20 listopada 2026',
    lessons: [
      L('1.1', 'Wstęp do programu', 'Jak korzystać z platformy i jak przejść program, żeby wyciągnąć z niego maksimum.', BUNNY('2b1a50c1-14ca-457f-9e53-22541fff176f')),
      { ...L('M', 'Masterclass Wdrożeniowy', 'Wdrożenie wszystkiego krok po kroku, razem ze mną.', BUNNY('a2a22653-d031-47b9-8b24-8d3175cbb63b')), requires: 'masterclass', requiresLabel: 'Dostępny w dodatku Masterclass Wdrożeniowy' },
    ],
  },
  {
    id: 'dyscyplina',
    title: '2. Dyscyplina',
    unlockISO: '2026-11-20T00:00:00+01:00',
    unlockLabel: '20 listopada 2026',
    lessons: [
      { ...L('2.1', 'Mit motywacji i ekonomia siły woli', '', BUNNY('a11e7a30-2e46-4ff7-80df-08d608ff7cd3')), materials: [TOOL('Lecimy_Narzedzie_2.1_Arkusz_srodowiska.pdf', 'Narzędzie: Arkusz środowiska')] },
      { ...L('2.2', 'Protokół Startowy', '', BUNNY('81cea5db-8f05-47c1-a4a7-1bc6c1a48b6e')), materials: [TOOL('Lecimy_Narzedzie_2.2_Karta_porannej_sekwencji.pdf', 'Narzędzie: Karta porannej sekwencji')] },
      { ...L('2.3', 'Wieczorna rutyna i Architektura środowiska', '', BUNNY('ac6ec703-3a62-4735-96a2-55aa89fd9a7b')), materials: [TOOL('Lecimy_Narzedzie_2.3_Kolo_ratunkowe_na_overthinking.pdf', 'Narzędzie: Koło ratunkowe na overthinking')] },
      { ...L('2.4', 'Jak stać się najlepszą wersją siebie?', '', BUNNY('3f847074-81ef-4e2a-bcd2-0f00abc0a796')), materials: [TOOL('Lecimy_Narzedzie_2.4_Formularz_odpowiedzialnosci.pdf', 'Narzędzie: Formularz odpowiedzialności')] },
      { ...L('2.5', '„Dlaczego” to robisz?', '', BUNNY('00ff3c0d-fa52-4bc2-87b0-4091be8648b3')), materials: [TOOL('Lecimy_Narzedzie_2.5_Moje_prawdziwe_dlaczego.pdf', 'Narzędzie: Moje prawdziwe „dlaczego”')] },
      { ...L('2.6', 'Architektura kryzysowa i zarządzanie błędem', '', BUNNY('a5413cb9-1772-42ef-b02b-dc5679ebeb7e')), materials: [TOOL('Lecimy_Narzedzie_2.6_Czarna_skrzynka_i_plan_awaryjny.pdf', 'Narzędzie: Czarna skrzynka i plan awaryjny')] },
      { ...L('2.7', 'Mechanizmy, które decydują, czy odniesiesz sukces', '', BUNNY('c54b6783-e604-476b-b51d-73f4df7a3d47')), materials: [TOOL('Lecimy_Narzedzie_2.7_Habit_tracker.pdf', 'Narzędzie: Habit tracker')] },
    ],
  },
  {
    id: 'szczescie',
    requires: 'system',
    requiresLabel: 'Dostępny w pakiecie Kompletny System',
    title: '3. Szczęście',
    unlockISO: '2026-12-20T00:00:00+01:00',
    unlockLabel: '20 grudnia 2026',
    lessons: [
      L('3.1', 'Anatomia Szczęścia – Dlaczego wciąż gonisz horyzont?'),
      L('3.2', 'Wdzięczność, czyli jak zablokować ewolucyjny błąd oprogramowania'),
      L('3.3', 'Sztuka odpuszczania: Dlaczego twoja wartość nie zależy od tego, ile zrobisz'),
      L('3.4', 'Zmiana biegu na „Tu i Teraz”'),
      L('3.5', 'Szczęście w trakcie burzy. Jak przetrwać kryzys?'),
      L('3.6', 'Prawdziwe Spełnienie – Zrzucenie maski i siła dawania'),
    ],
  },
  {
    id: 'finanse',
    requires: 'system',
    requiresLabel: 'Dostępny w pakiecie Kompletny System',
    title: '4. Finanse',
    unlockISO: '2026-12-20T00:00:00+01:00',
    unlockLabel: '20 grudnia 2026',
    lessons: [
      L('4.1', 'Psychologia Pieniądza, Mindset & Dekonstrukcja Ego'),
      L('4.2', 'Architektura Przedsiębiorstwa, Zysk & Dźwignia'),
      L('4.3', 'Inżynieria Ceny & Psychologia Sprzedaży'),
      L('4.4', 'Sztuka Negocjacji, Obrona Marży & Egzekucja'),
    ],
  },
  {
    id: 'duchowosc',
    requires: 'system',
    requiresLabel: 'Dostępny w pakiecie Kompletny System',
    title: '5. Duchowość',
    unlockISO: '2027-01-20T00:00:00+01:00',
    unlockLabel: '20 stycznia 2027',
    lessons: [
      L('5.1', 'Omówienie działania medytacji, hipnoz, afirmacji etc.'),
      L('5.2', 'XXX'),
      L('5.3', 'XXX'),
      L('5.4', 'Numerologia'),
    ],
  },
];

/**
 * Kurs dla panelu. Zablokowany moduł wychodzi tylko z nazwą i powodem (data albo brak dodatku), bez lekcji i wideo.
 * Admin widzi wszystko; klient - to, na co pozwala data odblokowania i jego zakupy (entitlements).
 */
export function courseFor({ admin, entitlements = {}, now = Date.now() }) {
  const has = (req) => admin || !req || !!entitlements[req];
  return COURSE.map((m) => {
    const open = admin || now >= Date.parse(m.unlockISO);
    if (!has(m.requires) || !open) {
      const lockNote = !has(m.requires) ? m.requiresLabel : 'Odblokowanie: ' + m.unlockLabel;
      return { id: m.id, title: m.title, locked: true, lockNote, lessons: [] };
    }
    // Pojedyncza lekcja bez uprawnień: tylko tytuł i kłódka, bez wideo i opisu.
    const lessons = m.lessons.map((l) =>
      has(l.requires) ? l : { id: l.id, num: l.num, title: l.title, locked: true, lockNote: l.requiresLabel }
    );
    return { id: m.id, title: m.title, locked: false, lessons };
  });
}
