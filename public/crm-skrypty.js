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

    return { setter: setter, closer: closer };
  }

  // Szablon notatki po rozmowie (przycisk „Wstaw szablon notatki").
  var NOTE_TEMPLATE = 'Sytuacja klienta:\nObiekcje:\nNajważniejszy filar (dyscyplina / szczęście / finanse / duchowość):\nBudżet / raty (kwota miesięczna):\nKto decyduje:\nPoziom entuzjazmu (1-10):\nUstalenia / następny krok:';

  window.CRM_SKRYPTY = { build: build, noteTemplate: NOTE_TEMPLATE };
})();
