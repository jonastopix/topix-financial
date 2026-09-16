/**
 * src/lib/betalEfterFristen.ts
 *
 * Dommen over /betal EFTER fristen (DE TYVE (12), 16/9): hvad siden siger
 * når status er 'frist_overskredet' — og om der er en faktura at betale.
 * Ren funktion, ingen React, ingen Supabase; testet i
 * __tests__/betalEfterFristen.test.ts, og Betal.tsx låses til dommen af
 * __tests__/betalEfterFristen.guard.test.ts.
 *
 * FEJLEN (recon-fakturateksten.md): siden sagde «Vi har sendt en faktura på
 * det fulde beløb …» fra kl. 02:00 dansk på dag 31 (SQL'ens current_date
 * skifter kl. 00:00 UTC), mens cronen indgangs-paamindelser først sender
 * fakturaen kl. 12:00 dansk (0 10 * * * UTC). Ti timer usandt — og længere,
 * hvis fakturamotoren fejler. Teksten fulgte DAGENE; nu følger den STEMPLET:
 * company_betalingslink.faktura_sendt_at, som _shared/indgangsFaktura.ts
 * sætter KUN når fakturaen er sendt fra Stripe, og som hent_betalingstilbud
 * returnerer som faktura_sendt_den (UTC-dato, migration 20260916150000)
 * sammen med faktura_url (Stripes hostede fakturaside).
 *
 * JONAS' BESLUTNING 16/9 (docs/OVERLEVERING.md:8167): før afsendelse «Fristen
 * udløb {frist}. Du får en faktura på det fulde beløb.»; efter «Vi har sendt
 * fakturaen på mail den {dato}» + knap «Betal fakturaen». Chatten 16/9:
 * «Pladsen står stadig klar til dig.» sidst i begge tilstande. Mailadressen
 * ALDRIG på siden — denne fil kender ingen mail, og funktionen bag siden
 * returnerer ingen (kildeværnet låser begge dele). Husets egen kontaktadresse
 * (lib/kontaktadresse.ts, «Spørgsmål? Skriv til …») er ikke medlemmets og står
 * som før under skærmen.
 *
 * KNAPPEN kræver et https://-link (erSikkertFakturalink): href kommer fra
 * databasen, og en kolonne sat i hånden må aldrig kunne blive et
 * javascript:-link på en side der åbnes med et token. Uden link vises datoen
 * stadig — Stripe har sendt fakturaen på mail, og «Skriv til os» er udvejen.
 *
 * DATOERNE er «YYYY-MM-DD» fra SQL'ens ::date::text og formateres med
 * formaterFrist, som splitter selv (aldrig new Date(), nextStep.ts-mønstret)
 * — flyttet hertil fra Betal.tsx, så hovedskærmens «Betal inden …» og denne
 * gren bruger præcis den samme.
 */

export const EFTER_FRISTEN_TITEL = "Fristen er passeret";
export const BETAL_FAKTURAEN = "Betal fakturaen";
const DU_FAAR_EN_FAKTURA = "Du får en faktura på det fulde beløb.";
/** Chatten 16/9: står sidst i BEGGE tilstande — aftalen bortfalder ikke (§4). */
const PLADSEN_STAAR_KLAR = "Pladsen står stadig klar til dig.";

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** "2026-10-02" → "2. oktober 2026". Splitter selv frem for new Date(),
    så datoen ikke skifter med maskinens tidszone. Ulæseligt → uændret. */
export function formaterFrist(iso: string): string {
  const [aar, md, dag] = iso.split("-").map((s) => Number(s));
  if (!aar || !md || !dag || md < 1 || md > 12) return iso;
  return `${dag}. ${MAANEDER[md - 1]} ${aar}`;
}

/** Det dommen læser af hent_betalingstilbud's svar — Betalingstilbud (Betal.tsx)
    opfylder den strukturelt. Felter kan mangle (undefined) hvis frontenden
    kører før migrationen — så er svaret «faktura på vej», som er sandt nok. */
export interface EfterFristenInput {
  /** "YYYY-MM-DD" — kontraktens frist (underskrevet_at::date + 30). */
  frist: string | null | undefined;
  /** "YYYY-MM-DD" — faktura_sendt_at::date; null = ikke sendt. */
  faktura_sendt_den: string | null | undefined;
  /** Stripes hosted_invoice_url; null = intet link. */
  faktura_url: string | null | undefined;
}

export type EfterFristen =
  | { tilstand: "faktura_paa_vej"; titel: string; tekst: string; knap: null }
  | { tilstand: "faktura_sendt"; titel: string; tekst: string; knap: { label: string; href: string } | null };

/** Kun et https://-link der kan parses bliver en knap. */
export function erSikkertFakturalink(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (t !== url || t === "") return false;
  try {
    return new URL(t).protocol === "https:";
  } catch {
    return false;
  }
}

export function afgoerEfterFristen(input: EfterFristenInput): EfterFristen {
  const sendtDen = (input.faktura_sendt_den ?? "").trim();
  if (sendtDen === "") {
    const frist = (input.frist ?? "").trim();
    const tekst = frist
      ? `Fristen udløb ${formaterFrist(frist)}. ${DU_FAAR_EN_FAKTURA} ${PLADSEN_STAAR_KLAR}`
      : `Fristen er udløbet. ${DU_FAAR_EN_FAKTURA} ${PLADSEN_STAAR_KLAR}`;
    return { tilstand: "faktura_paa_vej", titel: EFTER_FRISTEN_TITEL, tekst, knap: null };
  }
  return {
    tilstand: "faktura_sendt",
    titel: EFTER_FRISTEN_TITEL,
    tekst: `Vi har sendt fakturaen på mail den ${formaterFrist(sendtDen)}. ${PLADSEN_STAAR_KLAR}`,
    knap: erSikkertFakturalink(input.faktura_url) ? { label: BETAL_FAKTURAEN, href: input.faktura_url } : null,
  };
}
