// Osobisty link do zamówienia PRO (oferta indywidualna po rozmowie kwalifikacyjnej).
//   node tools/link_pro.mjs --email klient@domena.pl [--imie Jan --nazwisko Kowalski] [--godziny 24]
// Wymaga PRO_OFFER_SECRET w .env — tego samego co na Render. Link wysyłasz klientowi mailem;
// cena i e-mail są podpisane, klient nie może ich zmienić. Link wygasa po --godziny (24, 72, 168, 336, 720; domyślnie 24).

import 'dotenv/config';
import { createProOffer } from '../server/proOffer.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => {
    const [k, ...v] = a.trim().split(' ');
    return [k, v.join(' ')];
  })
);

const site = process.env.SITE_URL || 'https://lecimyposwoje.pl';
try {
  const token = createProOffer({
    cena: args.cena ? Number(args.cena) : 9997,
    email: args.email,
    imie: args.imie,
    nazwisko: args.nazwisko,
    godziny: args.godziny ? Number(args.godziny) : 24,
  });
  console.log(`${site.replace(/\/$/, '')}/zamowienie.html?oferta=${token}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
