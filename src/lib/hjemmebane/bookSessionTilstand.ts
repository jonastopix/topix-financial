/** Morten-kortets tilstandsmaskine — ren, testbar logik uden IO.

    Udtrukket fra BookSession.tsx 13-08-2026 forud for Hb-konverteringen.
    Motor-først: logikken flyttes og testes FØR fladen bygges om, så
    konverteringen kun handler om JSX. Adfærden er uændret — enhver
    ændring af tilstandene skal ske her og dækkes af tests.
    contractInFuture læses råt fra companies.contract_end_date og ikke fra
    membershipTier, fordi useAuth bevidst remapper "no_date" til "full",
    mens backend-dommen kræver en ægte fremtidig kontrakt. */

/** Mortens kolonne har fem synlige tilstande plus skjult ("hidden") og
    tom ("none") — samme navne som i BookSession.tsx. */
export type MortenTilstand =
  | "hidden"
  | "book"
  | "loading"
  | "none"
  | "booked"
  | "cancelled"
  | "link-ready";

export interface MortenTilstandInput {
  /** useAuth.isAdvisor — rådgivere ser aldrig Morten-kolonnen. */
  isAdvisor: boolean;
  /** useAuth.membershipTier — kun "full" er berettiget. */
  membershipTier: "full" | "subscriber" | "expired" | null;
  /** useAuth.companyId — null = ingen virksomhed. */
  companyId: string | null;
  /** companies-rækken (intro-status + rå kontraktdato) — null før hentning. */
  company: {
    intro_session_used_at: string | null;
    contract_end_date: string | null;
  } | null;
  /** Q3 (my-morten-booking) er ved at hente. */
  mortenBookingLoading: boolean;
  /** Nyeste session_bookings-række med advisor='morten' — null = ingen. */
  mortenBooking: { status: string } | null;
}

/** Afgør Morten-kolonnens tilstand. 1:1 med BookSession.tsx' afledninger
    (introUsed, contractInFuture, baseEligible, mortenState) — "nu" er
    injicérbar af hensyn til test, ellers samme new Date() som i dag. */
export function afgoerMortenTilstand(
  input: MortenTilstandInput,
  now: Date = new Date(),
): MortenTilstand {
  const introUsed = !!input.company?.intro_session_used_at;
  const contractEnd = input.company?.contract_end_date ?? null;
  const contractInFuture = !!contractEnd && new Date(contractEnd) > now;

  // baseEligible = backend ville acceptere (ikke raadgiver, fuldt medlem
  // med kontrakt i fremtiden, company-data hentet). !!company er bevaret
  // fra originalen, selv om contractInFuture allerede forudsætter den.
  const baseEligible =
    !input.isAdvisor &&
    input.membershipTier === "full" &&
    !!input.companyId &&
    !!input.company &&
    contractInFuture;

  return !baseEligible
    ? "hidden"
    : !introUsed
      ? "book"
      : input.mortenBookingLoading
        ? "loading"
        : !input.mortenBooking
          ? "none"
          : input.mortenBooking.status === "booked"
            ? "booked"
            : input.mortenBooking.status === "cancelled"
              ? "cancelled"
              : "link-ready";
}

/** Kolonnen får plads (to-kolonne-layout) i alle synlige tilstande —
    "hidden" og "none" falder rent tilbage til én kolonne. Samme regel som
    BookSession.tsx' showMortenColumn. */
export function visMortenKolonne(tilstand: MortenTilstand): boolean {
  return tilstand !== "hidden" && tilstand !== "none";
}
