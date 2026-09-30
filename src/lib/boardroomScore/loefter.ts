/**
 * src/lib/boardroomScore/loefter.ts — «Hvad løfter mit tal»: de 1–3
 * handlinger, der giver flest point LIGE NU (docs/boardroom-score.md §3,
 * fladen §7). Ren dom over motorens egne `handlinger` — fladen hårdkoder
 * ingen handling og regner ingen gevinst selv.
 *
 * REGLEN:
 *   1. Kun handlinger med en REGNET gevinst > 0 (samlet score, 0–1000-skalaen)
 *      kommer med, størst først; ved lige gevinst i motorens rækkefølge
 *      disciplin → likviditet → indtjening → vækst (adfærd før tal —
 *      samme orden som vaelgLoefterMest). Højst `maks` (standard 3).
 *   2. Har INGEN handling en gevinst > 0, vises den FØRSTE handling uden
 *      regnet gevinst (gevinst = null: «upload/godkend, så søjlen kan
 *      regnes») — én, ikke flere: de peger alle på den samme næste rapport,
 *      og tre ens linjer er støj. Design §3: «vælges kun, når ingen søjle
 *      med data har en gevinst > 0».
 *   3. Ellers en tom liste (fladen siger så ingenting frem for noget opdigtet).
 *
 * Første element er ALTID det samme som motorens `loefterMest` (prøvet i
 * loefter.test.ts) — kortet og motoren kan ikke være uenige om «mest».
 */
import type { Handling, ScoreDom, SoejleNavn } from "./typer";

export const LOEFTER_MAKS = 3;

const ORDEN: readonly SoejleNavn[] = ["disciplin", "likviditet", "indtjening", "vaekst"];

export function loefterMitTal(dom: Pick<ScoreDom, "handlinger">, maks: number = LOEFTER_MAKS): Handling[] {
  if (maks <= 0) return [];
  const orden = (h: Handling) => ORDEN.indexOf(h.soejle);
  const medGevinst = dom.handlinger
    .filter((h): h is Handling & { gevinst: number } => typeof h.gevinst === "number" && Number.isFinite(h.gevinst) && h.gevinst > 0)
    .sort((a, b) => b.gevinst - a.gevinst || orden(a) - orden(b));
  if (medGevinst.length > 0) return medGevinst.slice(0, maks);
  const laaserOp = dom.handlinger.find((h) => h.gevinst === null);
  return laaserOp ? [laaserOp] : [];
}
