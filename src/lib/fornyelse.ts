/**
 * src/lib/fornyelse.ts
 *
 * Ren, testbar afgørelse af en virksomheds fornyelsestilstand.
 * Samme mønster som deriveFocus og eventMeetPhase: ingen I/O, ingen
 * Supabase, ingen React — samme input giver altid samme output.
 *
 * VIGTIGT: dette modul afgør IKKE selv om medlemskabet er udløbet.
 * Det importerer og kalder computeMembershipTier, fordi der skal findes
 * ÉN definition af "udløbet" i repoet (kanonisk i src/lib/membershipTier.ts,
 * spejlet i Deno og SQL). En lokal kopi af udløbslogikken her ville være
 * kopi nr. 4 og før eller siden drive fra de andre tre.
 *
 * Dage til udløb regnes i hele kalenderdage på UTC-komponenter af begge
 * datoer, så tallet er det samme uanset maskinens tidszone (testene skal
 * bestå både lokalt og under TZ=UTC).
 */
import { computeMembershipTier, type MembershipTier } from "./membershipTier";

/** Beslutningsvinduet: så mange dage (eller færre) før udløb kræves en beslutning. */
export const FORNYELSES_VINDUE_DAGE = 60;

export type Fornyelsesbeslutning = "tilbyd" | "tilbyd_ikke";

export interface FornyelseInput {
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  beslutning: Fornyelsesbeslutning | null;
}

export type FornyelseStatus =
  | "ingen_slutdato"
  | "selvbetjener"
  | "udloebet_uden_beslutning"
  | "udloebet_besluttet"
  | "beslutning_mangler"
  | "klar_til_tilbud"
  | "klar_til_afsked"
  | "i_god_tid";

export interface Fornyelsestilstand {
  status: FornyelseStatus;
  /** Hele kalenderdage til kontraktudløb; negativ efter udløb; null uden slutdato. */
  dage_til_udloeb: number | null;
  tier: MembershipTier;
}

const MS_PER_DOEGN = 86_400_000;

/** UTC-midnat for datoens kalenderdag — tidszone-uafhængig dagsammenligning. */
function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function beregnDageTilUdloeb(contractEndDate: string, now: Date): number | null {
  const slut = new Date(contractEndDate);
  if (Number.isNaN(slut.getTime())) return null;
  return Math.round((utcMidnat(slut) - utcMidnat(now)) / MS_PER_DOEGN);
}

/**
 * Afgør fornyelsestilstanden for en virksomhed.
 *
 * Fraværs-semantikken følger company_fornyelse-tabellen: beslutning = null
 * betyder "ingen beslutning truffet". En beslutning truffet i god tid ændrer
 * bevidst IKKE status før 60-dages vinduet — "i_god_tid" er én tilstand,
 * uanset om der allerede er besluttet.
 */
export function afgoerFornyelsestilstand(
  input: FornyelseInput,
  now: Date = new Date(),
): Fornyelsestilstand {
  const tier = computeMembershipTier(
    {
      contract_end_date: input.contract_end_date,
      subscription_status: input.subscription_status,
      subscription_current_period_end: input.subscription_current_period_end,
    },
    now,
  );

  const dage_til_udloeb = input.contract_end_date
    ? beregnDageTilUdloeb(input.contract_end_date, now)
    : null;

  if (tier === "no_date") {
    return { status: "ingen_slutdato", dage_til_udloeb, tier };
  }

  if (tier === "subscriber") {
    // Kontrakten er udløbet, men Stripe-abonnementet løber. Egen tilstand —
    // må ikke behandles som en almindelig fornyelse.
    return { status: "selvbetjener", dage_til_udloeb, tier };
  }

  if (tier === "expired") {
    return {
      status: input.beslutning === null ? "udloebet_uden_beslutning" : "udloebet_besluttet",
      dage_til_udloeb,
      tier,
    };
  }

  // tier === "full"
  const iVindue = dage_til_udloeb !== null && dage_til_udloeb <= FORNYELSES_VINDUE_DAGE;
  if (!iVindue) {
    return { status: "i_god_tid", dage_til_udloeb, tier };
  }
  if (input.beslutning === "tilbyd") {
    return { status: "klar_til_tilbud", dage_til_udloeb, tier };
  }
  if (input.beslutning === "tilbyd_ikke") {
    return { status: "klar_til_afsked", dage_til_udloeb, tier };
  }
  return { status: "beslutning_mangler", dage_til_udloeb, tier };
}
