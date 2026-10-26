// Skrypty rozmów dla settera i closera w karcie leada (crm.html).
// Treść dopasowuje się do odpowiedzi z ankiety (pro.html). Lead bez ankiety (np. ze starego CRM)
// dostaje wersję z pytaniami z ankiety zadawanymi na głos.
//
// Edytujesz treść? Zmieniaj teksty w cudzysłowach. Funkcje say/ask/tip składają wygląd - nie trzeba ich ruszać.
(function () {
  'use strict';

  var PRO_CENA = '9 997 zł';
  var MIEJSCA = 25;

  // Co zaznaczył w „Co najbardziej Cię blokuje" → który filar programu to rozwiązuje.
  var BLOKADA_FILAR = {
    'brak dyscypliny i prokrastynacja': ['Filar 1: Dyscyplina', 'budujemy system i nawyki, które dowożą wyniki nawet w najgorsze dni, zamiast czekać na motywację'],
    'brak energii i radości z życia': ['Filar 2: Szczęście', 'odkrywasz, co naprawdę daje Ci energię, i przestajesz gonić za tym, co szczęściem nie jest'],
    'finanse i stres o pieniądze': ['Filar 3: Finanse', 'psychologia pieniądza, zysk, sprzedaż i negocjacje - świadome decyzje i mniej stresu o kasę'],
    'lęki, niepewność, blokady w głowie': ['Filar 4: Duchowość', 'praca z podświadomością - medytacje, wizualizacje i hipnozy, żeby znaleźć i rozpuścić to, co Cię sabotuje od środka'],
    'złe otoczenie i relacje': ['Społeczność „Lecimy”', 'ludzie, którzy idą w tym samym kierunku i nakręcają się nawzajem, plus wsparcie Barta'],
    'brak sensu i kierunku': ['Filar 2 i 4: Szczęście + Duchowość', 'odkrywasz, czego naprawdę chcesz, i usuwasz przekonania, które trzymają Cię w miejscu']
  };

  // Kąt rozmowy zależny od tego, czym się zajmuje.
  var ZAJECIE = {
    'etat': 'Osoby na etacie zwykle szukają niezależności i balansu - żeby praca była dla nich, a nie odwrotnie.',
    'własna firma': 'Przedsiębiorcy często mają tak, że firma zamiast wolności zjada cały czas i trzeba ciągle gasić pożary. PRO porządkuje czas, decyzje i procesy.',
    'studia': 'Na studiach najłatwiej zbudować fundamenty - nawyki i podejście do pieniędzy, z którymi wejdziesz w dorosłe życie.',
    'nie pracuję': 'Bez pracy najtrudniejsza bywa struktura dnia i stres o pieniądze - od tego zaczyna się Dyscyplina i Finanse.',
    'inne': ''
  };

  function build(lead, ctx) {
    var esc = ctx.esc;
    var o = lead.odpowiedzi || {};
    var k = lead.kontakt || {};
    var imie = esc(k.imie || '');
    var ja = esc(ctx.seller || '[Twoje imię]');
    var ankieta = !!(o.budzet || o.cel || o.blokady);
    var blokady = o.blokady || [];
    var got = Number(o.gotowosc || 0);
    var ed = ctx.edition || {};
    var start = ed.startLabel || '20 listopada 2026';
    var koniec = ed.endLabel || '19 lutego 2027';
    var miejsca = ctx.seatsLeft != null ? ctx.seatsLeft + ' z ' + MIEJSCA : 'tylko ' + MIEJSCA;
    var clip = function (t) { t = String(t || ''); return esc(t.length > 260 ? t.slice(0, 260) + '…' : t); };

    // ── klocki wyglądu ──
    var say = function (t) { return '<div class="sc-say">' + t + '</div>'; };
    var ask = function (t) { return '<div class="sc-ask">' + t + '</div>'; };
    var tip = function (t) { return '<div class="sc-tip">' + t + '</div>'; };
    var fromSurvey = function (label, v) { return v ? '<div class="sc-data"><span>' + label + '</span>' + v + '</div>' : ''; };
    var step = function (n, title, goal, body) {
      return '<section class="sc-step"><h4><b>' + n + '</b>' + title + '</h4>' + (goal ? '<p class="sc-goal">' + goal + '</p>' : '') + body + '</section>';
    };
    var check = function (t) { return '<label class="sc-check"><input type="checkbox" /> ' + t + '</label>'; };

    var warn = lead.niepelnoletni
      ? '<div class="sc-warn">Osoba poniżej 18 lat - sprzedaż tylko za zgodą rodzica lub opiekuna. Poproś, żeby rodzic był na rozmowie z closerem.</div>' : '';

    // Pytania z ankiety na głos - gdy lead jej nie wypełniał.
    var discovery = ask('Czym się obecnie zajmujesz?') +
      ask('Co najbardziej blokuje Cię dziś w życiu? (dyscyplina, energia, finanse, lęki, otoczenie, brak kierunku)') +
      ask('Co już próbowałeś/aś, żeby to zmienić, i dlaczego nie zadziałało?') +
      ask('Gdzie chcesz być za 6 miesięcy? Opisz konkretnie.') +
      ask('W skali 1-10: na ile jesteś gotów/gotowa na zmianę teraz, nie „kiedyś”?');

    // ── Budżet: gałąź zależna od odpowiedzi ──
    var budzetSetter = {
      'tak, mam środki': say('„W ankiecie zaznaczyłeś/aś, że jesteś gotów/gotowa zainwestować w siebie. Potwierdzę tylko - inwestycja rzędu 10 tysięcy złotych nie jest dla Ciebie barierą, jeśli okaże się, że możemy Ci pomóc?”') +
        tip('Jeśli tak - kwalifikuje się. Jeśli się waha, dopytaj, co by musiało się wydarzyć, żeby czuć się pewnie z taką decyzją.'),
      'tak, w ratach': say('„Zaznaczyłeś/aś, że wolisz raty. Jaka miesięczna kwota byłaby dla Ciebie komfortowa?”') +
        tip('Zapisz kwotę w notatce - closer dobierze do niej sposób płatności.'),
      'wolę tańszą opcję samodzielną': say('„Napisałeś/aś, że wolisz tańszą, samodzielną opcję. Co jest dla Ciebie ważniejsze - niższa cena, czy to, żeby ktoś Cię przez to przeprowadził i rozliczał?”') +
        tip('Jeśli liczy się cena - zaproponuj <b>Kompletny System (1 597 zł, Klarna 3 raty 0% ok. 532 zł/mies.)</b> i ustaw status „Downsell”. Jeśli prowadzenie - kwalifikuj dalej do PRO.'),
      'nie stać mnie teraz': say('„Dziękuję za szczerość. PRO to inwestycja rzędu 10 tysięcy - jeśli to dziś za dużo, mamy wersje, od których możesz zacząć sam/a.”') +
        tip('Nie dociskaj PRO. Zaproponuj <b>Fundament (997 zł)</b> albo <b>Kompletny System (1 597 zł)</b> - oba z Klarną 3×0%. Status „Downsell” albo „Odrzucone”.')
    };
    var budzetAsk = ask('„PRO to inwestycja rzędu 10 tysięcy złotych, z możliwością rat. Jeśli okaże się, że możemy Ci pomóc, czy jesteś w stanie zainwestować taką kwotę w siebie?”');

    // ── Gotowość ──
    var gotowoscBlock = !got ? ask('„W skali 1-10: na ile jesteś gotów/gotowa na zmianę teraz?”')
      : got >= 8 ? say('„Dałeś/aś sobie ' + got + ' na 10, jeśli chodzi o gotowość. Skąd to się bierze - dlaczego właśnie teraz?”') + tip('Wysoka gotowość: niech sam/a powie, co się stało, że „już dość”. To będzie argument na rozmowie z closerem.')
      : say('„Gotowość ocenił(a)ś na ' + got + '/10. Co musiałoby się stać, żeby to była dziesiątka?”') + tip('Poniżej 8: szukaj, co blokuje (strach, pieniądze, czas, partner). Zapisz to - to będzie główna obiekcja.');

    // ── Start ──
    var startBlock = {
      'od zaraz': say('„Chcesz zacząć od zaraz - świetnie. Najbliższa edycja rusza ' + start + ', zapisy są do tego dnia.”'),
      'w ciągu miesiąca': say('„Chcesz zacząć w ciągu miesiąca - to się zgrywa, bo edycja rusza ' + start + '. Po tym dniu zapisy są zamknięte.”'),
      'dopiero się rozglądam': say('„Napisałeś/aś, że dopiero się rozglądasz. Co musiałoby się wydarzyć, żebyś chciał(a) zacząć teraz, a nie za pół roku?”') + tip('Edycja startuje ' + start + ' i wtedy sprzedaż się zamyka - to naturalny termin decyzji.')
    }[o.start] || ask('„Kiedy chciał(a)byś zacząć? Edycja rusza ' + start + '.”');

    // ── Dopasowanie filarów (closer) ──
    var filary = blokady.map(function (b) {
      var f = BLOKADA_FILAR[b];
      return f ? '<li><b>' + esc(b) + '</b> → ' + esc(f[0]) + ': ' + esc(f[1]) + '</li>' : '';
    }).join('');
    var pierwszaBlokada = blokady[0] ? esc(blokady[0]) : 'to, co Cię blokuje';

    var setter =
      warn +
      '<p class="sc-intro">Cel rozmowy: <b>zakwalifikować i umówić rozmowę z closerem</b>. 10-15 minut. Więcej słuchasz niż mówisz.</p>' +
      step(1, 'Otwarcie', 'Przedstaw się i zapytaj o czas.',
        say('„Cześć ' + imie + ', tu ' + ja + ' z Lecimy po swoje. ' + (ankieta ? 'Dostaliśmy Twoje zgłoszenie do PRO' : 'Kontaktowałeś/aś się z nami w sprawie programu') + ' - masz teraz 10 minut, żeby pogadać?”') +
        tip('Nie ma czasu? Umów konkretną godzinę i ustaw ją w „Następny kontakt”.')) +
      step(2, 'Ramka rozmowy', 'Ustaw zasady - klient wie, czego się spodziewać.',
        say('„Moją rolą jest sprawdzić, czy PRO ma w ogóle sens w Twojej sytuacji. Zadam kilka pytań. Jeśli będzie pasować, umówię Cię na rozmowę ze specjalistą, który pokaże szczegóły. Jeśli nie - powiem wprost. Może tak być?”')) +
      step(3, 'Sytuacja i blokady', 'Niech opowie własnymi słowami.',
        (ankieta
          ? fromSurvey('Zajęcie', esc(o.zajecie)) + fromSurvey('Wiek', esc(o.wiek)) + fromSurvey('Blokady', esc(blokady.join(', '))) +
            say('„W zgłoszeniu zaznaczyłeś/aś: ' + esc(o.zajecie || '...') + '. Opowiedz, czym dokładnie się zajmujesz i jak dziś wygląda Twój typowy dzień.”') +
            say('„Zaznaczyłeś/aś: ' + esc(blokady.join(', ')) + '. Które z tych rzeczy najbardziej Ci dziś przeszkadza? Jak to wygląda w praktyce?”')
          : discovery) +
        ask('„Jak długo to już trwa?”') + ask('„Jak to wpływa na resztę - pracę, relacje, pieniądze?”')) +
      (ankieta ? step(4, 'Co już próbował(a)', 'Pokaż, że czytałeś/aś zgłoszenie.',
        fromSurvey('Napisał(a)', '„' + clip(o.probowal) + '”') +
        say('„Napisałeś/aś, że próbowałeś/aś już różnych rzeczy. Dlaczego Twoim zdaniem to nie zadziałało?”') +
        tip('Szukaj wzorca: brak systemu, brak rozliczania, robienie samemu. To dokładnie to, co daje PRO.')) : '') +
      step(ankieta ? 5 : 4, 'Cel i koszt braku zmiany', 'Zbuduj różnicę między tym, gdzie jest, a gdzie chce być.',
        (ankieta ? fromSurvey('Cel za 6 miesięcy', '„' + clip(o.cel) + '”') : '') +
        say('„' + (ankieta ? 'Napisałeś/aś, gdzie chcesz być za 6 miesięcy.' : 'Powiedz, gdzie chcesz być za 6 miesięcy.') + ' Co się zmieni w Twoim życiu, kiedy to osiągniesz?”') +
        ask('„A co, jeśli za pół roku będzie dokładnie tak jak dziś?”') +
        tip('Pozwól mu/jej odpowiedzieć i nie przerywaj ciszy.')) +
      step(ankieta ? 6 : 5, 'Gotowość', '', fromSurvey('Gotowość', got ? got + '/10' : '') + gotowoscBlock) +
      step(ankieta ? 7 : 6, 'Budżet', 'Kwalifikacja finansowa - zadaj wprost, bez przepraszania.',
        fromSurvey('Budżet', esc(o.budzet)) + (budzetSetter[o.budzet] || budzetAsk + tip('Tak/raty → dalej. Tańsza opcja albo brak budżetu → Kompletny System 1 597 zł / Fundament 997 zł, status „Downsell”.'))) +
      step(ankieta ? 8 : 7, 'Start i decyzja', '',
        fromSurvey('Start', esc(o.start)) + startBlock +
        ask('„Decyzję o takiej inwestycji podejmujesz sam/a, czy jeszcze z kimś - np. z partnerem?”') +
        tip('Jeśli z kimś - poproś, żeby ta osoba była na rozmowie z closerem.')) +
      step(ankieta ? 9 : 8, 'Umówienie rozmowy z closerem', 'Daj dwie konkretne godziny do wyboru.',
        say('„Z tego, co mówisz, PRO może mieć sens. Umówię Cię na rozmowę - około 40 minut, najlepiej przy komputerze i w spokojnym miejscu. Pasuje Ci jutro o 18:00, czy lepiej pojutrze w południe?”') +
        tip('W karcie: status <b>„Umówiona rozmowa”</b>, termin w „Następny kontakt”, opiekun = closer. Wstaw szablon notatki i uzupełnij go.')) +
      '<div class="sc-box"><h4>Kwalifikacja - zaznacz w trakcie</h4>' +
        check('Ma realny problem i sam(a) chce go rozwiązać') + check('Gotowość 7/10 lub więcej') + check('Budżet lub raty potwierdzone') +
        check('Sam(a) decyduje albo decydent będzie na rozmowie') + check('Może zacząć do ' + start) +
        '<p class="sc-goal" style="margin-top:.5rem">Wszystko zaznaczone → umów closera. Brak budżetu → downsell. Brak problemu albo gotowości → follow-up za 2-4 tygodnie albo „Odrzucone”.</p></div>';

    var closer =
      warn +
      '<p class="sc-intro">Cel rozmowy: <b>sprzedaż PRO</b> (albo downsell, jeśli PRO nie pasuje). 30-45 minut. Najpierw diagnoza, potem oferta.</p>' +
      (ctx.lastNote ? '<div class="sc-box"><h4>Notatka z poprzedniej rozmowy (' + esc(ctx.lastNote.autor) + ')</h4><p class="sc-note">' + esc(ctx.lastNote.tekst) + '</p></div>' : '') +
      step(1, 'Otwarcie i agenda', 'Przejmij prowadzenie od pierwszej minuty.',
        say('„Cześć ' + imie + ', ' + ja + ' z Lecimy po swoje. Dzięki, że znalazłeś/aś czas. Plan jest taki: najpierw dopytam o Twoją sytuację, potem pokażę, jak wygląda PRO, a na koniec razem zdecydujemy, czy to dla Ciebie. Jeśli nie będzie pasować - powiem Ci to wprost. Ok?”')) +
      step(2, 'Diagnoza', 'Niech sam(a) opowie, co go/ją boli. Ty pytasz i słuchasz.',
        (ankieta
          ? fromSurvey('Blokady', esc(blokady.join(', '))) + fromSurvey('Próbował(a)', '„' + clip(o.probowal) + '”') +
            say('„W ankiecie napisałeś/aś, że najbardziej blokuje Cię: ' + esc(blokady.join(', ')) + '. Opowiedz mi o tym więcej - kiedy ostatnio poczułeś/aś to najmocniej?”') +
            ask('„Wspomniałeś/aś, co już próbowałeś/aś. Co konkretnie poszło nie tak?”')
          : discovery) +
        ask('„Ile to Cię już kosztowało - czasu, pieniędzy, nerwów?”') +
        (ZAJECIE[o.zajecie] ? tip(ZAJECIE[o.zajecie]) : '')) +
      step(3, 'Cel i różnica', 'Zestaw obecny stan z celem. To jest wartość, którą sprzedajesz.',
        (ankieta ? fromSurvey('Cel za 6 miesięcy', '„' + clip(o.cel) + '”') : '') +
        say('„Czyli dziś jest: ' + pierwszaBlokada + ', a za pół roku chcesz' + (ankieta ? ': ' + clip(o.cel) : ' [cel klienta]') + '. Dobrze rozumiem?”') +
        ask('„Dlaczego to jest dla Ciebie ważne właśnie teraz?”') +
        ask('„Co się stanie, jeśli przez kolejne pół roku będziesz to robić sam/a, tak jak do tej pory?”')) +
      step(4, 'Prezentacja PRO dopasowana do niego/niej', 'Mów tylko o tym, co rozwiązuje JEGO/JEJ problem. Nie czytaj całej listy.',
        (filary ? '<ul class="sc-list">' + filary + '</ul>' : '') +
        say('„W PRO przechodzisz przez cztery filary: Dyscyplinę, Szczęście, Finanse i Duchowość. ' + (blokady.length ? 'U Ciebie najważniejsze będą: ' + esc(blokady.map(function (b) { return (BLOKADA_FILAR[b] || [b])[0]; }).join(', ')) + '.' : '') + ' Ale to, co odróżnia PRO od zwykłego programu, to bezpośredni dostęp do Barta.”') +
        '<ul class="sc-list"><li><b>Zakazane Lekcje</b> - jak Bart podejmuje decyzje i układa strategie, o czym nie mówi publicznie</li>' +
        '<li><b>Osobisty feedback Barta</b> ze strefą pytań</li><li><b>Indywidualny audyt</b> Barta w wiadomości głosowej</li>' +
        '<li><b>Ekskluzywne Materiały PRO</b> + wszystko z Kompletnego Systemu: 4 filary, spotkania na żywo z Bartem, społeczność „Lecimy”, hipnozy, medytacje, karty pracy</li></ul>' +
        say('„Edycja trwa od ' + start + ' do ' + koniec + '. W PRO zostało ' + miejsca + ' miejsc w tej edycji, bo Bart pracuje z każdym osobiście.”') +
        ask('„Jak to brzmi w kontekście tego, o czym rozmawialiśmy?”')) +
      step(5, 'Cena', 'Powiedz cenę spokojnie i zamilknij. Pierwszy, kto się odezwie, przegrywa.',
        fromSurvey('Budżet z ankiety', esc(o.budzet)) +
        say('„Inwestycja w PRO to ' + PRO_CENA + ' brutto. Możesz zapłacić jednorazowo albo rozłożyć płatność.”') +
        tip('Klient deklarował raty? Zacznij od rat. Warunki rat potwierdź przed rozmową - Klarna przyznaje je po ocenie zdolności kredytowej.') +
        tip('Gdy pyta o gwarancję: klient ma 14 dni na odstąpienie od umowy, ale nie dłużej niż do startu edycji (' + start + '). Po starcie zwrotów nie ma.')) +
      step(6, 'Obiekcje', 'Najpierw dopytaj, potem odpowiadaj. „Rozumiem. Co dokładnie masz na myśli?”',
        '<dl class="sc-obj">' +
        '<dt>„Muszę się zastanowić”</dt><dd>„Jasne. Nad czym dokładnie? Cena, czas, czy to, czy to zadziała u Ciebie?” - rozbij na konkret i odpowiedz na ten jeden punkt.</dd>' +
        '<dt>„To za drogo / nie mam teraz”</dt><dd>„Ile kosztuje Cię to, że ' + pierwszaBlokada + ' trwa dalej?” Potem raty. Jeśli naprawdę nie da rady - Kompletny System 1 597 zł (Klarna 3×0% ok. 532 zł/mies.), status „Downsell”.</dd>' +
        '<dt>„Muszę zapytać partnera”</dt><dd>„Super, że to razem decydujecie. Co Twoim zdaniem powie? Umówmy krótką rozmowę we trójkę - jutro czy pojutrze?”</dd>' +
        '<dt>„Próbowałem/am już kursów i nie działało”</dt><dd>' + (ankieta && o.probowal ? 'Wróć do tego, co napisał(a): „' + clip(o.probowal) + '”. ' : '') + '„Dlatego PRO to nie kurs. Kurs daje wiedzę, a Ty potrzebujesz systemu i kogoś, kto Cię rozlicza - tu masz Barta osobiście.”</dd>' +
        '<dt>„Nie mam czasu”</dt><dd>„Ile czasu dziennie tracisz teraz na ' + pierwszaBlokada + '? Program jest ułożony tak, żeby zmieścić go w normalnym tygodniu.”</dd>' +
        '<dt>„Czy to zadziała u mnie?”</dt><dd>„Zadziała, jeśli wdrożysz. Dlatego robimy kwalifikację - nie biorę osób, które liczą na cud po kliknięciu „kup”. Z tego, co mówisz, masz to, czego trzeba.”</dd>' +
        '</dl>') +
      step(7, 'Zamknięcie', 'Zapytaj o decyzję wprost.',
        say('„Z tego, co mówisz, PRO jest dokładnie tym, czego potrzebujesz. Wchodzimy w to?”') +
        tip('TAK → wygeneruj osobisty link w <a href="generator-pro.html" target="_blank" rel="noopener">generatorze ofert PRO</a> na e-mail <b>' + esc(k.email || '') + '</b> i wyślij od razu, zostając na linii, aż klient przejdzie do płatności. Status „Sprzedane PRO” po opłaceniu.') +
        tip('NIE, ale chce zacząć → Kompletny System / Fundament, status „Downsell”. Zastanawia się → konkretny termin follow-upu (24-48 h), status „Follow-up”.')) +
      '<div class="sc-box"><h4>Po rozmowie</h4><p class="sc-goal">Zaktualizuj status, ustaw następny kontakt i zapisz notatkę: sytuacja, obiekcje, najważniejszy filar, poziom entuzjazmu.</p></div>';

    return { setter: setter, closer: closer, ks: buildKs(lead, ctx, { esc: esc, imie: imie, ja: ja, start: start, koniec: koniec, clip: clip, say: say, ask: ask, tip: tip, fromSurvey: fromSurvey, step: step, check: check }) };
  }

  // ── Bezpłatna konsultacja przed zakupem Kompletnego Systemu (lead z konsultacja.html) ──
  // Klient sam umówił 10-15 minut, bo chce dołączyć, ale coś go wstrzymuje. Cel: rozwiać wątpliwość i domknąć KS na rozmowie.
  function buildKs(lead, ctx, h) {
    var esc = h.esc, say = h.say, ask = h.ask, tip = h.tip, step = h.step, check = h.check;
    var k = lead.kontakt || {};
    var c = lead.konsultacja || {};
    var ed = ctx.edition || {};
    var przedPodwyzka = ed.priceRiseISO && Date.now() < Date.parse(ed.priceRiseISO);
    var podwyzkaLabel = ed.priceRiseISO ? new Date(ed.priceRiseISO).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long' }) : '';
    var zamkniecie = ed.salesCloseLabel || h.start;
    var link = location.origin + '/zamowienie.html?pakiet=Kompletny%20System';
    var filary = Object.keys(BLOKADA_FILAR).map(function (b) { return '<li><b>' + esc(b) + '</b> → ' + esc(BLOKADA_FILAR[b][0]) + ': ' + esc(BLOKADA_FILAR[b][1]) + '</li>'; }).join('');

    return '<p class="sc-intro">Cel rozmowy: <b>rozwiać wątpliwość i domknąć Kompletny System</b> na tej rozmowie. 10-15 minut. Klient sam się zapisał, więc chce wejść - Twoja rola to usunąć to, co go wstrzymuje.</p>' +
      (ctx.lastNote ? '<div class="sc-box"><h4>Notatka z poprzedniej rozmowy (' + esc(ctx.lastNote.autor) + ')</h4><p class="sc-note">' + esc(ctx.lastNote.tekst) + '</p></div>' : '') +
      step(1, 'Otwarcie', 'Krótko i ciepło. Odwołaj się do tego, że sam(a) się umówił(a).',
        say('„Cześć ' + h.imie + ', tu ' + h.ja + ' z Lecimy po swoje. Umówiłeś/aś się z nami na krótką rozmowę o programie - masz teraz 10 minut?”') +
        tip('Nie może teraz? Ustal konkretną godzinę w tym samym bloku albo jutro i wpisz ją w „Następny kontakt”.')) +
      step(2, 'Ramka', 'Klient ma wiedzieć, jak to się skończy - to zdejmuje presję.',
        say('„Plan jest prosty: powiesz mi, co Cię jeszcze wstrzymuje, odpowiem na każde pytanie i razem ustalimy, czy i od którego pakietu zacząć. Jeśli program nie będzie dla Ciebie, powiem Ci to wprost. Pasuje?”')) +
      step(3, 'Co go wstrzymuje', 'Najważniejszy punkt rozmowy. Dopytuj, aż dojdziesz do prawdziwego powodu.',
        h.fromSurvey('Napisał(a) przy zapisie', c.pytanie ? '„' + h.clip(c.pytanie) + '”' : '') +
        (c.pytanie
          ? say('„Przy zapisie napisałeś/aś: „' + h.clip(c.pytanie) + '”. Opowiedz mi o tym więcej.”')
          : say('„Co sprawia, że jeszcze się nie zapisałeś/aś? Co Cię wstrzymuje?”')) +
        ask('„Czy to jedyna rzecz, czy jest coś jeszcze?”') +
        tip('Zwykle to jedno z pięciu: cena, czas, „czy to zadziała u mnie”, wybór pakietu, decyzja z partnerem. Gotowe odpowiedzi są w kroku 6.')) +
      step(4, 'Szybka diagnoza', 'Dwa-trzy pytania, żeby dopasować program do jego/jej sytuacji. Nie przesłuchuj.',
        ask('„Co najbardziej chcesz zmienić w ciągu tych 90 dni?”') +
        ask('„Co już próbowałeś/aś i dlaczego nie zadziałało?”') +
        ask('„Co się stanie, jeśli za 3 miesiące będzie dokładnie tak jak dziś?”') +
        '<ul class="sc-list">' + filary + '</ul>' +
        tip('Powiąż to, co mówi, z filarem z listy - użyjesz tego w kroku 5.')) +
      step(5, 'Kompletny System dopasowany do niego/niej', 'Mów o tym, co rozwiązuje JEGO/JEJ problem. Nie czytaj całej listy.',
        say('„W Kompletnym Systemie przechodzisz przez wszystkie 4 filary: Dyscyplinę, Szczęście, Finanse i Duchowość. U Ciebie najważniejszy będzie [filar z kroku 4], bo [jego/jej słowa].”') +
        '<ul class="sc-list"><li><b>90 dni prowadzenia</b> od ' + esc(h.start) + ' do ' + esc(h.koniec) + ' - zawsze wiesz, co robić dalej</li>' +
        '<li><b>22 lekcje wideo</b> w czterech etapach + karty pracy</li>' +
        '<li><b>Wyzwania w grupie</b> - ok. 15 minut dziennie</li>' +
        '<li><b>Społeczność „Lecimy”</b> i <b>comiesięczne spotkania na żywo z Bartem</b></li>' +
        '<li><b>Gotowy Zestaw Narzędzi Wdrożeniowych</b> i <b>praca z podświadomością</b>: hipnozy, medytacje prowadzone, afirmacje</li></ul>' +
        ask('„Jak to brzmi w kontekście tego, co mi powiedziałeś/aś?”')) +
      step(6, 'Cena, gwarancja i obiekcje', 'Powiedz cenę spokojnie i zamilknij.',
        say('„Kompletny System to 1 597 zł brutto. Możesz zapłacić od razu albo rozłożyć na 3 raty 0% przez Klarnę - wychodzi ok. 532 zł miesięcznie. Jest też opcja „zapłać za 30 dni”.”') +
        say('„I jeszcze jedno: Kompletny System ma gwarancję zwrotu. Jeśli przejdziesz cały program i uznasz, że nic Ci nie dał, oddajemy całe pieniądze.”') +
        tip('Warunki gwarancji (regulamin pkt 6a): obejrzane wszystkie lekcje i ukończone wszystkie wyzwania w grupie, zgłoszenie mailem do 14 dni po końcu edycji. Gwarancja jest tylko na Kompletny System, nie na Fundament.') +
        (przedPodwyzka ? tip('Do ' + esc(podwyzkaLabel) + ' obowiązuje obecna cena, potem rośnie. Zapisy zamykamy ' + esc(zamkniecie) + '. Mów o tym jako o fakcie, nie jako o presji.') : tip('Zapisy do tej edycji zamykamy ' + esc(zamkniecie) + '.')) +
        '<dl class="sc-obj">' +
        '<dt>„To za drogo”</dt><dd>„Rozumiem. Za drogo w porównaniu z czym?” Potem raty: „To ok. 532 zł miesięcznie przez 3 miesiące, bez odsetek, a jeśli przejdziesz program i nic Ci nie da - oddajemy pieniądze.” Jeśli naprawdę nie da rady - Fundament (krok 7).</dd>' +
        '<dt>„Nie wiem, czy znajdę czas”</dt><dd>„Wyzwania to ok. 15 minut dziennie, lekcje oglądasz, kiedy Ci pasuje. Ile czasu dziennie tracisz dziś na [to, co go blokuje]?”</dd>' +
        '<dt>„Czy to zadziała u mnie?”</dt><dd>„Zadziała, jeśli zrobisz swoją część - 15 minut dziennie. A żeby ryzyko było po naszej stronie, masz gwarancję zwrotu.”</dd>' +
        '<dt>„Muszę się zastanowić”</dt><dd>„Jasne. Nad czym dokładnie - cena, czas, czy to, czy to dla Ciebie?” Rozbij na jeden konkret i odpowiedz na niego.</dd>' +
        '<dt>„Muszę zapytać partnera”</dt><dd>„Super, że decydujecie razem. Co Twoim zdaniem powie? Mogę zadzwonić jutro, kiedy będziecie razem - o której?”</dd>' +
        '<dt>„Fundament czy Kompletny System?”</dt><dd>„Fundament to tylko Dyscyplina, bez społeczności i spotkań z Bartem, i bez gwarancji. Jeśli chcesz zmienić coś więcej niż nawyki, Kompletny System - różnica to ok. 200 zł miesięcznie w ratach.”</dd>' +
        '</dl>') +
      step(7, 'Zamknięcie', 'Zapytaj o decyzję wprost i zostań na linii do płatności.',
        say('„Z tego, co mówisz, Kompletny System jest dla Ciebie. Wchodzimy w to?”') +
        tip('TAK → wyślij link SMS-em albo mailem na <b>' + esc(k.email || '') + '</b> i zostań na linii, aż przejdzie do płatności: <button type="button" class="b" data-copy="' + esc(link) + '" style="margin-top:.35rem">Kopiuj link do zamówienia</button>') +
        tip('Po opłaceniu: status <b>„Sprzedane Kompletny System”</b>.') +
        tip('Cena jest dla niego/niej barierą nawet w ratach → Fundament 997 zł (Klarna 3×0% ok. 332 zł/mies.), status „Downsell”.') +
        tip('Chce, ale się waha → daj mu powód, żeby zdecydować dziś: <b>Masterclass Wdrożeniowy gratis</b> (zamiast 157 zł), ważne 24 h. <a href="generator-gratis.html?imie=' + encodeURIComponent(k.imie || '') + '&email=' + encodeURIComponent(k.email || '') + '" target="_blank" rel="noopener">Wygeneruj link z gratisem →</a>') +
        tip('Zastanawia się → konkretny termin (24-48 h) w „Następny kontakt”, status „Follow-up”. Nie pasuje → powiedz to wprost, status „Odrzucone”.')) +
      '<div class="sc-box"><h4>Zaznacz w trakcie</h4>' +
        check('Wiem, co go/ją wstrzymywało') + check('Odpowiedziałem/am na to wprost') + check('Powiązałem/am program z jego/jej problemem') +
        check('Padła cena i raty') + check('Padła gwarancja zwrotu') + check('Zapytałem/am o decyzję') +
        '<p class="sc-goal" style="margin-top:.5rem">Po rozmowie: status, następny kontakt i notatka (co wstrzymywało, co przekonało, ustalenia).</p></div>';
  }

  // Szablon notatki po rozmowie (przycisk „Wstaw szablon notatki").
  var NOTE_TEMPLATE = 'Sytuacja klienta:\nObiekcje:\nNajważniejszy filar (dyscyplina / szczęście / finanse / duchowość):\nBudżet / raty (kwota miesięczna):\nKto decyduje:\nPoziom entuzjazmu (1-10):\nUstalenia / następny krok:';
  var NOTE_TEMPLATE_KS = 'Co go/ją wstrzymywało:\nCo przekonało / co nie:\nNajważniejszy filar:\nPłatność (jednorazowo / Klarna raty / za 30 dni):\nKto decyduje:\nUstalenia / następny krok:';

  window.CRM_SKRYPTY = { build: build, noteTemplate: NOTE_TEMPLATE, noteTemplateKs: NOTE_TEMPLATE_KS };
})();
