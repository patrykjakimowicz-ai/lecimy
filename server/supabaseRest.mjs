// Minimalny klient REST (PostgREST) Supabase — bez dodatkowych zależności.
// Używa klucza SERVICE ROLE (tylko po stronie serwera, w zmiennych środowiskowych Rendera!).
// Jeśli klucz nie jest ustawiony, magazyny wracają do plików lokalnych (tylko dev).

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';

export const supabaseEnabled = !!(URL_BASE && KEY);

export async function rest(method, pathAndQuery, { body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: KEY,
      // Nowe klucze sb_secret_... nie są JWT — wysyłamy je wyłącznie w apikey.
      // Stary service_role (JWT, zaczyna się od "eyJ") wymaga też nagłówka Authorization.
      ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
