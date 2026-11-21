// Postęp oglądania lekcji - zapisywany na serwerze (to dowód do Gwarancji zwrotu, pkt 6a regulaminu).
// Lekcja zalicza się, gdy faktycznie odtworzono >= DONE_RATIO jej długości. Przewijanie nie liczy się jako obejrzane.
//
// Zapis: tabela public.lesson_progress w Supabase (patrz supabase-schema.sql); bez klucza - plik lokalny (tylko dev).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseEnabled, rest } from './supabaseRest.mjs';

export const DONE_RATIO = 0.9;
const SPEED_FACTOR = 1.6;   // maks. prędkość 1,5x (+ zapas na różnice w czasie pulsów): szybsze oglądanie nie przyspiesza zaliczenia
const MIN_GAP_MS = 2000;    // pulsy gęstsze niż co 2 s są ignorowane (ochrona przed spamowaniem)
const MAX_DELTA = 30;       // maks. sekund doliczanych jednym pulsem

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const FILE = path.join(DATA_DIR, 'progress.json');
let queue = Promise.resolve();

async function readAll() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) return {};
  try { return JSON.parse((await readFile(FILE, 'utf8')) || '{}'); } catch { return {}; }
}

/** @returns {Promise<Record<string, object>>} lessonId → dane postępu danego użytkownika */
export async function getUserProgress(userId) {
  if (supabaseEnabled) {
    const rows = await rest('GET', `lesson_progress?user_id=eq.${encodeURIComponent(userId)}&select=lesson_id,data`);
    return Object.fromEntries((rows || []).map((r) => [r.lesson_id, r.data]));
  }
  const all = await readAll();
  return all[userId] || {};
}

async function saveLesson(userId, lessonId, data) {
  if (supabaseEnabled) {
    await rest('POST', 'lesson_progress?on_conflict=user_id,lesson_id', {
      body: { user_id: userId, lesson_id: lessonId, data, updated_at: data.lastAt },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return;
  }
  queue = queue.then(async () => {
    const all = await readAll();
    all[userId] = { ...(all[userId] || {}), [lessonId]: data };
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
  });
  await queue;
}

/** Wszystkie postępy (dla widoku admina): [{ userId, lessonId, data }] */
export async function listAllProgress() {
  if (supabaseEnabled) {
    const rows = await rest('GET', 'lesson_progress?select=user_id,lesson_id,data&limit=20000');
    return (rows || []).map((r) => ({ userId: r.user_id, lessonId: r.lesson_id, data: r.data }));
  }
  const all = await readAll();
  return Object.entries(all).flatMap(([userId, lessons]) => Object.entries(lessons).map(([lessonId, data]) => ({ userId, lessonId, data })));
}

/** Czysta logika doliczania (testowalna): zwraca nowy stan lekcji. */
export function applyHeartbeat(prev, { delta, duration, position, frontier }, nowMs = Date.now()) {
  const cur = prev ? { ...prev } : { watched: 0, duration: 0, done: false, firstAt: new Date(nowMs).toISOString() };
  const last = cur.lastAt ? Date.parse(cur.lastAt) : null;
  const gapMs = last ? nowMs - last : null;
  if (gapMs !== null && gapMs < MIN_GAP_MS) return { state: cur, changed: false };

  const dur = Number(duration);
  if (Number.isFinite(dur) && dur >= 5 && dur <= 4 * 3600) cur.duration = Math.round(dur);

  const gapSec = gapMs === null ? 10 : gapMs / 1000;
  const budget = Math.min(MAX_DELTA, gapSec * SPEED_FACTOR + 0.5);
  const add = Math.max(0, Math.min(Number(delta) || 0, budget));
  cur.watched = Math.round((cur.watched + add) * 10) / 10;
  if (cur.duration) cur.watched = Math.min(cur.watched, cur.duration);
  if (Number.isFinite(Number(position))) cur.position = Math.round(Number(position));
  // Granica obejrzanego: dokąd można przewinąć bez cofania. Nie może wyprzedzać łącznego czasu faktycznie odtworzonego.
  const fr = Number(frontier);
  if (Number.isFinite(fr) && fr > 0) {
    const cap = Math.min(cur.watched + 10, cur.duration || Infinity);
    cur.frontier = Math.max(cur.frontier || 0, Math.round(Math.min(fr, cap)));
  }
  cur.lastAt = new Date(nowMs).toISOString();
  if (!cur.done && cur.duration >= 5 && cur.watched >= cur.duration * DONE_RATIO) {
    cur.done = true;
    cur.doneAt = cur.lastAt;
  }
  return { state: cur, changed: true };
}

export async function recordHeartbeat(userId, email, lessonId, body) {
  const prev = (await getUserProgress(userId))[lessonId] || null;
  const { state, changed } = applyHeartbeat(prev, body);
  state.email = email;
  if (changed) await saveLesson(userId, lessonId, state);
  return state;
}
