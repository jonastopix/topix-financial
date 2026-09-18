/**
 * aftalefelter — DE FELTER aftaleskabelonen må bruge, og hvor de kommer fra.
 * Ét sted (18/9-2026). Ren: ingen Deno, ingen Supabase, ingen IO.
 *
 * HVORFOR DEN FINDES: Jonas lagde aftaleteksten i prod som aftale_skabelon
 * v2 med tolv {{felter}}; send-til-underskrift kendte otte af dem. Koden
 * sender ALDRIG et dokument med rå {{…}} (udfyldSkabelon melder «manglende»
 * → 422), men ingen kunne se på forhånd HVILKE felter en tekst må bruge.
 * Nu står listen her, send-til-underskrift udfylder præcis den (kildeværnet
 * aftalefelter.guard.test.ts låser at funktionens nøgler = listen), og
 * ukendteFelter() dømmer en tekst FØR den bliver aktiv (SQL'en i README).
 *
 * KILDERNE er de tre: virksomheden (companies), ansøgningen (ansoegninger +
 * cvr_opslag_cache.svar — DataCVR's address/zipcode/city gemmes dér ved
 * formularens opslag) og husets prismotor (indgangspris.ts).
 *
 * {{samlet_kr}} ER MED VILJE IKKE PÅ LISTEN (Jonas 18/9, STOP-punkt): prisen
 * inkl. 5 % kendes først, når Køber vælger betalingsmodel på betalingslinket
 * — EFTER underskriften. Et tal dér ville være et gæt. Teksten skal i stedet
 * nævne alle tre modeller ({{pris_kr}}, {{pris_rate2_kr}}, {{pris_rate12_kr}},
 * {{pris_rate12_samlet_kr}}) — se rapport-aftalefelter.md.
 */

export interface Aftalefelt {
  navn: string;
  /** Hvor værdien kommer fra — til README og til fejlteksten. */
  kilde: string;
  /** Eksempel, som Jonas ser det i dokumentet. */
  eksempel: string;
}

export const KENDTE_FELTER: readonly Aftalefelt[] = [
  { navn: "virksomhed", kilde: "companies.name / ansøgningen (CVR-opslagets navn, ellers navn eller mail)", eksempel: "Nordic Byg ApS" },
  { navn: "cvr", kilde: "companies.cvr_number / ansoegninger.cvr", eksempel: "41772239" },
  { navn: "adresse", kilde: "companies.address / CVR-opslaget (cvr_opslag_cache.svar.address, ellers DataCVR live)", eksempel: "Vestergade 41, 1. tv." },
  { navn: "postnummer", kilde: "companies.postal_code / CVR-opslaget (zipcode)", eksempel: "8600" },
  { navn: "by", kilde: "companies.city / CVR-opslaget (city)", eksempel: "Silkeborg" },
  { navn: "kontaktperson", kilde: "companies.contact_person / ansoegninger.navn", eksempel: "Lisbeth Hansen" },
  { navn: "kontrakt_maaneder", kilde: "fast 12 — kontraktårets længde, fra betalingen", eksempel: "12" },
  { navn: "pris_kr", kilde: "prisniveauet (virksomhed: valgt ved afsendelsen; ansøgning: ansoegninger.pris_oere), ekskl. moms", eksempel: "50.000" },
  { navn: "pris_rate2_kr", kilde: "indgangspris.ts: 2 rater, pr. rate", eksempel: "25.000" },
  { navn: "pris_rate12_kr", kilde: "indgangspris.ts: 12 rater, pr. rate, inkl. 5 %", eksempel: "4.375" },
  { navn: "pris_rate12_samlet_kr", kilde: "indgangspris.ts: 12 rater i alt, inkl. 5 %", eksempel: "52.500" },
  { navn: "frist_dage", kilde: "BETALINGSFRIST_DAGE (30) — fra underskriften", eksempel: "30" },
  { navn: "dato", kilde: "afsendelsesdagen, dansk («18. september 2026»)", eksempel: "18. september 2026" },
  { navn: "frist_dato", kilde: "afsendelsesdagen + 30, dansk — vejledende; det bindende er «30 dage efter underskrift»", eksempel: "18. oktober 2026" },
];

export const KENDTE_FELTNAVNE: readonly string[] = KENDTE_FELTER.map((f) => f.navn);

/** Alle {{felter}} i en tekst, hver én gang, i rækkefølge. Samme regex som udfyldSkabelon. */
export function felterITekst(tekst: string): string[] {
  const set = new Set<string>();
  for (const m of tekst.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) set.add(m[1]);
  return [...set];
}

/** De felter i teksten, som koden IKKE kan udfylde — tom liste = teksten kan sendes. */
export function ukendteFelter(tekst: string, kendte: readonly string[] = KENDTE_FELTNAVNE): string[] {
  return felterITekst(tekst).filter((f) => !kendte.includes(f));
}
