import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEMO_EMAIL = "demo@theboardroom.dk";
const DEMO_COMPANY_ID = "a0de0000-0000-4000-8000-000000000001";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const demoPassword = Deno.env.get("DEMO_PASSWORD");
  if (!demoPassword) {
    return new Response(JSON.stringify({ ok: false, error: "DEMO_PASSWORD env var not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if user already exists
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users?.find((u: any) => u.email === DEMO_EMAIL);
  if (existing) {
    return new Response(JSON.stringify({ ok: false, error: "already exists", user_id: existing.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create user
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { full_name: "Sofie Lindqvist", company_name: "Nordly ApS" },
  });

  if (createError) {
    return new Response(JSON.stringify({ ok: false, error: createError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
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
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
