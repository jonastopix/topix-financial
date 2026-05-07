import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VERIFIED_FROM_EMAIL = "noreply@boardroom.topix.dk";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Validate caller JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  const callerId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !callerId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { companyId, memberName } = await req.json();

  if (!companyId) {
    return new Response(JSON.stringify({ error: "companyId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller belongs to this company
  const { data: membership } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", callerId)
    .maybeSingle();

  if (!membership) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find the conversation for this company
  const { data: conv } = await admin
    .from("conversations")
    .select("id, assigned_advisor_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!conv) {
    return new Response(JSON.stringify({ error: "no conversation found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency: skip if welcome already sent OR if conversation already has
  // non-system user messages (meaning the company has been active for a while)
  const { data: existingMsgs } = await admin
    .from("messages")
    .select("id, message_type")
    .eq("conversation_id", conv.id)
    .in("message_type", ["welcome", "user"])
    .limit(1);

  if (existingMsgs && existingMsgs.length > 0) {
    return new Response(
      JSON.stringify({ skipped: "welcome already sent or conversation active" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Prefer the assigned advisor on the conversation; fall back to first advisor in system
  let advisorId: string | undefined = conv.assigned_advisor_id ?? undefined;

  if (!advisorId) {
    const { data: advisorRole } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["advisor", "admin"])
      .limit(1)
      .single();

    if (!advisorRole?.user_id) {
      return new Response(JSON.stringify({ error: "no advisor found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    advisorId = advisorRole.user_id;
  }
  const firstName = memberName?.split(" ")[0] || "der";

  // Try to load welcome message template from DB
  const { data: welcomeTpl } = await admin
    .from("email_templates")
    .select("body_html, enabled")
    .eq("name", "Velkomstbesked")
    .maybeSingle();

  // Auto-create if missing so it appears in admin panel
  if (!welcomeTpl) {
    await admin.from("email_templates").insert({
      name: "Velkomstbesked",
      subject: "Velkomstbesked",
      body_html: `Hej {{first_name}}! Velkommen til The Boardroom 🎉 Vi glæder os til at følge din rejse og give dig sparring undervejs. Det bedste du kan gøre nu er at uploade din seneste regnskabsrapport — så har vi et fælles udgangspunkt at arbejde ud fra. Spørg endelig hvis der er noget.`,
      sender_name: "The Boardroom",
      sender_email: VERIFIED_FROM_EMAIL,
      trigger_type: "event",
      trigger_config: { event: "user_onboarded" },
      enabled: false,
    });
  }

  const FALLBACK_WELCOME = `Hej ${firstName}! Velkommen til The Boardroom 🎉 Vi glæder os til at følge din rejse og give dig sparring undervejs. Det bedste du kan gøre nu er at uploade din seneste regnskabsrapport — så har vi et fælles udgangspunkt at arbejde ud fra. Spørg endelig hvis der er noget.`;

  const message = (welcomeTpl?.enabled && welcomeTpl.body_html)
    ? welcomeTpl.body_html.replace(/\{\{first_name\}\}/g, firstName || "dig")
    : FALLBACK_WELCOME;

  const now = new Date().toISOString();

  await admin.from("messages").insert({
    conversation_id: conv.id,
    sender_id: advisorId,
    content: message,
    message_type: "welcome",
    read_at: null,
  });

  await admin
    .from("conversations")
    .update({
      last_message_at: now,
      awaiting_reply_from: "member",
    })
    .eq("id", conv.id);

  return new Response(
    JSON.stringify({ sent: true, to: companyId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
