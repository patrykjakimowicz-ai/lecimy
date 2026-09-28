// Archiwum zgód (regulamin, treści cyfrowe, marketing) — niezależne od orders.json.
// Zapisywane w formacie JSON Lines (append-only, jeden wiersz = jedno zdarzenie),
// żeby mieć twardy dowód "kto, kiedy, co zaznaczył" na wypadek sporu / kontroli RODO.
// Wpisy nigdy nie są nadpisywane ani usuwane przez appendConsent.

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(DIR, 'data');
const FILE = path.join(DATA_DIR, 'consents.jsonl');

export async function appendConsent(entry) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

  const record = {
    ...entry,
    loggedAt: new Date().toISOString(),
  };

  await appendFile(FILE, JSON.stringify(record) + '\n', 'utf8');
  return record;
}
