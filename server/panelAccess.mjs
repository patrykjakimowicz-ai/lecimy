// Dostęp do panelu kursu: blokada dla klientów + konto admina.
//
// PANEL_OPEN=true     - panel otwarty dla klientów (domyślnie ZAMKNIĘTY: tylko admin).
// ADMIN_EMAILS=a@b.pl - lista e-maili adminów (po przecinku); admin ma dostęp zawsze i widzi wszystkie moduły.
//
// Tożsamość pochodzi z tokena sesji Supabase (sprawdzanej po stronie serwera), nie z niczego, co wyśle przeglądarka.
import { Router } from 'express';
import { EDITION } from './edition.mjs';
import { courseFor } from './course.mjs';

// Do sprawdzenia tokena wystarcza klucz publiczny (ten sam co w public/supabase-client.js) - działa też lokalnie bez sekretów.
const URL_BASE = (process.env.SUPABASE_URL || 'https://pendwmvattlgftudkpuf.supabase.co').replace(/\/$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_I26XH-PJWamtgRr-NOQJVw_8bZ73t5y';

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Zwraca { id, email } zalogowanego użytkownika albo null. */
async function userFromToken(token) {
  if (!token || !URL_BASE || !KEY) return null;
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = await res.json();
    return u && u.id && u.email ? { id: u.id, email: String(u.email).toLowerCase() } : null;
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** Middleware: ustawia req.panel = { user, admin } albo kończy odpowiedzią 401 / 403. */
export async function requirePanelAccess(req, res, next) {
  const user = await userFromToken(bearer(req));
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const admin = adminEmails().includes(user.email);
  if (!admin) {
    if (process.env.PANEL_OPEN !== 'true') {
      return res.status(403).json({ error: 'locked', state: 'before', message: 'Platforma otwiera się wkrótce. Damy znać mailem, gdy ruszymy.' });
    }
    if (Date.now() > Date.parse(EDITION.endISO)) {
      return res.status(403).json({ error: 'locked', state: 'after', message: `Dostęp do programu w ramach tej edycji trwał do ${EDITION.endLabel}.` });
    }
  }
  req.panel = { user, admin };
  next();
}

export function panelRouter({ limiter }) {
  const r = Router();
  const readLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });

  // Kurs dla zalogowanego użytkownika (zablokowane moduły bez treści).
  r.get('/api/panel/course', readLimiter, requirePanelAccess, (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      admin: req.panel.admin,
      email: req.panel.user.email,
      modules: courseFor({ admin: req.panel.admin }),
    });
  });

  return r;
}
