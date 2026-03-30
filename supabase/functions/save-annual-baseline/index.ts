import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DANISH_MONTHS = [
  "Januar","Februar","Marts","April","Maj","Juni",
  "Juli","August","September","Oktober","November","December",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: CORS_HEADERS });
    }
    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anonKey);
    const { data: claimsData, error: claimsErr } = await authClient.auth.getUser(token);
    if (claimsErr || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS_HEADERS });
    }
    const userId = claimsData.user.id;

    // ── Body ──
    const body = await req.json();
    const { year, revenue, gross_profit, payroll, ebt, cash, company_id } = body;

    if (!company_id || !year) {
      return new Response(JSON.stringify({ error: "Missing company_id or year" }), { status: 400, headers: CORS_HEADERS });
    }
    if (!revenue && !ebt) {
      return new Response(JSON.stringify({ error: "At least revenue or ebt required" }), { status: 400, headers: CORS_HEADERS });
    }

    const adminClient = createClient(url, serviceKey);

    // ── Verify user belongs to company ──
    const { data: membership } = await adminClient
      .from("company_members")
      .select("id")
      .eq("user_id", userId)
      .eq("company_id", company_id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member of this company" }), { status: 403, headers: CORS_HEADERS });
    }

    // ── Create sentinel report row if not exists ──
    const sentinelId = "00000000-0000-0000-0000-000000000001";
    const { data: existingSentinel } = await adminClient
      .from("financial_reports")
      .select("id")
      .eq("id", sentinelId)
      .maybeSingle();

    if (!existingSentinel) {
      await adminClient.from("financial_reports").insert({
        id: sentinelId,
        company_id,
        user_id: userId,
        file_name: "_annual_baseline_sentinel",
        file_path: "_sentinel",
        report_type: "annual_baseline",
        status: "processed",
        extraction_contract_version: "baseline_v1",
      });
    }

    // ── Build 12 monthly rows ──
    const rev = Number(revenue) || 0;
    const gp = gross_profit != null && gross_profit !== "" ? Number(gross_profit) : null;
    const pay = payroll != null && payroll !== "" ? Number(payroll) : null;
    const ebtVal = Number(ebt) || 0;
    const cashVal = cash != null && cash !== "" ? Number(cash) : null;

    const rows = Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, "0");
      const periodKey = `${year}-${monthNum}`;
      const periodLabel = `${DANISH_MONTHS[i]} ${year}`;

      const metrics: Record<string, number> = { revenue: rev / 12, ebt: ebtVal / 12 };
      if (gp != null) metrics.gross_profit = gp / 12;
      if (pay != null) metrics.payroll = pay / 12;
      if (cashVal != null) metrics.cash = cashVal;

      return {
        company_id,
        period_key: periodKey,
        period_label: periodLabel,
        source_report_id: sentinelId,
        source_type: "manual",
        metrics,
        committed_by: userId,
        committed_at: new Date().toISOString(),
      };
    });

    // ── Delete existing baseline facts for this year, then insert ──
    const periodPrefix = `${year}-`;
    await adminClient
      .from("financial_report_facts")
      .delete()
      .eq("company_id", company_id)
      .eq("source_type", "manual_baseline")
      .like("period_key", `${periodPrefix}%`);

    const { error: insertErr } = await adminClient
      .from("financial_report_facts")
      .insert(rows);

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, months: 12 }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
