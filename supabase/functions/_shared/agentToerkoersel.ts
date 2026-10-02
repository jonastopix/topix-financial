/**
 * supabase/functions/_shared/agentToerkoersel.ts
 *
 * Tør-kørslens snit (docs/agent-forslag-design.md §4.1): hvilke af
 * run-company-agents tools er SKRIVE-tools, og hvad får modellen tilbage
 * når et skrivekald opsnappes som forslag i stedet for at blive udført.
 *
 * Én import (forslagEngine.ts, selv uden imports), så filen kan læses af
 * både Deno og Vitest (opgaveUdloeb-mønstret). Driftværnet er
 * src/lib/__tests__/agentToerkoersel.test.ts: hvert tool i
 * run-company-agent skal være enten et get_*-læsetool, 'finish' eller
 * medlem af SKRIVE_TOOLS — udvides tool-poolen, skal sættet her og
 * testen med, ellers siver et nyt skrivetool udenom tør-kørslen.
 */

import { UNDERSTOETTEDE_SKRIVEVEJE } from "./forslagEngine.ts";

export const SKRIVE_TOOLS: ReadonlySet<string> = new Set([
  "write_chat_message",
  "update_weekly_focus",
  "write_company_action",
  "notify_advisor",
  // create_milestone og update_milestone_progress er ude (fase 2, 16/9):
  // målene sættes af rådgiveren (maal-skriv), fremdriften regnes af opgave-luk.
]);

export interface ToerResultat {
  ok: true;
  dry_run: true;
  note: string;
}

/** Resultatet modellen får for et opsnappet skrivekald. ok:true + neutral
    note: modellen skal fortsætte sin plan — hverken prøve igen (det gør den
    ved {error}-formen) eller vælge et andet tool (det gør den ved
    blocked-formen). Ingen fabrikerede id'er: intet andet tool i poolen
    forbruger id'er fra skriveresultater. */
export function toerResultat(toolName: string): ToerResultat {
  return {
    ok: true,
    dry_run: true,
    note: `'${toolName}' er registreret som forslag til rådgiveren — ikke udført`,
  };
}

/**
 * TØR-KØRSLEN FORESLÅR KUN DET, DER KAN AFGØRES (besluttet 30/9-2026,
 * docs/agent-forslag-design.md §9). Målt i prod 30/9 23:15: 27 forslag på
 * to måneder; 6 af 6 opgaveforslag (write_company_action) fra tør-kørsler
 * kunne aldrig godkendes — motoren (forslagEngine.UNDERSTOETTEDE_SKRIVEVEJE)
 * kan kun udføre update_weekly_focus — og stod som «kan kun forkastes».
 *
 * Reglen: i tør-tilstand er hvert SKRIVE_TOOL, der IKKE er en godkendbar
 * skrivevej, blokeret — det annonceres ikke for modellen, og kalder den det
 * alligevel, afvises kaldet som blokeret (samme vej som POOL_BLOCKLIST), så
 * det aldrig bliver en agent_proposals-række. Listen over det godkendbare
 * står ÉT sted: forslagEngine.ts. Udvides den (fx når opgavernes
 * gentagelses-semantik er besluttet), følger tør-kørslen med af sig selv.
 *
 * Live-kørsler er URØRTE: dér udføres skrivningen, og ingen afgørelse
 * venter.
 */
export function ikkeGodkendbareSkriveTools(): string[] {
  return [...SKRIVE_TOOLS].filter((t) => !UNDERSTOETTEDE_SKRIVEVEJE.has(t)).sort();
}

/** Samlet blokering for en kørsel: triggerens POOL_BLOCKLIST-post, plus —
    kun i tør-tilstand — de skrivetools, en rådgiver ikke kan godkende.
    Bruges BÅDE til annonceringen (tools-filtret) og til eksekveringen
    (afvisningen), så de to aldrig kan være uenige. */
export function blokeredeVaerktoejer(triggerBlokeret: readonly string[], dryRun: boolean): string[] {
  const s = new Set(triggerBlokeret);
  if (dryRun) for (const t of ikkeGodkendbareSkriveTools()) s.add(t);
  return [...s].sort();
}

/** Navnene på de tools, modellen får annonceret — i poolens rækkefølge.
    Står i tør-kørslens svar som `annoncerede_vaerktoejer` (beviset for
    udrulningen: kun den nye kode har feltet). */
export function annonceredeVaerktoejer(alle: readonly string[], blokerede: readonly string[]): string[] {
  const b = new Set(blokerede);
  return alle.filter((n) => !b.has(n));
}

/** Tillæg til systemprompten i tør-tilstand: SYSTEM_PROMPT beskriver den
    fulde arbejdsgang (også write_company_action), men i tør-tilstand kan
    modellen kun foreslå det godkendbare. Uden tillægget ville den lede
    efter et tool, der ikke er der. */
export function toerPromptTillaeg(annoncerede: readonly string[]): string {
  const skriv = annoncerede.filter((n) => SKRIVE_TOOLS.has(n));
  const ikke = ikkeGodkendbareSkriveTools();
  return `TØR KØRSEL — FORSLAG TIL RÅDGIVEREN: dine skrivninger udføres ikke; de bliver forslag, som en rådgiver godkender eller forkaster. Du kan KUN foreslå med: ${skriv.length ? skriv.join(", ") : "(ingen skrivetools)"}. Disse findes ikke i denne kørsel, selv om arbejdsgangen nævner dem: ${ikke.join(", ")}. Ser du et klart næste skridt, så lad det stå i ugens fokus.`;
}
