/**
 * supabase/functions/generate-weekly-focus/ugensFokusGate.ts
 *
 * Gaten foran ugens fokus — ren funktion uden imports, så den kan spejles
 * ordret i src/lib/ugensFokusGate.ts og låses af en paritetstest
 * (src/lib/__tests__/ugensFokusGate.test.ts). Enhver ændring her SKAL
 * også laves der.
 *
 * BESLUTTET (Jonas, 8/9): «Maskinen skal selvfølgelig ikke foreslå noget,
 * hvis der ikke er noget at foreslå på.» Målt 8/9: ugens fokus valgte
 * virksomheder på ÉT flag (weekly_focus_enabled, default true) — ingen
 * tier, ingen status. Rallysupport og ANLA GLAS, begge faldet ud, fik
 * seks forslag hver; tre af triggerne fyrer netop ved stilstand.
 *
 * TO DOMME:
 *
 * 1. skalHaveUgensFokus — «er virksomheden der?». Samme regel som
 *    run-weekly-agent/index.ts:14-20 (status active + tier ≠ expired),
 *    som huset allerede havde skrevet for agentens ugekørsel; tier er
 *    computeMembershipTier (_shared/membershipTier.ts), husets
 *    adgangsdom, regnet af kalderen og givet ind her. IKKE er_kunde og
 *    IKKE is_legat: er_kunde handler om rådgiverens lister (vores egen
 *    virksomhed skal ikke stå som kunde), ikke om medlemmets platform;
 *    legat-medlemmer er i et forløb og bruger platformen. Status null
 *    tælles som aktiv, som i VirksomhedslisteView (status active || !status).
 *    «Noget at foreslå på» (tal) dømmes IKKE her: generate-weekly-focus
 *    har allerede sin minimum-data-gate (ingen committede facts i 90 dage
 *    → no_data, ingen forslag), og den strengere «over tre måneder siden
 *    seneste målte rapport OG nul besvarede forslag» ville ramme en
 *    virksomhed der rapporterer kvartalsvis og chatter — det er ikke
 *    «ikke der».
 *
 * 2. maaSkriveForslag — «ligger der allerede noget ubesvaret?». Seks
 *    ubesvarede plus seks nye er ikke et nudge. Ét ventende forslag (af
 *    ENHVER kilde — også rådgiverens) er nok til at holde maskinen tilbage;
 *    fokus-KORTET (headline/summary) skrives stadig, kun forslagene holdes.
 */

export type FokusTier = "no_date" | "full" | "subscriber" | "expired";

export interface FokusGateInput {
  /** companies.status — 'active', 'tidligere' eller null. */
  status: string | null | undefined;
  /** computeMembershipTier(company, nu). */
  tier: FokusTier;
}

export type FokusGateDom =
  | { ok: true }
  | { ok: false; grund: "udloebet" | "ikke_aktiv" };

/** Skal ugens fokus overhovedet køre for virksomheden? */
export function skalHaveUgensFokus(input: FokusGateInput): FokusGateDom {
  if (input.tier === "expired") return { ok: false, grund: "udloebet" };
  if (input.status != null && input.status !== "active") return { ok: false, grund: "ikke_aktiv" };
  return { ok: true };
}

/** Må der skrives NYE forslag, når `antalVentende` forslag (proposed, ikke
    udløbne) allerede ligger ubesvarede hos virksomheden? Kun ved nul. */
export function maaSkriveForslag(antalVentende: number): boolean {
  return antalVentende <= 0;
}
