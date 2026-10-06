// Archiwum wersji regulaminu i polityki prywatności (dowód, jaki tekst obowiązywał w danym czasie).
//   node tools/archiwizuj_dokumenty.mjs            zapisuje kopie bieżących wersji do archiwum_dokumentow/ (jeśli ich jeszcze nie ma)
//   node tools/archiwizuj_dokumenty.mjs --sprawdz  sprawdza, czy treść dokumentów zgadza się z zarchiwizowaną wersją o tym samym numerze
// Uruchamiaj ZA KAŻDYM RAZEM po zmianie regulaminu/polityki (razem ze zmianą numeru wersji w server/legalVersions.mjs)
// i commituj katalog archiwum_dokumentow/. Odcisk SHA-256 jest taki sam jak zapisywany w logu zgód (tabela consents).

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_VERSIONS } from '../server/legalVersions.mjs';
import { LEGAL_FILES, legalSection, sha256 } from '../server/legalDocs.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCH = path.join(ROOT, 'archiwum_dokumentow');
const check = process.argv.includes('--sprawdz');
const names = { regulamin: 'regulamin', polityka: 'polityka-prywatnosci' };

let problems = 0;
for (const [key, file] of Object.entries(LEGAL_FILES)) {
  const version = LEGAL_VERSIONS[key];
  const html = await readFile(path.join(ROOT, 'public', file), 'utf8');
  const section = legalSection(html);
  const hash = sha256(section);
  const dir = path.join(ARCH, names[key]);
  const target = path.join(dir, `${version}.html`);

  if (check) {
    if (!existsSync(target)) {
      console.log(`❌ ${key} ${version}: brak kopii w archiwum — uruchom skrypt bez --sprawdz`);
      problems++;
      continue;
    }
    const archived = await readFile(target, 'utf8');
    const archivedHash = sha256(legalSection(archived));
    if (archivedHash === hash) console.log(`✅ ${key} ${version}: zgodne z archiwum (sha256 ${hash.slice(0, 16)}…)`);
    else { console.log(`❌ ${key} ${version}: TREŚĆ ZMIENIONA bez zmiany numeru wersji! Zmień wersję w server/legalVersions.mjs i zarchiwizuj ponownie.`); problems++; }
    continue;
  }

  await mkdir(dir, { recursive: true });
  if (existsSync(target)) {
    console.log(`= ${key} ${version}: kopia już istnieje (nie nadpisuję; sprawdź zgodność: --sprawdz)`);
    continue;
  }
  await writeFile(target, `<!-- Archiwum: ${key}, wersja ${version}, zapisano ${new Date().toISOString()}, sha256 ${hash} -->\n<section class="legal">\n${section}\n</section>\n`, 'utf8');
  await appendFile(path.join(ARCH, 'SHA256SUMS.txt'), `${hash}  ${key}  ${version}  ${new Date().toISOString().slice(0, 10)}\n`, 'utf8');
  console.log(`+ ${key} ${version}: zapisano ${path.relative(ROOT, target)} (sha256 ${hash})`);
}
if (check && problems) process.exit(1);
