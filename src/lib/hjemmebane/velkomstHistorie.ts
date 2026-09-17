/**
 * src/lib/hjemmebane/velkomstHistorie.ts — velkomstvideoen som hovedhistorie
 * den første uge (medlemmets forside PR 5, 17/9-2026 — Jonas «A på alle»,
 * valg 7: «velkomstvideoen som hovedhistorie den første uge for et nyt
 * medlem»; analyse §2 (a): «en ny fra webinaret på dag 1 (ingen rapporter,
 * ingen mål, ingen skridt, måske intet cover på nyheden)». Webinaret 22/9
 * giver 10–15 nye medlemmer.)
 *
 * REN dom: ingen React, ingen Supabase. Kilderne findes allerede på forsiden:
 *   - companies.contract_start_date (contractStartQuery — samme felt som
 *     forsideHilsen's dag 1; stripe-webhook sætter den på betalingsdagen,
 *     null for legacy). DEN FØRSTE UGE = 0–7 danske kalenderdage efter
 *     starten — samme dagsregning som erDag1 (forsideHilsen.erIndenDoegn),
 *     ÉN kilde: erDag1 er 14 døgn (hilsenens tone), velkomsten 7 (videoen).
 *   - app_config.velkomstvideo_guid (useAppConfig/useOnboardingTjekliste:
 *     harVelkomstvideo) — tom = ingen video = almindelig rykkeliste.
 *   - profiles.velkomstvideo_set_at (useOnboardingTjekliste) — stemplet når
 *     medlemmet trykkede «Kom i gang» i overlejringen eller «Jeg har set den»
 *     her; sat = videoen falder tilbage til den almindelige rykkeliste.
 *
 * VALG: velkomsten står FØRST i rykkelisten (før pushet) — kun i den første
 * uge, kun med video, kun indtil den er set. Dag 8 → rykkelisten som før.
 * Overlejringen (HbOnboardingTjekliste) popper stadig op ved første besøg;
 * hovedhistorien er den anden chance for den der trykkede «Se senere».
 * Testet i __tests__/velkomstHistorie.test.ts; kildeværn
 * src/lib/__tests__/forsideDag1.guard.test.ts.
 */
import { erIndenDoegn } from "./forsideHilsen";

/** Den første uge i døgn: starten i dag til og med dag 7. */
export const VELKOMST_UGE_DOEGN = 7;

/** Er medlemskabets start 0–7 danske kalenderdage tilbage? Ingen start/ulæselig/fremtid → nej. */
export function erFoersteUge(startDato: string | null | undefined, nu: Date): boolean {
  return erIndenDoegn(startDato, nu, VELKOMST_UGE_DOEGN);
}

export interface VelkomstHistorieInput {
  /** companies.contract_start_date — ISO-dato eller -tidsstempel; null = legacy. */
  startDato: string | null | undefined;
  nu: Date;
  /** app_config.velkomstvideo_guid er sat (harVelkomstvideo). */
  harVideo: boolean;
  /** profiles.velkomstvideo_set_at — null = ikke set. */
  setAt: string | null | undefined;
}

/** Skal velkomstvideoen stå i hovedpladsen? Første uge OG video OG ikke set. */
export function velkomstHovedhistorie({ startDato, nu, harVideo, setAt }: VelkomstHistorieInput): boolean {
  if (!harVideo) return false;
  if (setAt) return false;
  return erFoersteUge(startDato, nu);
}

// ── Teksterne (til Jonas' godkendelse — README) ──
export const VELKOMST_EYEBROW = "Velkommen";
export const VELKOMST_TITEL = "Morten fortæller, hvad du får";
/** Tjeklistens egen sætning om videoen (onboardingTjekliste «Se velkomsten») — samme ord. */
export const VELKOMST_MANCHET = "En kort video om hvordan du får mest ud af The Boardroom.";
export const VELKOMST_SET_KNAP = "Jeg har set den";
export const VELKOMST_SET_HJAELP = "Så krydses «Se velkomsten» af i tjeklisten, og nyheden tager pladsen.";
