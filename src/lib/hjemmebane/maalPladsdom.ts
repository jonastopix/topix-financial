/**
 * src/lib/hjemmebane/maalPladsdom.ts — HVILKEN regel databasen tæller
 * pladserne på Dine mål efter (skive 3, åbent punkt 13; Jonas 2/10-2026
 * «Ja, kun bekræftede»; migration 20261002241000).
 *
 * To regler har eksisteret:
 *   «alle»            — triggeren milestones_hoejst_tre_aktive (20260917150000)
 *                       tæller ALLE status = 'active', også ubekræftede forslag.
 *   «kun_bekraeftede» — triggeren (20261002241000) tæller kun aktive med
 *                       bekraeftet_at IS NOT NULL; et forslag tager ingen plads,
 *                       og bekræftelsen af et aktivt forslag dømmes som «bliver aktiv».
 *
 * Klienten MÅLER reglen, den gætter ikke: RPC'en maal_pladser_kun_bekraeftede()
 * svarer true, når den KØRENDE trigger-krop bærer markøren «PLADSDOM:
 * kun_bekraeftede» (pg_proc.prosrc). Dommen her oversætter svaret:
 *   true                → «kun_bekraeftede»
 *   false · null · fejl → «alle»   (også PGRST202 «funktionen findes ikke» — migrationen ikke kørt)
 * Fail-closed til «alle», fordi den gamle tekst aldrig lover en plads, som
 * databasen ville afvise — den omvendte fejl (fladen siger «plads», databasen
 * siger nej) er den, fladen før var bygget til at undgå (rådets fund 3, 2/10).
 *
 * REN: ingen Supabase, ingen React. Hooken bor i src/hooks/maalPladsdom.ts.
 */

import { MAX_AKTIVE_MAAL } from "./maal";

export type Pladsdom = "alle" | "kun_bekraeftede";

/** RPC'ens navn — ét sted (hooken og useBoardroomScore kalder den). */
export const PLADSDOM_RPC = "maal_pladser_kun_bekraeftede";

/** Dommen over RPC'ens svar — kun et bogstaveligt `true` giver den nye regel. */
export function laesPladsdom(data: unknown, fejl: { code?: string | null; message?: string | null } | null | undefined): Pladsdom {
  if (fejl) return "alle";
  return data === true ? "kun_bekraeftede" : "alle";
}

/** Hvor mange aktive mål tæller i pladserne efter reglen? */
export function aktiveDerTaeller(antalBekraeftede: number, antalUbekraeftede: number, pladsdom: Pladsdom): number {
  return pladsdom === "kun_bekraeftede" ? antalBekraeftede : antalBekraeftede + antalUbekraeftede;
}

/**
 * Grunden, «Det er vores mål»/«Behold» IKKE kan trykkes (rådets fund 2/10): under
 * «kun_bekraeftede» (20261002241000) dømmer triggeren bekræftelsen af et aktivt
 * forslag som «bliver aktiv» og afviser den med P0001, når virksomheden allerede
 * har 3 BEKRÆFTEDE aktive (sandhedstabellen: active/NULL → active/NOT NULL = JA).
 * Fladen viser grunden i stedet for at lade klikket løbe ind i databasens nej.
 * Under «alle» (20260917150000) dømmes en bekræftelse aldrig — status ændres ikke —
 * så knappen er altid mulig dér (som før).
 */
export const BEKRAEFT_PLADS_GRUND = "I har 3 aktive mål — parkér eller markér et som nået først";

/** null = bekræftelsen er mulig; ellers grunden (BEKRAEFT_PLADS_GRUND). Grænsen er MAX_AKTIVE_MAAL (3) — samme som triggerens. */
export function bekraeftelseSpaerret(pladsdom: Pladsdom, antalBekraeftedeAktive: number): string | null {
  if (pladsdom !== "kun_bekraeftede") return null;
  return antalBekraeftedeAktive >= MAX_AKTIVE_MAAL ? BEKRAEFT_PLADS_GRUND : null;
}
