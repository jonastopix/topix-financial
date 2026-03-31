import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  // Verify caller is advisor and has access to the conversation
  const { data: conv } = await callerClient
    .from("conversations")
    .select("company_id")
    .eq("id", conversation_id)
    .maybeSingle();

  if (!conv?.company_id) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get company name
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: company } = await adminClient
    .from("companies")
    .select("name")
    .eq("id", conv.company_id)
    .maybeSingle();

  const companyName = company?.name || "din virksomhed";

  // Get company members (founders) to notify
  const { data: members } = await adminClient
    .from("company_members")
    .select("user_id")
    .eq("company_id", conv.company_id)
    .neq("user_id", callerId);

  const memberIds = (members || []).map((m: any) => m.user_id);
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
    deep_link: "/chat",
    reference_type: "message",
    reference_id: message_id || undefined,
    company_id: conv.company_id,
    dedup_key: `chat_reply_${conversation_id}_${message_id || Date.now()}`,
  });

  return new Response(JSON.stringify({ sent: inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
