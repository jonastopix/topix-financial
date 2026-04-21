import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.cron("weekly-company-agent", "0 7 * * 1", async () => {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const { data: companies, error } = await adminClient
    .from("companies")
    .select("id, name, contract_end_date, subscription_status, subscription_current_period_end")
    .eq("status", "active");

  // Filter to only companies with valid membership
  const activeCompanies = (companies ?? []).filter(c => {
    // No end date set = legacy full member, always include
    if (!c.contract_end_date) return true;
    // Active contract
    if (new Date(c.contract_end_date) > new Date(now)) return true;
    // Active self-serve subscription
    if (
      c.subscription_status === "active" &&
      c.subscription_current_period_end &&
      new Date(c.subscription_current_period_end) > new Date(now)
    ) return true;
    return false;
  });

  if (error || !companies?.length) {
    console.error("Weekly agent: failed to fetch companies", error?.message);
    return;
  }

  console.log(`Weekly agent: processing ${activeCompanies.length} companies`);

  for (const company of activeCompanies) {
    const { data: latestFact } = await adminClient
      .from("financial_report_facts")
      .select("period_key, period_label")
      .eq("company_id", company.id)
      .order("period_key", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestFact) {
      console.log(`Weekly agent: skipping ${company.name} — no committed facts`);
      continue;
    }

    // Skip if agent already ran for this company this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const { data: recentConv } = await adminClient
      .from("conversations")
      .select("id")
      .eq("company_id", company.id)
      .maybeSingle();
    if (recentConv) {
      const { count } = await adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", recentConv.id)
        .eq("context_type", "agent")
        .gte("created_at", weekStart.toISOString());
      if ((count ?? 0) > 0) {
        console.log(`Weekly agent: skipping ${company.name} — already ran this week`);
        continue;
      }
    }

    const agentUrl = `${supabaseUrl}/functions/v1/run-company-agent`;
    const resp = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        company_id: company.id,
        trigger: "weekly_cron",
        period_key: latestFact.period_key,
        period_label: latestFact.period_label,
      }),
    });

    const result = resp.ok ? await resp.json() : null;
    console.log(`Weekly agent: ${company.name} → ${result?.ok ? "ok" : "failed"}`);

    await new Promise(r => setTimeout(r, 2000));
  }
});
