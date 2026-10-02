import { retTilGode } from "@/lib/sessionRet";
import { computeMembershipTier } from "@/lib/membershipTier";

/** Book session-fladens tilstandsmaskine — ren, testbar logik uden IO.

    Udtrukket fra BookSession.tsx 13-08-2026 forud for Hb-konverteringen.
    Motor-først: logikken flyttes og testes FØR fladen bygges om, så
    konverteringen kun handler om JSX. Enhver ændring af tilstandene skal
    ske her og dækkes af tests (bookSessionTilstand.test.ts).
    contractInFuture læses råt fra companies.contract_end_date og ikke fra
    membershipTier, fordi useAuth bevidst remapper "no_date" til "full",
    mens backend-dommen kræver en ægte fremtidig kontrakt.

    TO RETTIGHEDER, ÉN DOM (13/9, recon-de-tre-sessioner.md): medlemskabet
    indeholder én session med hver rådgiver. Mortens ret er
    companies.intro_session_used_at, Jonas' er companies.jonas_session_used_at
    (søsterkolonne, migration 20260913220000). Begge dømmes af samme
    maskine (afgoerRet) — forskellen er kun hvad kortet gør med dommen:

      Morten-kortet  vises i alle synlige tilstande og FORSVINDER når retten
                     er brugt uden en række ("none") eller medlemmet ikke er
                     berettiget ("hidden") — som i dag.
      Jonas-kortet   findes ALTID. Det viser den inkluderede session, indtil
                     retten er brugt, og skifter derefter til den købte
                     (Jonas 13/9: «et link der kun kan bookes én gang.
                     Derefter skal boksen skifte til den betalte»).
                     "link-ready" hører stadig til det inkluderede kort:
                     linket vises KUN her (den inkluderede vej sender ingen
                     mail), så det må ikke forsvinde før tiden er valgt.
                     "booked" og "cancelled" viser det købte kort —
                     Calendly har selv sendt bekræftelsen.

    Der er altså altid præcis to kort, indtil Mortens er brugt — så ét. */

/** En rettigheds syv tilstande — samme navne som i BookSession.tsx. */
export type InkluderetTilstand =
  | "hidden"
  | "book"
  | "loading"
  | "none"
  | "booked"
  | "cancelled"
  | "link-ready";

/** Mortens kolonne — navnet bevares; typen er den fælles. */
export type MortenTilstand = InkluderetTilstand;

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
  /** Q3 (my-inkluderede-bookinger) er ved at hente. */
  mortenBookingLoading: boolean;
  /** Nyeste session_bookings-række med advisor='morten' — null = ingen. */
  mortenBooking: { status: string } | null;
}

/** Berettigelse — fælles for begge rettigheder: backend ville acceptere
    (ikke rådgiver, fuldt medlem med kontrakt i fremtiden, company-data
    hentet). !!company er bevaret fra originalen, selv om contractInFuture
    allerede forudsætter den. */
function erBerettiget(
  input: Pick<MortenTilstandInput, "isAdvisor" | "membershipTier" | "companyId"> & {
    company: { contract_end_date: string | null } | null;
  },
  now: Date,
): boolean {
  // Kontrakten dømmes af computeMembershipTier — SAMME dom som backendens 403-port (2/10, CTO-rådets fund 5):
  // slutdatoen er sidste dag med adgang. Før: `new Date(contract_end_date) > now`, som skjulte kortet på
  // kontraktens sidste dag, mens backenden og forsidens «Til gode» sagde bookbar.
  const contractInFuture = !!input.company?.contract_end_date &&
    computeMembershipTier({ contract_end_date: input.company.contract_end_date, subscription_status: null, subscription_current_period_end: null }, now) === "full";
  return (
    !input.isAdvisor &&
    input.membershipTier === "full" &&
    !!input.companyId &&
    !!input.company &&
    contractInFuture
  );
}

/** Én rettigheds dom: retten (brugt/ikke brugt) + nyeste række på sporet. */
function afgoerRet(
  berettiget: boolean,
  retBrugt: boolean,
  loading: boolean,
  booking: { status: string } | null,
): InkluderetTilstand {
  return !berettiget
    ? "hidden"
    : !retBrugt
      ? "book"
      : loading
        ? "loading"
        : !booking
          ? "none"
          : booking.status === "booked"
            ? "booked"
            : booking.status === "cancelled"
              ? "cancelled"
              : "link-ready";
}

/** Afgør Morten-kolonnens tilstand. 1:1 med BookSession.tsx' afledninger
    (introUsed, contractInFuture, baseEligible, mortenState) — "nu" er
    injicérbar af hensyn til test, ellers samme new Date() som i dag. */
export function afgoerMortenTilstand(
  input: MortenTilstandInput,
  now: Date = new Date(),
): MortenTilstand {
  return afgoerRet(
    erBerettiget(input, now),
    input.company ? !retTilGode("morten", { ...input.company, jonas_session_used_at: null }) : false,
    input.mortenBookingLoading,
    input.mortenBooking,
  );
}

/** Kolonnen får plads (to-kolonne-layout) i alle synlige tilstande —
    "hidden" og "none" falder rent tilbage til én kolonne. Samme regel som
    BookSession.tsx' showMortenColumn. */
export function visMortenKolonne(tilstand: MortenTilstand): boolean {
  return tilstand !== "hidden" && tilstand !== "none";
}

// ── Begge rettigheder ─────────────────────────────────────────────────────

export interface BookSessionInput {
  isAdvisor: boolean;
  membershipTier: "full" | "subscriber" | "expired" | null;
  companyId: string | null;
  /** companies-rækken: begge rettigheder + rå kontraktdato — null før hentning. */
  company: {
    intro_session_used_at: string | null;
    jonas_session_used_at: string | null;
    /** companies.jonas_session_tilbudt_at — et tilbud overtrumfer en ældre «brugt» (lib/sessionRet, 2/10). */
    jonas_session_tilbudt_at?: string | null;
    contract_end_date: string | null;
  } | null;
  /** Q3 (my-inkluderede-bookinger, amount_dkk = 0, begge rådgivere) er ved at hente. */
  inkluderedeLoading: boolean;
  /** Nyeste inkluderede række pr. rådgiver — null = ingen. */
  mortenBooking: { status: string } | null;
  jonasBooking: { status: string } | null;
}

/** Jonas-kortets to ansigter. Den inkluderede har kun de tilstande hvor
    kortet stadig skal handle om retten; alt andet er det købte kort. */
export type JonasKort =
  | { kort: "inkluderet"; tilstand: "book" | "loading" | "link-ready" }
  | { kort: "koebt" };

export interface BookSessionTilstand {
  morten: MortenTilstand;
  jonas: JonasKort;
}

export function afgoerBookSession(
  input: BookSessionInput,
  now: Date = new Date(),
): BookSessionTilstand {
  const berettiget = erBerettiget(input, now);
  const morten = afgoerRet(
    berettiget,
    input.company ? !retTilGode("morten", { ...input.company, jonas_session_used_at: null }) : false,
    input.inkluderedeLoading,
    input.mortenBooking,
  );
  // Jonas' ret dømmes af den ENE regel (lib/sessionRet, 2/10): et tilbud overtrumfer en ældre «brugt» —
  // samme dom som backenden booker efter. Før: `!!jonas_session_used_at`, så et tilbudt medlem så det købte kort.
  const jonasRet = afgoerRet(
    berettiget,
    input.company ? !retTilGode("jonas", input.company) : false,
    input.inkluderedeLoading,
    input.jonasBooking,
  );

  // Company-rækken er ikke hentet endnu for en ellers berettiget bruger:
  // vis "loading" frem for at blinke det købte kort op og skifte til det
  // inkluderede et øjeblik efter. Rådgivere og abonnenter rammes ikke.
  const venterPaaCompany =
    !input.isAdvisor && input.membershipTier === "full" && !!input.companyId && input.company === null;

  const jonas: JonasKort =
    jonasRet === "book" || jonasRet === "loading" || jonasRet === "link-ready"
      ? { kort: "inkluderet", tilstand: jonasRet }
      : jonasRet === "hidden" && venterPaaCompany
        ? { kort: "inkluderet", tilstand: "loading" }
        : { kort: "koebt" };

  return { morten, jonas };
}
