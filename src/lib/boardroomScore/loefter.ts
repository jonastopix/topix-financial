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
 *   2. Er der ledige pladser, lægges HØJST ÉN handling uden regnet gevinst
 *      (gevinst = null: «upload/godkend, så søjlen kan regnes») til BAGEST —
 *      den første i motorens rækkefølge. Én, ikke flere: de peger alle på den
 *      samme næste rapport, og tre ens linjer er støj. Rettet 1/10-2026 (rådets
 *      fund): før kom den kun med, når INGEN handling havde en gevinst > 0 — men
 *      uden opskalering giver en søjle uden data 0 point, så et medlem uden
 *      banktal skulle se «Upload en rapport med banksaldo» (op til 250 point),
 *      også ved siden af en lille regnet disciplin-gevinst.
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
  const ud: Handling[] = medGevinst.slice(0, maks);
  const laaserOp = dom.handlinger.find((h) => h.gevinst === null);
  if (laaserOp && ud.length < maks) ud.push(laaserOp);
  return ud;
}
