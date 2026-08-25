/**
 * supabase/functions/_shared/agentSkriveveje.ts
 *
 * Agentens idempotente skriveveje — DELT mellem run-company-agent
 * (live-kørsler) og agent-forslag-afgoer (godkendelse af tør-kørslers
 * forslag, design §7.4). Koden er flyttet ORDRET fra executeTool i
 * run-company-agent/index.ts (update_weekly_focus :718-743,
 * write_session_prep :745-796) — samme statements, samme returværdier,
 * samme throw-adfærd. To kopier af samme skrivning er fejlklassen dette
 * modul findes for at forhindre; enhver ændring af en skrivevej sker HER
 * og rammer begge kaldere.
 *
 * Kun de to IDEMPOTENTE mål bor her (weekly_focus-upsert på
 * (company_id, week_key); session_prep én række pr. (samtale, periode)) —
 * det er dem godkendelsesvejen må gentage ufarligt. De øvrige skrivetools
 * (milestones, company_actions, chat, notify) er IKKE idempotente og er
 * bevidst ikke udtrukket; afgørelsesfunktionen afviser dem ærligt indtil
 * deres gentagelses-semantik er besluttet.
 */

/** update_weekly_focus: upsert af ugens fokus-kort. Uge-nøglen beregnes
    af SKRIVETIDSPUNKTET (ISO-uge, mandag som anker) — ved godkendelse er
    det godkendelsens uge (design §7.6: et kort skrevet til en forgangen
    uge ville lande et sted medlemmet aldrig ser det). At et eksisterende
    kort overskrives uden forhåndsvisning er §7.5. */
export async function skrivUgensFokus(
  adminClient: any,
  args: { company_id: string; headline?: unknown; summary?: unknown },
  trigger: string,
): Promise<{ ok: true; week_key: string }> {
  const now = new Date();
  const dayNum = now.getUTCDay() || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1 - dayNum));
  const yearStart = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((monday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekKey = `${monday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;

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

/** write_session_prep: ét forberedelses-billede pr. (samtale, periode) —
    eksisterende række overskrives, ellers indsættes. context_meta.source
    forbliver "run-company-agent" uanset kalder: rækkens ophav ER agentens
    forslag, og ingen flade filtrerer på source (kun context_type). */
export async function skrivSessionPrep(
  adminClient: any,
  args: { company_id: string; points?: unknown },
  period_key: string,
): Promise<
  | { ok: true; points_count: number; updated: boolean }
  | { ok: false; reason: string }
> {
  const points = (args.points as string[]).slice(0, 3);
  const now = new Date();

  const { data: conv } = await adminClient
    .from("conversations")
    .select("id, assigned_advisor_id, member_id")
    .eq("company_id", args.company_id)
    .maybeSingle();
  if (!conv) return { ok: false, reason: "no_conversation" };

  // System-besked; founderen filtreres fra i UI'en (CompanyChatPane), saa kun
  // advisoren ser forberedelsen.
  const content = `**Forbered til næste session:**\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
  const contextMeta = { source: "run-company-agent", points, period_key, generated_at: now.toISOString() };

  // Idempotent pr. (virksomhed, periode): EET opdateret forberedelses-billede pr.
  // periode, aldrig en stak. Findes der allerede en session_prep for denne periode,
  // saa overskriv den med nyeste syntese; ellers indsaet. Spejler report-dedup'en
  // i write_chat_message (samme (conversation, context_type, period_key)-noegle).
  const { data: existingPrep } = await adminClient
    .from("messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .eq("context_type", "session_prep")
    .eq("context_meta->>period_key", period_key)
    .limit(1)
    .maybeSingle();

  if (existingPrep) {
    const { error: updErr } = await adminClient
      .from("messages")
      .update({ content, context_meta: contextMeta })
      .eq("id", existingPrep.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, points_count: points.length, updated: true };
  }

  const { error } = await adminClient
    .from("messages")
    .insert({
      conversation_id: conv.id,
      sender_id: conv.member_id,
      content,
      message_type: "system",
      context_type: "session_prep",
      context_meta: contextMeta,
    });

  if (error) throw new Error(error.message);
  return { ok: true, points_count: points.length, updated: false };
}
