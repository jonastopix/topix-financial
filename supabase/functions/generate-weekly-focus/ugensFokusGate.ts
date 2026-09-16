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
 * 1. skalHaveUgensFokus — «er virksomheden der?». Samme regel (status
 *    active + tier ≠ expired) som huset havde skrevet for agentens
 *    ugekørsel i run-weekly-agent (slettet 13/9 — den kørte aldrig); tier er
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
 * 2. maaSkriveForslag — «ligger der allerede noget ubesvaret?» — FLYTTET
 *    16/9 (fase 0a, «Én plan») til _shared/skridtForslag.ts (spejlet i
 *    src/lib/hjemmebane/skridtForslag.ts), hvor alle tre skrivere deler den
 *    sammen med gentagelsesdommen. Her står kun «er virksomheden der?».
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
