/**
 * supabase/functions/_shared/agentSkriveveje.ts
 *
 * Agentens idempotente skriveveje — DELT mellem run-company-agent
 * (live-kørsler) og agent-forslag-afgoer (godkendelse af tør-kørslers
 * forslag, design §7.4). To kopier af samme skrivning er fejlklassen
 * dette modul findes for at forhindre; enhver ændring af en skrivevej
 * sker HER og rammer begge kaldere.
 *
 * Kun det IDEMPOTENTE mål bor her (weekly_focus-upsert på
 * (company_id, week_key)) — det er det godkendelsesvejen må gentage
 * ufarligt. write_session_prep er FJERNET (C3, docs/chat-design.md,
 * besluttet 31/8: funktionen bruges ikke — ti procent af alt
 * chatindhold blev produceret til ingen). Eksisterende session_prep-
 * rækker står som historik. De øvrige skrivetools (milestones,
 * company_actions, chat, notify) er IKKE idempotente og er bevidst
 * ikke udtrukket; afgørelsesfunktionen afviser dem ærligt indtil
 * deres gentagelses-semantik er besluttet.
 */

import { getISOWeekKey } from "./isoUge.ts";

/** update_weekly_focus: upsert af ugens fokus-kort. Uge-nøglen beregnes
    af SKRIVETIDSPUNKTET som ÆGTE ISO-8601 via _shared/isoUge.ts (design
    §7.6; hændelsen 2026-08-25: den tidligere mandags-ankrede lokalformel
    skrev én uge bagud og gjorde hvert kort usynligt) — ved godkendelse
    er det godkendelsens uge. At et eksisterende kort overskrives uden
    forhåndsvisning er §7.5. */
export async function skrivUgensFokus(
  adminClient: any,
  args: { company_id: string; headline?: unknown; summary?: unknown },
  trigger: string,
): Promise<{ ok: true; week_key: string }> {
  const weekKey = getISOWeekKey(new Date());

  const { error } = await adminClient
    .from("weekly_focus")
    .upsert({
      company_id: args.company_id,
      week_key: weekKey,
      status: "active",
      headline: args.headline,
      summary: args.summary,
      triggers_fired: [trigger],
      trigger_data: { trigger },
      actions_generated: 1,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "company_id,week_key" });

  if (error) throw new Error(error.message);
  return { ok: true, week_key: weekKey };
}

