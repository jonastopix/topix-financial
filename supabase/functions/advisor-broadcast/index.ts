import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // Verify caller is advisor via user_roles (not profiles)
  const { data: roleRow } = await callerClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["advisor", "admin"])
    .maybeSingle();

  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { message, company_ids } = (await req.json()) as {
    message: string;
    company_ids: string[];
  };

  if (!message?.trim() || message.trim().length > 2000) {
    return new Response(JSON.stringify({ error: "Invalid message" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Get target company ids
  let targetIds: string[] = company_ids;
  if (!targetIds || targetIds.length === 0) {
    const { data: companies } = await adminClient.from("companies").select("id");
    targetIds = (companies || []).map((c: { id: string }) => c.id);
  }

  let sent = 0;
  const memberUserIds: string[] = [];

  for (const companyId of targetIds) {
    // Find the company's conversation (any status — don't skip resolved)
    const { data: conv } = await adminClient
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv) continue;

    const { error } = await adminClient.from("messages").insert({
      conversation_id: conv.id,
      sender_id: callerId,
      content: message.trim(),
      message_type: "user",
    });

    if (!error) {
      sent++;
      const { data: members } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId);
      (members || []).forEach((m: { user_id: string }) =>
        memberUserIds.push(m.user_id)
      );
    }
  }

  // Send in-app notification to all reached founders
  if (memberUserIds.length > 0) {
    const dedup = `advisor_broadcast:${callerId}:${Date.now()}`;
    await writeNotificationToMany(adminClient, memberUserIds, {
      type: "advisor_broadcast",
      priority: "important",
      title: "Besked fra din rådgiver",
      body: message.trim().slice(0, 120),
      deep_link: "/chat",
      dedup_key: dedup,
    });
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
