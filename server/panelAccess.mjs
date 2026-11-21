// Dostęp do panelu kursu: blokada dla klientów + konto admina.
//
// PANEL_OPEN=true     - panel otwarty dla klientów (domyślnie ZAMKNIĘTY: tylko admin).
// ADMIN_EMAILS=a@b.pl - lista e-maili adminów (po przecinku); admin ma dostęp zawsze i widzi wszystkie moduły.
//
// Tożsamość pochodzi z tokena sesji Supabase (sprawdzanej po stronie serwera), nie z niczego, co wyśle przeglądarka.
import { Router } from 'express';
import { EDITION } from './edition.mjs';
import { courseFor } from './course.mjs';
import { entitlementsFor } from './entitlements.mjs';
import { getUserProgress, recordHeartbeat, listAllProgress, DONE_RATIO } from './progress.mjs';
import { COURSE } from './course.mjs';
import { signVideoUrl } from './video.mjs';

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
  let entitlements = {};
  if (!admin) {
    try {
      entitlements = await entitlementsFor(user.email);
    } catch (err) {
      console.error('[panel] nie udało się odczytać zakupów klienta:', err.message);
      return res.status(503).json({ error: 'unavailable', message: 'Nie udało się sprawdzić Twojego dostępu. Spróbuj za chwilę.' });
    }
  }
  req.panel = { user, admin, entitlements };
  next();
}

export function panelRouter({ limiter }) {
  const r = Router();
  const readLimiter = limiter({ windowMs: 60 * 1000, limit: 120 });
  const heartbeatLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });
  const unlockedModules = (req) => courseFor({ admin: req.panel.admin, entitlements: req.panel.entitlements });

  // Kurs dla zalogowanego użytkownika (zablokowane moduły bez treści).
  r.get('/api/panel/course', readLimiter, requirePanelAccess, (req, res) => {
    // Admin może obejrzeć kurs oczami uczestnika: ?as=fundament|system, &masterclass=1, &date=RRRR-MM-DD.
    let view = unlockedModules(req);
    let preview = null;
    const as = String(req.query.as || '');
    if (req.panel.admin && (as === 'fundament' || as === 'system')) {
      const masterclass = req.query.masterclass === '1';
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : '';
      const now = d ? Date.parse(d + 'T12:00:00+01:00') : Date.now();
      view = courseFor({ admin: false, entitlements: { system: as === 'system', masterclass }, now });
      preview = { as, masterclass, date: d };
    }
    res.set('Cache-Control', 'no-store').json({
      admin: req.panel.admin,
      preview,
      email: req.panel.user.email,
      modules: view.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.video ? { ...l, video: signVideoUrl(l.video) } : l)),
      })),
    });
  });

  // Postęp zalogowanego użytkownika (zapisany na serwerze).
  r.get('/api/panel/progress', readLimiter, requirePanelAccess, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json({ doneRatio: DONE_RATIO, lessons: await getUserProgress(req.panel.user.id) });
    } catch (err) {
      console.error('[progress] odczyt:', err.message);
      res.status(503).json({ error: 'unavailable' });
    }
  });

  // Puls z odtwarzacza: ile sekund faktycznie obejrzano od poprzedniego pulsu.
  r.post('/api/panel/heartbeat', heartbeatLimiter, requirePanelAccess, async (req, res) => {
    const { lessonId, delta, duration, position, frontier } = req.body || {};
    const ok = typeof lessonId === 'string' && unlockedModules(req).some((m) => m.lessons.some((l) => l.id === lessonId && !l.locked));
    if (!ok) return res.status(403).json({ error: 'lesson not available' });
    try {
      const s = await recordHeartbeat(req.panel.user.id, req.panel.user.email, lessonId, { delta, duration, position, frontier });
      res.set('Cache-Control', 'no-store').json({ watched: s.watched, duration: s.duration, frontier: s.frontier || 0, done: !!s.done, doneAt: s.doneAt || null });
    } catch (err) {
      console.error('[progress] zapis:', err.message);
      res.status(503).json({ error: 'unavailable' });
    }
  });

  // Widok admina: kto ile przerobił (dowód do Gwarancji zwrotu).
  r.get('/api/panel/admin/progress', readLimiter, requirePanelAccess, async (req, res) => {
    if (!req.panel.admin) return res.status(403).json({ error: 'forbidden' });
    try {
      const lessons = COURSE.flatMap((m) => m.lessons.map((l) => ({ id: l.id, num: l.num, title: l.title, module: m.title })));
      const byUser = new Map();
      for (const { userId, lessonId, data } of await listAllProgress()) {
        const u = byUser.get(userId) || { userId, email: data.email || '', lessons: {} };
        if (data.email) u.email = data.email;
        u.lessons[lessonId] = { watched: data.watched, duration: data.duration, done: !!data.done, doneAt: data.doneAt || null, lastAt: data.lastAt || null };
        byUser.set(userId, u);
      }
      const users = [...byUser.values()]
        .map((u) => ({ ...u, doneCount: Object.values(u.lessons).filter((x) => x.done).length }))
        .sort((a, b) => b.doneCount - a.doneCount);
      res.set('Cache-Control', 'no-store').json({ totalLessons: lessons.length, lessons, users });
    } catch (err) {
      console.error('[progress] widok admina:', err.message);
      res.status(503).json({ error: 'unavailable' });
    }
  });

  return r;
}
