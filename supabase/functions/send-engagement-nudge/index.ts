/**
 * send-engagement-nudge
 * =====================
 * Weekly nudge: sends in-app chat messages from an advisor to passive members.
 *
 * Auth: Bucket B (service-role only — called by pg_cron).
 *
 * Runs every Monday 08:00 UTC.
 * - PULSE nudge: after the 10th, if no pulse check-in this month
 * - MILESTONE nudge: if company has no active milestones (once per month)
 * - Rapport nudge is intentionally OMITTED (handled by send-report-reminder)
 *
 * Dedup: uses context_meta { nudge_type, nudge_period } on the messages table.
 * Messages are inserted with message_type="user" so they appear as real advisor
 * messages and count toward unread badges.
 */

import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth gate: service role only ──
  const auth = authenticateServiceRole(req);
  if (auth instanceof Response) return auth;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const dayOfMonth = now.getDate();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const periodKey = `${year}-${month}`;
    const monthStart = `${year}-${month}-01`;

    const results: string[] = [];

    // ── Get all active companies (created > 14 days ago) ──
    const cutoffDate = new Date(now.getTime() - 14 * 86400000).toISOString();
    const { data: companies, error: compErr } = await admin
      .from("companies")
      .select("id, name")
      .eq("status", "active")
      .lt("created_at", cutoffDate);

    if (compErr) throw compErr;
    if (!companies?.length) {
      return new Response(
        JSON.stringify({ skipped: "no eligible companies", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Get first advisor user_id for sending ──
    const { data: advisorRole } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "advisor")
      .limit(1)
      .single();

    const advisorId = advisorRole?.user_id;
    if (!advisorId) {
      return new Response(
        JSON.stringify({ error: "no advisor found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    for (const company of companies) {
      const companyId = company.id;

      // ── Find existing conversation for this company ──
      const { data: conv } = await admin
        .from("conversations")
        .select("id")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!conv) continue;
      const conversationId = conv.id;

      // ── Fetch existing nudge messages this month (dedup via context_meta) ──
      const { data: existingNudges } = await admin
        .from("messages")
        .select("id, context_meta")
        .eq("conversation_id", conversationId)
        .not("context_meta", "is", null)
        .gte("created_at", monthStart);

      const hasNudge = (nudgeType: string) =>
        existingNudges?.some((m: any) => {
          const meta = m.context_meta;
          return meta?.nudge_type === nudgeType && meta?.nudge_period === periodKey;
        }) ?? false;

      // ══════════════════════════════════════════════
      // PULSE NUDGE — after 10th, if no pulse this month
      // ══════════════════════════════════════════════
      if (dayOfMonth >= 10 && !hasNudge("pulse")) {
        const { data: pulse } = await admin
          .from("pulse_checkins")
          .select("id")
          .eq("company_id", companyId)
          .eq("period_key", periodKey)
          .maybeSingle();

        if (!pulse) {
          const content =
            "Hej! Har I haft en god start på måneden? Vi vil gerne høre hvordan det går " +
            "— udfyld jeres korte pulse check-in, så vi kan følge med og give jer den " +
            "bedste sparring. Det tager kun 2 minutter 🙏";

          const { error: insertErr } = await admin.from("messages").insert({
            conversation_id: conversationId,
            sender_id: advisorId,
            content,
            message_type: "user",
            context_meta: { nudge_type: "pulse", nudge_period: periodKey },
            read_at: null,
          });

          if (!insertErr) {
            await admin
              .from("conversations")
              .update({
                last_message_at: now.toISOString(),
                last_advisor_reply_at: now.toISOString(),
                awaiting_reply_from: "company",
              })
              .eq("id", conversationId);

            results.push(`pulse → ${company.name}`);
          } else {
            console.error(`[pulse] Insert error for ${company.name}:`, insertErr);
          }
        }
      }

      // ══════════════════════════════════════════════
      // MILESTONE NUDGE — if no active milestones at all
      // ══════════════════════════════════════════════
      if (!hasNudge("milestone")) {
        const { data: members } = await admin
          .from("company_members")
          .select("user_id")
          .eq("company_id", companyId);

        if (members?.length) {
          const userIds = members.map((m: any) => m.user_id);

          const { data: milestones } = await admin
            .from("milestones")
            .select("id")
            .in("user_id", userIds)
            .eq("status", "active")
            .limit(1);

          if (!milestones?.length) {
            const content =
              "Hej! Vi savner jeres milestones på platformen. Milestones hjælper jer " +
              "med at holde fokus på de vigtigste mål i forløbet — og hjælper os med " +
              "at give jer bedre sparring. Har I sat jeres første milestone? " +
              "Gå til Milestones i menuen 🎯";

            const { error: insertErr } = await admin.from("messages").insert({
              conversation_id: conversationId,
              sender_id: advisorId,
              content,
              message_type: "user",
              context_meta: { nudge_type: "milestone", nudge_period: periodKey },
              read_at: null,
            });

            if (!insertErr) {
              await admin
                .from("conversations")
                .update({
                  last_message_at: now.toISOString(),
                  last_advisor_reply_at: now.toISOString(),
                  awaiting_reply_from: "company",
                })
                .eq("id", conversationId);

              results.push(`milestone → ${company.name}`);
            } else {
              console.error(`[milestone] Insert error for ${company.name}:`, insertErr);
            }
          }
        }
      }
    }

    const summary = { sent: results.length, results, period: periodKey };
    console.log("[send-engagement-nudge] Summary:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[send-engagement-nudge] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
