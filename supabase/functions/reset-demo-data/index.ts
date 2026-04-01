import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEMO_EMAIL = "demo@theboardroom.dk";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Find demo user
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const demoUser = users.find((u: any) => u.email === DEMO_EMAIL);
  if (!demoUser) return new Response(JSON.stringify({ error: "Demo user not found" }), { status: 404 });

  // Find demo company
  const { data: membership } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", demoUser.id)
    .single();
  if (!membership) return new Response(JSON.stringify({ error: "No company" }), { status: 404 });

  const companyId = membership.company_id;

  // Reset: delete user-generated content, keep seed facts
  await Promise.all([
    supabase.from("pulse_checkins").delete().eq("company_id", companyId),
    supabase.from("kpi_targets").delete().eq("company_id", companyId),
    supabase.from("kpi_chart_comments").delete().eq("company_id", companyId),
    supabase.from("advisor_session_notes").delete().eq("company_id", companyId),
    supabase.from("feedback").delete().eq("company_id", companyId),
  ]);

  // Re-seed pulse check-in for current month
  const now = new Date();
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await supabase.from("pulse_checkins").insert({
    company_id: companyId,
    user_id: demoUser.id,
    period_key: periodKey,
    went_well: "Vi landede tre nye enterprise-kunder i denne måned og vores churn er nede på 1,2%.",
    biggest_challenge: "Vi har svært ved at skalere vores support-organisation i takt med væksten.",
    help_needed: "Har brug for sparring om, hvornår det giver mening at ansætte en Customer Success Manager.",
  });

  return new Response(JSON.stringify({ ok: true, reset_at: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json" },
  });
});
