// Treść kursu - mieszka WYŁĄCZNIE na serwerze. Panel dostaje stąd tylko to, co jest odblokowane
// (zablokowany moduł wychodzi bez tytułów lekcji i bez linków do wideo).
//
// Wideo: YouTube = pełny adres embed; Bunny Stream = https://iframe.mediadelivery.net/embed/{library}/{videoId}.
// Zamień PLACEHOLDER_VIDEO i materials na prawdziwe, kiedy filmy będą wgrane.
//
// unlockISO: kiedy moduł się odblokowuje (liczone od startu edycji 20.11.2026).
const PLACEHOLDER_VIDEO = 'https://www.youtube-nocookie.com/embed/Ib6mamWQEME';

export const COURSE = [
  {
    id: 'modul1',
    title: 'Moduł 1: Dyscyplina',
    unlockISO: '2026-11-20T00:00:00+01:00',
    unlockLabel: '20 listopada 2026',
    lessons: [
      { id: 'w1', title: 'Wstęp do programu', description: 'Jak korzystać z platformy i jak przejść program, żeby wyciągnąć z niego maksimum.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 'd1', title: 'Wprowadzenie do filaru Dyscyplina', description: 'Dlaczego motywacja zawodzi i jak zbudować system, który dowozi wyniki nawet w najgorsze dni.', video: PLACEHOLDER_VIDEO, materials: [{ label: 'Karta pracy - Fundament dyscypliny (PDF)', url: '#' }] },
      { id: 'd2', title: 'System nawyków krok po kroku', description: 'Budowa nawyków, które utrzymują się same - bez polegania na sile woli.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 'd3', title: 'Radzenie sobie z oporem', description: 'Co robić w dni, kiedy nic się nie chce - konkretny protokół awaryjny.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 'mw1', title: 'Masterclass Wdrożeniowy', description: 'Wdrożenie wszystkiego krok po kroku, razem ze mną.', video: PLACEHOLDER_VIDEO, materials: [] },
    ],
  },
  {
    id: 'szczescie',
    title: 'Moduł 2: Szczęście',
    unlockISO: '2026-12-20T00:00:00+01:00',
    unlockLabel: '20 grudnia 2026',
    lessons: [
      { id: 's1', title: 'Czym naprawdę jest szczęście', description: 'Odkryj, co realnie daje Ci energię i radość - bez pogoni za iluzją.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 's2', title: 'Praca z emocjami na co dzień', description: 'Proste narzędzia do regulacji emocji w codziennym życiu.', video: PLACEHOLDER_VIDEO, materials: [] },
    ],
  },
  {
    id: 'finanse',
    title: 'Moduł 3: Finanse',
    unlockISO: '2026-12-20T00:00:00+01:00',
    unlockLabel: '20 grudnia 2026',
    lessons: [
      { id: 'f1', title: 'Psychologia pieniądza', description: 'Jak Twoje przekonania o pieniądzach kształtują Twoje decyzje finansowe.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 'f2', title: 'Budowanie systemu finansowego', description: 'Konkretne kroki do uporządkowania budżetu i budowania zysku.', video: PLACEHOLDER_VIDEO, materials: [] },
    ],
  },
  {
    id: 'duchowosc',
    title: 'Moduł 4: Duchowość',
    unlockISO: '2027-01-20T00:00:00+01:00',
    unlockLabel: '20 stycznia 2027',
    lessons: [
      { id: 'du1', title: 'Wejście w głąb siebie', description: 'Wprowadzenie do pracy z podświadomością, medytacji i wizualizacji.', video: PLACEHOLDER_VIDEO, materials: [] },
      { id: 'du2', title: 'Medytacja prowadzona', description: 'Sesja medytacji prowadzonej do samodzielnej praktyki.', video: PLACEHOLDER_VIDEO, materials: [] },
    ],
  },
];

/** Kurs dla panelu: odblokowane moduły w całości, zablokowane tylko z nazwą i datą. Admin widzi wszystko. */
export function courseFor({ admin, now = Date.now() }) {
  return COURSE.map((m) => {
    const unlocked = admin || now >= Date.parse(m.unlockISO);
    if (unlocked) return { id: m.id, title: m.title, locked: false, lessons: m.lessons };
    return { id: m.id, title: 'Moduł zablokowany', locked: true, unlockLabel: m.unlockLabel, lessons: [] };
  });
}
