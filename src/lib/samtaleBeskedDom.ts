/**
 * src/lib/samtaleBeskedDom.ts — spejl af supabase/functions/_shared/samtaleBeskedDom.ts
 * (udkast 18/9-2026). Enhver ændring her SKAL også laves i _shared-udgaven;
 * pariteten låses af samtaleBeskedDom.test.ts. Begrundelserne står dér.
 */
export type SamtaleAendring = "book" | "flyt" | "aflys";
export type SamtaleAktoer = "ansoeger" | "raadgiver";

/** Skabelonnavne i samtaleMails.ts — bevidst IKKE i KOE_SKABELONER (de går uden om køen). */
export const SAMTALE_MAIL = {
  book: "ansoegning-samtale-bekraeftet",
  flyt: "ansoegning-samtale-flyttet",
  aflys: "ansoegning-samtale-aflyst",
} as const;

/** advisor_notifications.type for klokkerne (reference_type «ansoegning»). */
export const SAMTALE_KLOKKE = {
  book: "ansoegning_samtale_booket",
  flyt: "ansoegning_samtale_flyttet",
  aflys: "ansoegning_samtale_aflyst",
} as const;

export interface SamtaleBesked {
  mailTilAnsoeger: (typeof SAMTALE_MAIL)[SamtaleAendring];
  klokkeTilRaadgiver: (typeof SAMTALE_KLOKKE)[SamtaleAendring] | null;
}

export function afgoerSamtaleBesked(aendring: SamtaleAendring, af: SamtaleAktoer): SamtaleBesked {
  return {
    mailTilAnsoeger: SAMTALE_MAIL[aendring],
    klokkeTilRaadgiver: af === "ansoeger" ? SAMTALE_KLOKKE[aendring] : null,
  };
}

/** Én mail pr. (ansøgning, ændring, ny tid) — samme mekanik som rykkerkøens idempotensnøgle. */
export function samtaleIdempotensnoegle(ansoegningId: string, aendring: SamtaleAendring, startIso: string | null): string {
  return `samtale:${ansoegningId}:${aendring}:${startIso ?? "ingen"}`;
}

/** Klokkens tekst til rådgiverne — navnet er ansøgerens virksomhed, tiderne er formateret af kalderen (dansk tid). */
export function klokkeTekst(aendring: SamtaleAendring, navn: string, nyTid: string | null, gammelTid: string | null): { title: string; body: string } {
  if (aendring === "book") return { title: `${navn} har booket samtalen`, body: `${nyTid ?? "Tiden mangler"}. Ansøgeren har fået en bekræftelse.` };
  if (aendring === "flyt") return { title: `${navn} har flyttet samtalen`, body: `Ny tid: ${nyTid ?? "?"}. Den var sat til ${gammelTid ?? "?"}.` };
  return { title: `${navn} har aflyst samtalen`, body: `Den var sat til ${gammelTid ?? "?"}. Ansøgningen står igen som indkaldt; rykkerne starter forfra.` };
}
