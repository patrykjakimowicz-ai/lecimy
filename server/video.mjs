// Podpisywanie linków do wideo w Bunny Stream (Security → Embed view token authentication).
// Ustaw BUNNY_TOKEN_KEY (klucz z panelu Bunny: Stream → biblioteka → Security). Bez klucza linki idą bez podpisu.
// Token = SHA256_HEX(klucz + videoId + expires); link ważny BUNNY_LINK_HOURS godzin (domyślnie 6).
import { createHash } from 'node:crypto';

// Dostępne prędkości odtwarzania ustawia się w Bunny (biblioteka → Player → Playback speed); limit zaliczania liczy serwer (progress.mjs).
export function signVideoUrl(url, nowMs = Date.now()) {
  const m = /^https:\/\/iframe\.mediadelivery\.net\/embed\/(\d+)\/([0-9a-f-]+)/i.exec(url || '');
  if (!m) return url;
  const base = url.split('?')[0];
  const key = process.env.BUNNY_TOKEN_KEY;
  if (!key) return url;
  const hours = Number(process.env.BUNNY_LINK_HOURS) || 6;
  const expires = Math.floor(nowMs / 1000) + hours * 3600;
  const token = createHash('sha256').update(key + m[2] + expires).digest('hex');
  return `${base}?token=${token}&expires=${expires}`;
}
