import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEMO_EMAIL = "demo@theboardroom.dk";
const DEMO_COMPANY_ID = "a0de0000-0000-4000-8000-000000000001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const authClient = createClient(url, anonKey);
  const { data: claimsData } = await authClient.auth.getClaims(token);
  const callerId = claimsData?.claims?.sub as string | undefined;
  if (!callerId) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // Check admin role
  const adminClient = createClient(url, serviceKey);
  const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", callerId);
  const isAdmin = roleData?.some((r: any) => r.role === "admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ ok: false, error: "Admin role required" }), {
      status: 403, headers: jsonHeaders,
    });
  }

  const supabase = adminClient;
  const demoPassword = Deno.env.get("DEMO_PASSWORD");
  if (!demoPassword) {
    return new Response(JSON.stringify({ ok: false, error: "DEMO_PASSWORD env var not set" }), {
      status: 500, headers: jsonHeaders,
    });
  }

  // Check if user already exists
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users?.find((u: any) => u.email === DEMO_EMAIL);
  if (existing) {
    return new Response(JSON.stringify({ ok: false, error: "already exists", user_id: existing.id }), {
      status: 200, headers: jsonHeaders,
    });
  }

  // Insert a dummy invitation so the handle_new_user trigger doesn't block signup
  const { data: inviteData } = await supabase
    .from("company_invitations")
    .insert({
      email: DEMO_EMAIL,
      company_id: DEMO_COMPANY_ID,
      invited_by: callerId,
      status: "pending",
    })
    .select("token")
    .single();

  const inviteToken = inviteData?.token;

  // Create user with invite_token in metadata so handle_new_user finds the invitation
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: demoPassword,
    email_confirm: true,
    user_metadata: {
      full_name: "Sofie Lindqvist",
      company_name: "Nordly ApS",
      ...(inviteToken ? { invite_token: inviteToken } : {}),
    },
  });

  if (createError) {
    return new Response(JSON.stringify({ ok: false, error: createError.message }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const userId = createData.user.id;

  // Insert company_members
  await supabase.from("company_members").upsert({
    company_id: DEMO_COMPANY_ID,
    user_id: userId,
    role: "owner",
  }, { onConflict: "company_id,user_id" });

  // Insert profile
  await supabase.from("profiles").upsert({
    user_id: userId,
    full_name: "Sofie Lindqvist",
    company_name: "Nordly ApS",
    onboarded_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // Update orphaned rows that reference this company but have null user_id/committed_by
  await Promise.all([
    supabase
      .from("financial_report_facts")
      .update({ committed_by: userId })
      .eq("company_id", DEMO_COMPANY_ID)
      .is("committed_by", null),
    supabase
      .from("milestones")
      .update({ user_id: userId })
      .eq("company_id", DEMO_COMPANY_ID)
      .is("user_id", null),
    supabase
      .from("kpi_targets")
      .update({ user_id: userId })
      .eq("company_id", DEMO_COMPANY_ID)
      .is("user_id", null),
    supabase
      .from("weekly_focus")
      .update({ user_id: userId })
      .eq("company_id", DEMO_COMPANY_ID)
      .is("user_id", null),
    supabase
      .from("pulse_checkins")
      .update({ user_id: userId })
      .eq("company_id", DEMO_COMPANY_ID)
      .is("user_id", null),
  ]);

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    status: 200, headers: jsonHeaders,
  });
});
