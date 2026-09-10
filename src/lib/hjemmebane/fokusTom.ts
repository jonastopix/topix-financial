/**
 * src/lib/hjemmebane/fokusTom.ts
 *
 * Fokuskortets TOMME tilstand — hvad der står når «Dit næste skridt» ikke
 * har noget punkt. Ren funktion, testet i __tests__/fokusTom.test.ts.
 *
 * FEJLEN (recon-den-tomme-platform.md §1, 7/9; rettet 9/9): kortet sagde
 * «Alt er ajour.» og «Rapport, refleksion og milestones er på plads — brug
 * momentum i dit forløb.» til ALLE uden punkter — også til et medlem der
 * aldrig har uploadet. Kommentaren sagde det udtrykkeligt: «Alle tal nul
 * (nyt medlem) → den hidtidige sætning uændret.» Det var en beslutning,
 * og den var forkert: seks virksomheder har medlemmer og har aldrig
 * uploadet (Bastant Design og TuaMea i 165 dage, Studio Mini 163, TOFT 83,
 * Homie 84, Limo Group 76), flere logger stadig ind — og fik at vide at
 * alt var på plads.
 *
 * TRE TILSTANDE, ikke to (Jonas 9/9), og alle tre bygges:
 *   1. ALDRIG — ingen upload, ingen godkendte tal. Sig hvad der mangler
 *      uden at bebrejde, og peg på det ene næste skridt: rapporten.
 *   2. UPLOADET, IKKE GODKENDT — rapporten venter på medlemmets eget klik
 *      («Gennemgå og godkend» → commit_report_facts; ingen automatik). Det
 *      forklarer de 73 ventende rapporter. Sig det, og peg derhen.
 *   3. GODKENDT — de er i gang. «Alt er ajour.» + anerkendelseslinjen
 *      (journeyLine) når der er noget at anerkende; ellers en rolig sætning
 *      der ikke påstår noget om milestones og refleksion.
 *
 * DEN FJERDE TILSTAND (10/9, recon-fejlovervaagningen §2): KUNNE IKKE
 * HENTE. Fejler hentningen af uploads eller godkendte tal, må kortet ikke
 * sige «Kom i gang med dine tal» — det er præcis den løgn 9/9 rettede, bare
 * fra en fejl frem for fra en beslutning. Tom er en tilstand; fejlet er en
 * fejl. Kortet siger roligt at vi ikke kunne hente det, at det ikke er noget
 * medlemmet har gjort, og hvad man kan gøre. Dommen om det er en fejl er
 * kalderens (isError på kildernes queries); ordene er her.
 *
 * SPROGET er husets: roligt, ingen udråb, ét næste skridt. Fornyelsesbåndet
 * («Dit medlemskab udløber 29. september 2026 / Forny nu til …») og
 * tjeklisten («Upload din første rapport, så tallene kommer i spil») er
 * forlæggene. Ingen «0 rapporter» — tomheden må aldrig blive et nul (bølge
 * 3's regel står), men den må heller ikke blive en løgn.
 */

export interface FokusTomInput {
  /** Fejlede hentningen af det kortet dømmer på (uploads eller godkendte tal)? Vinder over alt andet. */
  hentningFejlede?: boolean;
  /** Findes der mindst én ikke-slettet upload (financial_reports)? */
  harUploads: boolean;
  /** Findes der mindst én godkendt facts-række (financial_report_facts)? */
  harGodkendte: boolean;
  /** Anerkendelseslinjen — null når alle tal er nul. */
  journeyLine: string | null;
}

export type FokusTomTilstand = "kunne_ikke_hente" | "aldrig" | "uploadet_ikke_godkendt" | "godkendt";

export interface FokusTom {
  tilstand: FokusTomTilstand;
  overskrift: string;
  linje: string;
  /** Det ene næste skridt — null i tilstand 3 (der er ikke noget at gøre). */
  cta: { label: string; to: string } | null;
}

export const RAPPORTERING_STI = "/rapportering";

export const KUNNE_IKKE_HENTE_OVERSKRIFT = "Vi kunne ikke hente dine tal lige nu.";
export const KUNNE_IKKE_HENTE_LINJE =
  "Det er ikke noget du har gjort. Prøv at indlæse siden igen — og skriv til os i chatten, hvis det bliver ved.";

export function afgoerFokusTom(input: FokusTomInput): FokusTom {
  if (input.hentningFejlede) {
    return {
      tilstand: "kunne_ikke_hente",
      overskrift: KUNNE_IKKE_HENTE_OVERSKRIFT,
      linje: KUNNE_IKKE_HENTE_LINJE,
      // Ingen «Upload din første rapport»: vi ved ikke om de har en. CTA'en er
      // fladens «Prøv igen», som kalderen ejer.
      cta: null,
    };
  }
  if (input.harGodkendte) {
    return {
      tilstand: "godkendt",
      overskrift: "Alt er ajour.",
      linje: input.journeyLine ?? "Der er ikke noget der venter på dig lige nu.",
      cta: null,
    };
  }
  if (input.harUploads) {
    return {
      tilstand: "uploadet_ikke_godkendt",
      overskrift: "Dine tal venter på dig.",
      linje: "Rapporten er uploadet — du mangler at godkende tallene, før de kommer i spil.",
      cta: { label: "Gennemgå og godkend", to: RAPPORTERING_STI },
    };
  }
  return {
    tilstand: "aldrig",
    overskrift: "Kom i gang med dine tal.",
    linje: "Der er ikke uploadet en rapport endnu. Det er det første skridt — resten bygger på tallene.",
    cta: { label: "Upload din første rapport", to: RAPPORTERING_STI },
  };
}
