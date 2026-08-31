/**
 * supabase/functions/_shared/agentToerkoersel.ts
 *
 * Tør-kørslens snit (docs/agent-forslag-design.md §4.1): hvilke af
 * run-company-agents tools er SKRIVE-tools, og hvad får modellen tilbage
 * når et skrivekald opsnappes som forslag i stedet for at blive udført.
 *
 * Nul imports, så filen kan læses af både Deno og Vitest
 * (opgaveUdloeb-mønstret). Driftværnet er
 * src/lib/__tests__/agentToerkoersel.test.ts: hvert tool i
 * run-company-agent skal være enten et get_*-læsetool, 'finish' eller
 * medlem af SKRIVE_TOOLS — udvides tool-poolen, skal sættet her og
 * testen med, ellers siver et nyt skrivetool udenom tør-kørslen.
 */

export const SKRIVE_TOOLS: ReadonlySet<string> = new Set([
  "write_chat_message",
  "update_weekly_focus",
  "write_company_action",
  "notify_advisor",
  "create_milestone",
  "update_milestone_progress",
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
    forbruger id'er fra skriveresultater (update_milestone_progress tager
    sit id fra get_milestones, ikke fra create_milestone). */
export function toerResultat(toolName: string): ToerResultat {
  return {
    ok: true,
    dry_run: true,
    note: `'${toolName}' er registreret som forslag til rådgiveren — ikke udført`,
  };
}
