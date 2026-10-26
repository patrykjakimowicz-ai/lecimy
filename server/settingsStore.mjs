// Ustawienia zmieniane z panelu CRM (np. wyłączone bloki konsultacji). Jeden wiersz = jeden klucz z wartością JSON.
// Produkcja: tabela Supabase `ustawienia` (patrz supabase-schema.sql). Bez kluczy Supabase - plik lokalny (tylko dev).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseEnabled, rest } from './supabaseRest.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const FILE = path.join(DATA_DIR, 'ustawienia.json');

let writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

async function readAll() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse((await readFile(FILE, 'utf8')) || '{}');
  } catch {
    return {};
  }
}

export async function getSetting(key) {
  if (supabaseEnabled) {
    const rows = await rest('GET', `ustawienia?klucz=eq.${encodeURIComponent(key)}&select=data`);
    return rows && rows[0] ? rows[0].data : null;
  }
  return (await readAll())[key] ?? null;
}

export async function setSetting(key, value) {
  if (supabaseEnabled) {
    await rest('POST', 'ustawienia?on_conflict=klucz', {
      body: { klucz: key, data: value, updated_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return value;
  }
  return enqueueWrite(async () => {
    const all = await readAll();
    all[key] = value;
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
    return value;
  });
}
