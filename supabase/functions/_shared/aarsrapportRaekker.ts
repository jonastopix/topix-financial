/**
 * _shared/aarsrapportRaekker.ts — balanceposter kun i december (10/9-2026, de-tyve nr. 9).
 *
 * REN: ingen Deno-, Supabase- eller npm-imports; vitest læser den direkte
 * (src/lib/__tests__/aarsrapportRaekker.test.ts).
 *
 * HVORFOR: årsrapport-udtrækket og baseline-vejen fordeler resultattal med
 * /12 og skrev samtidig ultimo-tallene (bank, egenkapital) UDELT ind i alle
 * tolv måneder. En beholdning hører til én dag — 31/12 — så januar til
 * november fik en falsk saldo i graf, cashflow og forsidens bank-tal
 * (recon-tallene-tre.md §2). Nu bærer kun decemberrækken balanceposterne.
 *
 * DE ELLEVE MÅNEDER ER TOMME, IKKE NUL: nøglen udelades. For fladen er «tom»
 * og «fraværende» det samme (useCompanyFacts.parseMetrics tager kun tal,
 * factsAdapter dropper null), og periodemotoren viser beholdninger som ultimo
 * af seneste række MED værdi (data-basis-kontrakten). 0 ville være en falsk
 * saldo: grafen tegner en nullinje, cashflow-startsaldoen tager 0 som
 * «seneste med værdi», og et manglende tal må ikke vises som nul (#786).
 */

/** Ultimo-poster: hører kun til regnskabsårets sidste måned. */
export const BALANCE_NOEGLER: readonly string[] = ["cash", "equity", "equity_total"];

/** 0-baseret månedsindeks for decemberrækken. */
export const ULTIMO_MAANED = 11;

/** Metrics for måned `maanedIdx` (0–11): balanceposter kun i december; alt andet uændret. */
export function metricsForMaaned(metrics: Readonly<Record<string, number>>, maanedIdx: number): Record<string, number> {
  if (maanedIdx === ULTIMO_MAANED) return { ...metrics };
  const ud: Record<string, number> = {};
  for (const [k, v] of Object.entries(metrics)) {
    if (!BALANCE_NOEGLER.includes(k)) ud[k] = v;
  }
  return ud;
}
