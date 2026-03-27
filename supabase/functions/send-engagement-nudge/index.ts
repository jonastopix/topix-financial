import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const periodKey = `${year}-${month}`;

  const results: string[] = [];

  // Get all active companies (created > 14 days ago)
  const cutoffDate = new Date(now.getTime() - 14 * 86400000).toISOString();
  const { data: companies } = await admin
    .from("companies")
    .select("id, name")
    .lt("created_at", cutoffDate);

  if (!companies?.length) {
    return new Response(JSON.stringify({ skipped: "no eligible companies" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get advisor user_id (first advisor/admin)
  const { data: advisorRole } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", ["advisor", "admin"])
    .limit(1)
    .single();

  const advisorId = advisorRole?.user_id;
  if (!advisorId) {
    return new Response(JSON.stringify({ error: "no advisor found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const company of companies) {
    const companyId = company.id;

    // Check for existing conversation
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!conv) continue;
    const conversationId = conv.id;

    // Member count awareness
    const { data: members } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId);

    const memberCount = members?.length ?? 0;
    if (memberCount === 0) continue;
    const isTeam = memberCount > 1;

    // Dedup: check existing nudges this month
    const nudgeKeyPulse = `nudge:pulse:${companyId}:${periodKey}`;
    const nudgeKeyMilestone = `nudge:milestone:${companyId}:${periodKey}`;

    const { data: existingNudges } = await admin
      .from("messages")
      .select("id, content")
      .eq("conversation_id", conversationId)
      .eq("message_type", "nudge")
      .gte("created_at", `${year}-${month}-01`);

    const nudgedPulse = existingNudges?.some((m: any) =>
      m.content?.includes(nudgeKeyPulse)
    );
    const nudgedMilestone = existingNudges?.some((m: any) =>
      m.content?.includes(nudgeKeyMilestone)
    );

    // ── PULSE NUDGE: after 10th, if no pulse this month ──
    if (dayOfMonth >= 10 && !nudgedPulse) {
      const { data: pulse } = await admin
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId)
        .eq("period_key", periodKey)
        .maybeSingle();

      if (!pulse) {
        const message = isTeam
          ? "Hej! Har I haft en god start på måneden? Vi vil gerne høre hvordan det går — udfyld jeres korte pulse check-in, så vi kan følge med og give jer den bedste sparring. Det tager kun 2 minutter 🙏"
          : "Hej! Har du haft en god start på måneden? Vi vil gerne høre hvordan det går — udfyld dit korte pulse check-in, så vi kan følge med og give dig den bedste sparring. Det tager kun 2 minutter 🙏";

        await admin.from("messages").insert({
          conversation_id: conversationId,
          sender_id: advisorId,
          content: `${message}\n\n<!-- ${nudgeKeyPulse} -->`,
          message_type: "nudge",
          read_at: null,
        });

        await admin
          .from("conversations")
          .update({
            last_message_at: now.toISOString(),
            awaiting_reply_from: "member",
          })
          .eq("id", conversationId);

        results.push(`pulse nudge → ${company.name}`);
      }
    }

    // ── MILESTONE NUDGE: if no active milestones ──
    if (!nudgedMilestone) {
      const userIds = members!.map((m: any) => m.user_id);

      const { data: milestones } = await admin
        .from("milestones")
        .select("id")
        .in("user_id", userIds)
        .eq("status", "active")
        .limit(1);

      if (!milestones?.length) {
        const message = isTeam
          ? "Hej! Vi savner jeres milestones på platformen. Milestones hjælper jer med at holde fokus på de vigtigste mål i forløbet — og hjælper os med at give jer bedre sparring. Har I sat jeres første milestone? Gå til Milestones i menuen 🎯"
          : "Hej! Vi savner dine milestones på platformen. Milestones hjælper dig med at holde fokus på de vigtigste mål i forløbet — og hjælper os med at give dig bedre sparring. Har du sat dit første milestone? Gå til Milestones i menuen 🎯";

        await admin.from("messages").insert({
          conversation_id: conversationId,
          sender_id: advisorId,
          content: `${message}\n\n<!-- ${nudgeKeyMilestone} -->`,
          message_type: "nudge",
          read_at: null,
        });

        await admin
          .from("conversations")
          .update({
            last_message_at: now.toISOString(),
            awaiting_reply_from: "member",
          })
          .eq("id", conversationId);

        results.push(`milestone nudge → ${company.name}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ sent: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
