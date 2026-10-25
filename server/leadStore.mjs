// Magazyn leadów z ankiety PRO (pro.html) dla panelu CRM (crm.html).
// Produkcja: tabela Supabase `leads` (patrz supabase-schema.sql). Bez kluczy Supabase - plik lokalny (tylko dev).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseEnabled, rest } from './supabaseRest.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const FILE = path.join(DATA_DIR, 'leads.json');

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

export async function getLead(id) {
  if (supabaseEnabled) {
    const rows = await rest('GET', `leads?id=eq.${encodeURIComponent(id)}&select=data`);
    return rows && rows[0] ? rows[0].data : null;
  }
  return (await readAll())[id] || null;
}

export async function saveLead(lead) {
  const row = { ...lead, updatedAt: new Date().toISOString() };
  if (supabaseEnabled) {
    await rest('POST', 'leads?on_conflict=id', {
      body: { id: row.id, data: row, created_at: row.createdAt, updated_at: row.updatedAt },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    return row;
  }
  return enqueueWrite(async () => {
    const all = await readAll();
    all[row.id] = row;
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
    return row;
  });
}

// Trwałe usunięcie (wniosek RODO o usunięcie danych albo spam).
export async function deleteLead(id) {
  if (supabaseEnabled) {
    await rest('DELETE', `leads?id=eq.${encodeURIComponent(id)}`, { prefer: 'return=minimal' });
    return;
  }
  await enqueueWrite(async () => {
    const all = await readAll();
    delete all[id];
    await writeFile(FILE, JSON.stringify(all, null, 2), 'utf8');
  });
}

/** Wszystkie leady, najnowsze pierwsze. Przy niskim wolumenie filtrujemy po stronie panelu. */
export async function listLeads() {
  if (supabaseEnabled) {
    const rows = await rest('GET', 'leads?select=data&order=created_at.desc&limit=5000');
    return (rows || []).map((r) => r.data);
  }
  return Object.values(await readAll()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
