// Wspólny klient Supabase dla logowanie.html i panel.html.
// SUPABASE_URL i klucz "publishable" są bezpieczne do umieszczenia w kodzie
// front-endowym — to nie są sekrety serwerowe, tylko publiczny klucz klienta
// zabezpieczony regułami RLS po stronie Supabase.
(function () {
  var SUPABASE_URL = 'https://pendwmvattlgftudkpuf.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_I26XH-PJWamtgRr-NOQJVw_8bZ73t5y';

  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('Nie znaleziono @supabase/supabase-js — sprawdź, czy skrypt CDN jest wczytany przed supabase-client.js.');
    return;
  }

  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
