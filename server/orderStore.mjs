// Bardzo prosty, plikowy magazyn zamówień (JSON).
// Wystarczający przy niskim wolumenie sprzedaży kursów. Przy większej skali
// warto przenieść to do prawdziwej bazy danych (np. Postgres/SQLite).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseEnabled, rest } from './supabaseRest.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const FILE = path.join(DATA_DIR, 'orders.json');

let writeQueue = Promise.resolve();

async function ensureFile() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) await writeFile(FILE, '{}', 'utf8');
}

async function readAll() {
  await ensureFile();
  const raw = await readFile(FILE, 'utf8');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function saveOrder(sessionId, order) {
  if (supabaseEnabled) return sbSave(sessionId, { ...order, sessionId, updatedAt: new Date().toISOString() });
  return enqueueWrite(async () => {
    const all = await readAll();
    all[sessionId] = { ...order, sessionId, updatedAt: new Date().toISOString() };
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
    return all[sessionId];
  });
}

export async function updateOrder(sessionId, patch) {
  if (supabaseEnabled) {
    const cur = await getOrder(sessionId);
    if (!cur) throw new Error(`Nie znaleziono zamówienia o sessionId=${sessionId}`);
    return sbSave(sessionId, { ...cur, ...patch, updatedAt: new Date().toISOString() });
  }
  return enqueueWrite(async () => {
    const all = await readAll();
    if (!all[sessionId]) throw new Error(`Nie znaleziono zamówienia o sessionId=${sessionId}`);
    all[sessionId] = { ...all[sessionId], ...patch, updatedAt: new Date().toISOString() };
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
    return all[sessionId];
  });
}

export async function getOrder(sessionId) {
  if (supabaseEnabled) {
    const rows = await rest('GET', `orders?session_id=eq.${encodeURIComponent(sessionId)}&select=data`);
    return rows && rows[0] ? rows[0].data : null;
  }
  const all = await readAll();
  return all[sessionId] || null;
}

async function sbSave(sessionId, order) {
  await rest('POST', 'orders?on_conflict=session_id', {
    body: { session_id: sessionId, data: order, updated_at: order.updatedAt },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return order;
}
