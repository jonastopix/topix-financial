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

/**
 * Ordningens ikrafttrædelsesdato. Virksomheder med slutdato PÅ ELLER FØR
 * denne dato er uden for ordningen: de er håndteret i personlig dialog uden
 * for systemet. Ordningen træder i kraft 10. september 2026 og må ikke sende
 * noget på bagkant. Grænsen er "på eller før", ikke "før", fordi adgangen
 * forsvinder kl. 00:00 UTC på selve slutdagen — et medlem med slutdato
 * præcis 10. september har mistet adgangen i samme øjeblik, ordningen
 * begynder.
 */
export const FORNYELSE_IKRAFT_DATO = "2026-09-10";

export type Fornyelsesbeslutning = "tilbyd" | "tilbyd_ikke";

export interface FornyelseInput {
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  beslutning: Fornyelsesbeslutning | null;
}

export type FornyelseStatus =
  | "ingen_slutdato"
  | "uden_for_ordningen"
  | "selvbetjener"
  | "udloebet_uden_beslutning"
  | "udloebet_tilbyd"
  | "udloebet_tilbyd_ikke"
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
 * Datoens UTC-kalenderdag som "YYYY-MM-DD" — sammenligninger på denne streng
 * er rene kalenderdato-sammenligninger og afhænger ikke af maskinens tidszone.
 */
function utcKalenderdato(s: string): string | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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
  // tier beregnes her alene til returværdien (alle grene returnerer den som
  // computeMembershipTier giver den). Status-forgreningen må først bruge den
  // EFTER null-tjekket og ikrafttrædelses-tjekket nedenfor.
  const tier = computeMembershipTier(
    {
      contract_end_date: input.contract_end_date,
      subscription_status: input.subscription_status,
      subscription_current_period_end: input.subscription_current_period_end,
    },
    now,
  );

  if (!input.contract_end_date) {
    return { status: "ingen_slutdato", dage_til_udloeb: null, tier };
  }

  const dage_til_udloeb = beregnDageTilUdloeb(input.contract_end_date, now);

  // UDEN FOR ORDNINGEN — afgøres FØRST, før tier overhovedet indgår i
  // forgreningen; ingen anden status må kunne returneres for disse
  // virksomheder. Disse virksomheder er håndteret i personlig dialog uden
  // for systemet. Ordningen træder i kraft 10. september 2026 og må ikke
  // sende noget på bagkant. Grænsen er "på eller før", ikke "før", fordi
  // adgangen forsvinder kl. 00:00 UTC på selve slutdagen — et medlem med
  // slutdato præcis 10. september har mistet adgangen i samme øjeblik,
  // ordningen begynder. Sammenligningen sker på kalenderdato (UTC), ikke
  // tidsstempel, og afhænger ikke af maskinens tidszone.
  const slutdag = utcKalenderdato(input.contract_end_date);
  if (slutdag !== null && slutdag <= FORNYELSE_IKRAFT_DATO) {
    return { status: "uden_for_ordningen", dage_til_udloeb, tier };
  }

  if (tier === "no_date") {
    return { status: "ingen_slutdato", dage_til_udloeb, tier };
  }

  if (tier === "subscriber") {
    // Kontrakten er udløbet, men Stripe-abonnementet løber. Egen tilstand —
    // må ikke behandles som en almindelig fornyelse.
    return { status: "selvbetjener", dage_til_udloeb, tier };
  }

  if (tier === "expired") {
    // Efter udløb er forskellen mellem tilbud og afsked netop den handling,
    // der skal udløses. Én samlet "udloebet_besluttet"-status ville tvinge
    // enhver aftager til selv at læse beslutning og forgrene — og så ligger
    // dommen to steder. Derfor tre adskilte statusser.
    if (input.beslutning === "tilbyd") {
      return { status: "udloebet_tilbyd", dage_til_udloeb, tier };
    }
    if (input.beslutning === "tilbyd_ikke") {
      return { status: "udloebet_tilbyd_ikke", dage_til_udloeb, tier };
    }
    return { status: "udloebet_uden_beslutning", dage_til_udloeb, tier };
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
