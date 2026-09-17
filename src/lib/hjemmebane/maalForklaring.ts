/**
 * src/lib/hjemmebane/maalForklaring.ts — «Hvad er et mål?»
 * (forside PR 3, tillæg 17/9-2026 — Jonas, ordret: «Det er dog vigtigt de
 * forstår hvad et mål er eller kan være. For når der også er Skridt, så er
 * mål jo mere overordnet. Så måske vi skal give dem en forklaring på tingene
 * og et par eksempler.»)
 *
 * ÉN kilde til forklaringen og eksemplerne — brugt TRE steder:
 *   1. «Din plan» på forsiden uden mål (åben over «Sæt et mål»/«Book en session»)
 *      og med mål (foldet, <details> ved sektionens header) — BoardroomView.
 *   2. /milestones' tomme tilstand — DineMaalView (samme som 1).
 *   3. «Sæt et mål»-formularen — MilestoneDialoger (teksten over titelfeltet,
 *      eksemplernes mål som hjælp under feltet).
 * Ren fil: ingen React, ingen Supabase. Teksterne ordret som Jonas skrev dem.
 * Testet i __tests__/maalForklaring.test.ts; kildeværn (én kilde, tre steder)
 * i src/lib/__tests__/forsidePlan.guard.test.ts dom 6.
 */

export const MAAL_FORKLARING_OVERSKRIFT = "Hvad er et mål?";

export const MAAL_FORKLARING_TEKST =
  "Et mål er det, du vil nå med din virksomhed det næste halve til hele år. Skridtene er de konkrete ting, du gør for at komme dertil. Et godt mål kan mærkes på bundlinjen eller i hverdagen, og du ved, hvornår du er i mål.";

export interface MaalEksempel {
  maal: string;
  skridt: readonly string[];
}

/** Eksemplerne (mål → skridt) i Jonas' rækkefølge. */
export const MAAL_EKSEMPLER: readonly MaalEksempel[] = [
  { maal: "Positiv bundlinje hver måned inden jul", skridt: ["Gennemgå de faste udgifter", "Hæv timeprisen", "Aftal rammeaftale med de tre største kunder"] },
  { maal: "Ansætte den første medarbejder i foråret", skridt: ["Regn lønnen ind i budgettet", "Skriv jobopslaget"] },
  { maal: "Tre måneders udgifter i banken", skridt: ["Lav et likviditetsbudget", "Kortere betalingsfrist på nye fakturaer"] },
];

/** Hjælpelinjen under titelfeltet i «Sæt et mål»: eksemplernes mål — «Fx: Positiv bundlinje hver måned inden jul · …». */
export function maalEksemplerHjaelp(): string {
  return `Fx: ${MAAL_EKSEMPLER.map((e) => e.maal).join(" · ")}`;
}
