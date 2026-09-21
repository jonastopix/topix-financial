/**
 * blevMedlem — spejl af ÉN funktion fra src/lib/ansoegninger/ansoegningVisning.ts
 * (udkast webinar-deling 21/9-2026). «Blev medlem» er husets dom: underskrevet OG
 * virksomheden har en slutdato (sat af stripe-webhook ved BETALING). Serverens
 * webinar-dashboard (_shared/webinarDashboard.ts) skal dømme med den samme, og
 * ansoegningVisning.ts kan ikke køre i Deno (den importerer fladens ting). Derfor
 * spejles funktionen ALENE her, ordret; pariteten låses af
 * src/lib/__tests__/webinarDashboard.paritet.test.ts (funktionsteksten er ens).
 * Kun typen Trin importeres (ansoegningTrin.ts, selv et spejl).
 */
import type { Trin } from "./ansoegningTrin.ts";

export function blevMedlem(a: { trin: Trin; virksomhed_slutdato?: string | null }): boolean {
  return a.trin === "underskrevet" && !!a.virksomhed_slutdato;
}
