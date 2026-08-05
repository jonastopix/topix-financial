import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  let body: { conversation_id?: string; message_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { conversation_id, message_id } = body;
  if (!conversation_id) {
    return new Response(JSON.stringify({ error: "Missing conversation_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  let companyName = "din virksomhed";
  let memberIds: string[] = [];

  {
    const { data: conv } = await adminClient
      .from("conversations")
      .select("company_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (conv?.company_id) {
      const { data: company } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", conv.company_id)
        .maybeSingle();
      companyName = company?.name || "din virksomhed";

      const { data: members } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", conv.company_id)
        .neq("user_id", callerId);
      memberIds = (members || []).map((m: any) => m.user_id);
    }
  }

  if (memberIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inserted = await writeNotificationToMany(adminClient, memberIds, {
    type: "chat_reply",
    priority: "important",
    title: "Ny besked fra din rådgiver",
    body: `Din rådgiver har svaret i chatten for ${companyName}`,
    deep_link: `/chat?conversationId=${conversation_id}`,
    reference_type: "message",
    reference_id: message_id || undefined,
    dedup_key: `chat_reply_${conversation_id}_${message_id || Date.now()}`,
  });

  return new Response(JSON.stringify({ sent: inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
