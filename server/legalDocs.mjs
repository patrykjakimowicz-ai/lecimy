// Odcisk (SHA-256) treści regulaminu i polityki — zapisywany w logu zgód jako dowód, jaki dokładnie tekst obowiązywał
// w chwili zakupu. Ten sam odcisk liczy tools/archiwizuj_dokumenty.mjs dla kopii w archiwum_dokumentow/.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const LEGAL_FILES = { regulamin: 'regulamin.html', polityka: 'polityka-prywatnosci.html' };

// Fragment dokumentu z treścią prawną (bez menu i stopki), znormalizowany tak, by odcisk nie zależał od końców linii.
export function legalSection(html) {
  const m = html.match(/<section class="legal">([\s\S]*?)<\/section>/);
  return (m ? m[1] : html).replace(/\r\n/g, '\n').trim();
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function legalFingerprint() {
  const out = {};
  for (const [key, file] of Object.entries(LEGAL_FILES)) {
    const html = await readFile(path.join(PUBLIC_DIR, file), 'utf8');
    out[key] = sha256(legalSection(html));
  }
  return out;
}
