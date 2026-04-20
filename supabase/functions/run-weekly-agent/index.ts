import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.cron("weekly-company-agent", "0 7 * * 1", async () => {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companies, error } = await adminClient
    .from("companies")
    .select("id, name")
    .eq("status", "active");

  if (error || !companies?.length) {
    console.error("Weekly agent: failed to fetch companies", error?.message);
    return;
  }

  console.log(`Weekly agent: processing ${companies.length} companies`);

  for (const company of companies) {
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
