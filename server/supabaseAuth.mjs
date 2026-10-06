// Zakładanie kont klientów w Supabase Auth po potwierdzonej płatności.
// Używa klucza SECRET / service_role (tylko serwer) — patrz supabaseRest.mjs.
//
// Przepływ: konto tworzone bez hasła (e-mail od razu potwierdzony) → generujemy link
// "ustaw hasło" (recovery), który logowanie.html już obsługuje → link trafia do maila.

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';

export const authAdminEnabled = !!(URL_BASE && KEY);

function headers() {
  return {
    apikey: KEY,
    // Nowe klucze sb_secret_... nie są JWT — tylko apikey. Stary service_role (JWT) wymaga też Bearer.
    ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
    'Content-Type': 'application/json',
  };
}

async function call(path, body) {
  const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* nie JSON */ }
  return { status: res.status, json, text };
}

/**
 * Zakłada konto (jeśli nie istnieje) i zwraca jednorazowy link do ustawienia hasła.
 * Ponowny zakup tym samym e-mailem jest OK — konto już jest, generujemy tylko nowy link.
 * @returns {Promise<string>} action_link
 */
export async function ensureCustomerAccount(email, redirectTo) {
  if (!authAdminEnabled) throw new Error('Brak SUPABASE_URL / SUPABASE_SERVICE_KEY — nie mogę założyć konta.');

  const created = await call('admin/users', { email, email_confirm: true });
  const alreadyExists =
    created.status === 422 || created.status === 409 ||
    /already|registered|exists/i.test(created.text || '');
  if (created.status >= 400 && !alreadyExists) {
    throw new Error(`Supabase: nie udało się założyć konta (HTTP ${created.status}) ${String(created.text).slice(0, 200)}`);
  }

  const link = await call('admin/generate_link', { type: 'recovery', email, redirect_to: redirectTo });
  const actionLink = link.json && (link.json.action_link || (link.json.properties && link.json.properties.action_link));
  if (link.status >= 400 || !actionLink) {
    throw new Error(`Supabase: nie udało się wygenerować linku (HTTP ${link.status}) ${String(link.text).slice(0, 200)}`);
  }
  return actionLink;
}
