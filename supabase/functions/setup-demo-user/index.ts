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
  const demoPassword = Deno.env.get("DEMO_PASSWORD") || "DemoBoard2026!";

  // Find or create user
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users?.find((u: any) => u.email === DEMO_EMAIL);

  let finalUserId: string;
  if (existing) {
    finalUserId = existing.id;
  } else {
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

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Morten Larsen",
        company_name: "The Boardroom ApS",
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      },
    });

    if (createError || !createData?.user?.id) {
      return new Response(JSON.stringify({ ok: false, error: createError?.message ?? "Failed to create user" }), {
        status: 500, headers: jsonHeaders,
      });
    }
    finalUserId = createData.user.id;
  }

  // Always run linking — idempotent
  await supabase.from("company_members").upsert(
    { company_id: DEMO_COMPANY_ID, user_id: finalUserId, role: "owner" },
    { onConflict: "company_id,user_id" }
  );
  await supabase.from("profiles").upsert(
    { user_id: finalUserId, full_name: "Morten Larsen", company_name: "The Boardroom ApS", onboarded_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  await Promise.all([
    supabase.from("financial_report_facts").update({ committed_by: finalUserId }).eq("company_id", DEMO_COMPANY_ID).is("committed_by", null),
    supabase.from("milestones").update({ user_id: finalUserId }).eq("company_id", DEMO_COMPANY_ID).is("user_id", null),
    supabase.from("kpi_targets").update({ user_id: finalUserId }).eq("company_id", DEMO_COMPANY_ID).is("user_id", null),
    supabase.from("pulse_checkins").update({ user_id: finalUserId }).eq("company_id", DEMO_COMPANY_ID).is("user_id", null),
  ]);

  // Remove problematic seed report (has null normalized_data, causes crash)
  await supabase.from("financial_reports")
    .delete()
    .eq("company_id", DEMO_COMPANY_ID)
    .eq("file_path", "demo/seed.csv");

  // Seed financial_report_facts if missing — need a source_report_id
  const { data: existingFacts } = await supabase
    .from("financial_report_facts")
    .select("period_key")
    .eq("company_id", DEMO_COMPANY_ID);

  if (!existingFacts || existingFacts.length === 0) {
    // Create a placeholder report to satisfy FK
    const { data: placeholderReport } = await supabase
      .from("financial_reports")
      .insert({
        company_id: DEMO_COMPANY_ID,
        user_id: finalUserId,
        file_name: "demo-seed-data.json",
        file_path: "demo/seed-placeholder",
        report_type: "resultatopgørelse",
        status: "processed",
      })
      .select("id")
      .single();

    const sourceReportId = placeholderReport?.id;
    if (sourceReportId) {
      const seedFacts = [
        { period_key: "2025-01", period_label: "Januar 2025", metrics: {"revenue":182000,"gross_profit":167440,"payroll":85000,"sales_costs":29120,"facility_costs":12000,"admin_costs":28000,"ebitda":13320,"cash":85000,"assets_total":420000,"equity_total":185000} },
        { period_key: "2025-02", period_label: "Februar 2025", metrics: {"revenue":195000,"gross_profit":179400,"payroll":85000,"sales_costs":31200,"facility_costs":12000,"admin_costs":28000,"ebitda":23200,"cash":72000,"assets_total":435000,"equity_total":208000} },
        { period_key: "2025-03", period_label: "Marts 2025", metrics: {"revenue":210000,"gross_profit":193200,"payroll":92000,"sales_costs":33600,"facility_costs":12000,"admin_costs":31000,"ebitda":24600,"cash":95000,"assets_total":458000,"equity_total":232000} },
        { period_key: "2025-04", period_label: "April 2025", metrics: {"revenue":198000,"gross_profit":182160,"payroll":92000,"sales_costs":31680,"facility_costs":12000,"admin_costs":29000,"ebitda":17480,"cash":88000,"assets_total":445000,"equity_total":249000} },
        { period_key: "2025-05", period_label: "Maj 2025", metrics: {"revenue":225000,"gross_profit":207000,"payroll":92000,"sales_costs":36000,"facility_costs":12000,"admin_costs":31000,"ebitda":36000,"cash":120000,"assets_total":490000,"equity_total":285000} },
        { period_key: "2025-06", period_label: "Juni 2025", metrics: {"revenue":248000,"gross_profit":228160,"payroll":105000,"sales_costs":39680,"facility_costs":12000,"admin_costs":33000,"ebitda":38480,"cash":145000,"assets_total":520000,"equity_total":323000} },
        { period_key: "2025-07", period_label: "Juli 2025", metrics: {"revenue":232000,"gross_profit":213440,"payroll":105000,"sales_costs":37120,"facility_costs":12000,"admin_costs":30000,"ebitda":29320,"cash":132000,"assets_total":498000,"equity_total":352000} },
        { period_key: "2025-08", period_label: "August 2025", metrics: {"revenue":267000,"gross_profit":245640,"payroll":115000,"sales_costs":42720,"facility_costs":12000,"admin_costs":32000,"ebitda":43920,"cash":168000,"assets_total":545000,"equity_total":396000} },
        { period_key: "2025-09", period_label: "September 2025", metrics: {"revenue":285000,"gross_profit":262200,"payroll":115000,"sales_costs":45600,"facility_costs":12000,"admin_costs":34000,"ebitda":55600,"cash":195000,"assets_total":578000,"equity_total":451000} },
        { period_key: "2025-10", period_label: "Oktober 2025", metrics: {"revenue":310000,"gross_profit":285200,"payroll":130000,"sales_costs":49600,"facility_costs":12000,"admin_costs":35000,"ebitda":58600,"cash":220000,"assets_total":615000,"equity_total":509000} },
        { period_key: "2025-11", period_label: "November 2025", metrics: {"revenue":298000,"gross_profit":274160,"payroll":130000,"sales_costs":47680,"facility_costs":12000,"admin_costs":36000,"ebitda":48480,"cash":205000,"assets_total":598000,"equity_total":557000} },
        { period_key: "2025-12", period_label: "December 2025", metrics: {"revenue":342000,"gross_profit":314640,"payroll":140000,"sales_costs":54720,"facility_costs":12000,"admin_costs":38000,"ebitda":69920,"cash":248000,"assets_total":665000,"equity_total":627000} },
      ].map((f) => ({
        ...f,
        company_id: DEMO_COMPANY_ID,
        source_report_id: sourceReportId,
        source_type: "canonical",
        committed_by: finalUserId,
      }));

      await supabase.from("financial_report_facts").insert(seedFacts);
    }
  }

  return new Response(JSON.stringify({ ok: true, user_id: finalUserId, was_existing: !!existing }), {
    status: 200, headers: jsonHeaders,
  });
});
