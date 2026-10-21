// Osobisty link do zamówienia PRO (oferta indywidualna po rozmowie kwalifikacyjnej).
//   node tools/link_pro.mjs --cena 9997 --email klient@domena.pl [--imie Jan --nazwisko Kowalski] [--dni 7]
// Wymaga PRO_OFFER_SECRET w .env — tego samego co na Render. Link wysyłasz klientowi mailem;
// cena i e-mail są podpisane, klient nie może ich zmienić. Link wygasa po --dni dniach (domyślnie 7).

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
    cena: Number(args.cena),
    email: args.email,
    imie: args.imie,
    nazwisko: args.nazwisko,
    dni: args.dni ? Number(args.dni) : 7,
  });
  console.log(`${site.replace(/\/$/, '')}/zamowienie.html?oferta=${token}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
