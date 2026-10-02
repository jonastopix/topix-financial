/**
 * Forsidens «Til gode» (forside v3, docs/forside-v3.md §2 — Jonas 2/10 20:09 og ~20:20: «Uanset hvordan og
 * hvorfor, hvis man har en gratis 1:1 session, uanset om det er med Morten, Jonas eller begge, så skal det
 * fremgå.»).
 *
 * Til gode = PRÆCIS det, backenden (create-free-intro-booking) ville lade virksomheden booke: tier «full»
 * (computeMembershipTier — samme dom som functionens 403-port; «no_date» er ikke full) OG retten til gode
 * (lib/sessionRet.retTilGode — samme fil som functionens gate, spejlet). Dommen læser KUN virksomhedens række,
 * aldrig hvem der kigger — så en rådgiver i «Se som medlem» ser det samme som medlemmet.
 *
 * REN. Tiden gives ind som `nu`.
 */
import { computeMembershipTier } from "@/lib/membershipTier";
import { retTilGode, type SessionRaadgiver, type SessionRetKilde } from "@/lib/sessionRet";

export interface TilGodeKilde extends SessionRetKilde {
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

/** Rækkefølgen er fast: Morten, så Jonas. */
export const RAADGIVER_RAEKKEFOELGE: readonly SessionRaadgiver[] = ["morten", "jonas"];

export function sessionerTilGode(c: TilGodeKilde | null | undefined, nu: Date): SessionRaadgiver[] {
  if (!c) return [];
  if (computeMembershipTier(c, nu) !== "full") return [];
  return RAADGIVER_RAEKKEFOELGE.filter((r) => retTilGode(r, c));
}

export const RAADGIVER_NAVN: Readonly<Record<SessionRaadgiver, string>> = { morten: "Morten", jonas: "Jonas" };

export const TIL_GODE_ORD = {
  eyebrow: "Til gode",
  overskrift: (n: number) => (n === 1 ? "1 gratis 1:1-session" : `${n} gratis 1:1-sessioner`),
  raekke: (r: SessionRaadgiver) => `1:1 med ${RAADGIVER_NAVN[r]}`,
  book: "Book",
  sti: "/book-session",
} as const;
