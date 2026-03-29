import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ISO week key: Monday-based, format "YYYY-WNN"
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Delay helper for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

  // Auth gate: service role or authenticated admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = token === serviceKey;

  let isAdminUser = false;
  if (!isServiceRole && token.length > 0) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData } = await authClient.auth.getUser(token);
    const callerId = (claimsData as any)?.user?.id as string | undefined;
    if (callerId) {
      const { data: roleCheck } = await createClient(supabaseUrl, serviceKey)
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .in("role", ["admin"])
        .limit(1);
      isAdminUser = (roleCheck && roleCheck.length > 0);
    }
  }

  if (!isServiceRole && !isAdminUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Allow single company_id override for testing
  let body: any = {};
  try { body = await req.json(); } catch {}
  const singleCompanyId = body?.company_id ?? null;

  try {
    // Fetch companies to process
    let query = admin
      .from("companies")
      .select("id, name, industry_code, industry_label")
      .eq("weekly_focus_enabled", true);
    if (singleCompanyId) query = query.eq("id", singleCompanyId);
    const { data: companies, error: compErr } = await query;
    if (compErr) throw compErr;

    const weekKey = getISOWeekKey(new Date());
    const results = { processed: 0, skipped: 0, errors: 0 };

    for (const company of (companies || [])) {
      // Rate limiting: 2s between companies
      if (results.processed + results.skipped + results.errors > 0) await delay(2000);

      try {
        await processCompany(admin, company, weekKey, lovableApiKey, supabaseUrl, serviceKey);
        results.processed++;
      } catch (err) {
        console.error(`[weekly-focus] Error for ${company.id}:`, err);
        results.errors++;
      }
    }

    return new Response(JSON.stringify({ ok: true, weekKey, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[weekly-focus] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processCompany(
  admin: any,
  company: { id: string; name: string; industry_code: string | null; industry_label: string | null },
  weekKey: string,
  lovableApiKey: string,
  supabaseUrl: string,
  serviceKey: string
) {
  console.log(`[weekly-focus] Processing ${company.name} (${company.id}) week ${weekKey}`);

  // Skip if already generated this week
  const { data: existing } = await admin
    .from("weekly_focus")
    .select("id, status")
    .eq("company_id", company.id)
    .eq("week_key", weekKey)
    .maybeSingle();
  if (existing) {
    console.log(`[weekly-focus] Already generated for ${company.id} week ${weekKey}, skipping`);
    return;
  }

  // ── STEP 1: MINIMUM DATA CHECK ────────────────────────────────────
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentFacts } = await admin
    .from("financial_report_facts")
    .select("id, period_key, metrics, committed_at")
    .eq("company_id", company.id)
    .gte("committed_at", ninetyDaysAgo)
    .order("committed_at", { ascending: false })
    .limit(6);

  const { data: activeMilestones } = await admin
    .from("milestones")
    .select("id")
    .eq("company_id", company.id)
    .lt("progress", 100)
    .limit(1);

  const { data: handouts } = await admin
    .from("handouts")
    .select("id")
    .eq("company_id", company.id)
    .limit(1);

  const hasRecentReport = (recentFacts || []).length > 0;
  const hasMilestone = (activeMilestones || []).length > 0;
  const hasHandout = (handouts || []).length > 0;

  if (!hasRecentReport || !hasMilestone || !hasHandout) {
    await admin.from("weekly_focus").upsert({
      company_id: company.id,
      week_key: weekKey,
      status: "no_data",
      triggers_fired: [],
      trigger_data: {},
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "company_id,week_key" });
    return;
  }

  const latestFact = recentFacts![0];
  const metrics: any = latestFact.metrics || {};
  const dataFreshnessDays = Math.floor(
    (now.getTime() - new Date(latestFact.committed_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // ── STEP 2: TRIGGER EVALUATION ────────────────────────────────────
  const triggers: string[] = [];
  const triggerData: Record<string, any> = {};

  // T1: REPORT_UPLOADED — new report committed since last week
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentReport = (recentFacts || []).find(f => f.committed_at >= oneWeekAgo);
  if (recentReport) {
    triggers.push("REPORT_UPLOADED");
    triggerData.REPORT_UPLOADED = { period_key: recentReport.period_key, committed_at: recentReport.committed_at };
  }

  // T2: BUDGET_DEVIATION — revenue or EBITDA >15% from budget
  const revenue = metrics.revenue ?? null;
  const ebitda = metrics.ebitda ?? null;
  if (revenue !== null && latestFact.period_key) {
    const periodParts = latestFact.period_key.split("-");
    const periodYear = parseInt(periodParts[0]);
    const periodMonth = parseInt(periodParts[1]) - 1;
    const { data: budgetRows } = await admin
      .from("budget_targets")
      .select("category, budget_amount")
      .eq("company_id", company.id)
      .eq("period", `${periodYear}-base-${periodMonth}`);

    if (budgetRows && budgetRows.length > 0) {
      const budgetRevenue = budgetRows
        .filter((b: any) => b.category === "omsaetning")
        .reduce((s: number, b: any) => s + b.budget_amount, 0);
      const budgetCosts = budgetRows
        .filter((b: any) => b.category !== "omsaetning")
        .reduce((s: number, b: any) => s + b.budget_amount, 0);
      const budgetEbitda = budgetRevenue - budgetCosts;

      if (budgetRevenue > 0) {
        const revenueDeviation = Math.abs((revenue - budgetRevenue) / budgetRevenue) * 100;
        if (revenueDeviation > 15) {
          triggers.push("BUDGET_DEVIATION");
          triggerData.BUDGET_DEVIATION = {
            revenue_actual: revenue,
            revenue_budget: budgetRevenue,
            revenue_deviation_pct: Math.round(revenueDeviation * 10) / 10,
            revenue_below: revenue < budgetRevenue,
          };
        }
        if (budgetEbitda !== 0 && ebitda !== null) {
          const ebitdaDeviation = Math.abs((ebitda - budgetEbitda) / Math.abs(budgetEbitda)) * 100;
          if (ebitdaDeviation > 15 && !triggers.includes("BUDGET_DEVIATION")) {
            triggers.push("BUDGET_DEVIATION");
            triggerData.BUDGET_DEVIATION = {
              ebitda_actual: ebitda,
              ebitda_budget: budgetEbitda,
              ebitda_deviation_pct: Math.round(ebitdaDeviation * 10) / 10,
              ebitda_below: ebitda < budgetEbitda,
            };
          }
        }
      }
    }
  }

  // T3: MILESTONE_DUE_SOON — deadline within 14 days, progress < 50%
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: dueSoonMilestones } = await admin
    .from("milestones")
    .select("id, title, deadline, progress")
    .eq("company_id", company.id)
    .lt("progress", 50)
    .not("deadline", "is", null)
    .lte("deadline", fourteenDaysFromNow)
    .gte("deadline", now.toISOString().split("T")[0])
    .limit(3);

  if ((dueSoonMilestones || []).length > 0) {
    triggers.push("MILESTONE_DUE_SOON");
    triggerData.MILESTONE_DUE_SOON = dueSoonMilestones!.map(m => ({
      id: m.id, title: m.title, deadline: m.deadline, progress: m.progress,
    }));
  }

  // T4: MILESTONE_STALLED — progress unchanged for 30+ days, not completed
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stalledMilestones } = await admin
    .from("milestones")
    .select("id, title, progress, updated_at, deadline")
    .eq("company_id", company.id)
    .lt("progress", 100)
    .lt("updated_at", thirtyDaysAgo)
    .limit(3);

  if ((stalledMilestones || []).length > 0) {
    triggers.push("MILESTONE_STALLED");
    triggerData.MILESTONE_STALLED = stalledMilestones!.map(m => ({
      id: m.id, title: m.title, progress: m.progress,
      days_stalled: Math.floor((now.getTime() - new Date(m.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  // T5: KPI_OFF_TARGET — KPI >15% from user target
  const { data: kpiTargets } = await admin
    .from("kpi_targets")
    .select("kpi_key, target_value, lower_is_better")
    .eq("company_id", company.id);

  // Danish KPI key → canonical metrics key mapping
  const kpiKeyMap: Record<string, string> = {
    db_margin: "gross_margin_pct",
    ebitda_margin: "ebitda_margin_pct",
    omsaetning: "revenue",
    resultat: "net_result",
    loenninger: "payroll",
  };

  const offTargetKPIs: any[] = [];
  for (const kpi of (kpiTargets || [])) {
    const canonicalKey = kpiKeyMap[kpi.kpi_key];
    if (!canonicalKey) continue;
    let actual = metrics[canonicalKey] ?? null;
    if (actual === null) continue;

    // Both db_margin and ebitda_margin now map directly to their canonical pct keys
    // No on-the-fly calculation needed

    const deviation = Math.abs((actual - kpi.target_value) / Math.abs(kpi.target_value || 1)) * 100;
    const offTarget = kpi.lower_is_better
      ? actual > kpi.target_value * 1.15
      : actual < kpi.target_value * 0.85;

    if (offTarget && deviation > 15) {
      offTargetKPIs.push({
        kpi_key: kpi.kpi_key,
        actual: Math.round(actual * 10) / 10,
        target: kpi.target_value,
        deviation_pct: Math.round(deviation * 10) / 10,
      });
    }
  }
  if (offTargetKPIs.length > 0) {
    triggers.push("KPI_OFF_TARGET");
    triggerData.KPI_OFF_TARGET = offTargetKPIs;
  }

  // T6: BENCHMARK_BELOW — gross_margin_pct or ebitda_margin_pct below industry minimum
  if (company.industry_code) {
    const { data: benchmarks } = await admin
      .from("industry_benchmarks")
      .select("kpi_key, benchmark_min, benchmark_label")
      .eq("industry_code", company.industry_code);

    const belowBenchmark: any[] = [];
    for (const bm of (benchmarks || [])) {
      let actual: number | null = null;
      if (bm.kpi_key === "gross_margin_pct") actual = metrics.gross_margin_pct ?? null;
      if (bm.kpi_key === "ebitda_margin_pct" && revenue && revenue > 0 && ebitda !== null) {
        actual = (ebitda / revenue) * 100;
      }
      if (actual === null) continue;
      if (actual < bm.benchmark_min) {
        belowBenchmark.push({
          kpi_key: bm.kpi_key,
          actual: Math.round(actual * 10) / 10,
          benchmark_min: bm.benchmark_min,
          benchmark_label: bm.benchmark_label,
        });
      }
    }
    if (belowBenchmark.length > 0) {
      triggers.push("BENCHMARK_BELOW");
      triggerData.BENCHMARK_BELOW = belowBenchmark;
    }
  }

  // T7: NO_REPORT_60_DAYS — own query not bounded by 90-day window
  const { data: anyRecentFact } = await admin
    .from("financial_report_facts")
    .select("id, committed_at")
    .eq("company_id", company.id)
    .gte("committed_at", sixtyDaysAgo)
    .limit(1);

  const { data: anyFactEver } = await admin
    .from("financial_report_facts")
    .select("id, committed_at")
    .eq("company_id", company.id)
    .order("committed_at", { ascending: false })
    .limit(1);

  if (!anyRecentFact || anyRecentFact.length === 0) {
    const lastFactDaysAgo = anyFactEver?.[0]?.committed_at
      ? Math.floor((now.getTime() - new Date(anyFactEver[0].committed_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    triggers.push("NO_REPORT_60_DAYS");
    triggerData.NO_REPORT_60_DAYS = { last_report_days_ago: lastFactDaysAgo };
  }

  // T8: HANDOUT_OVERDUE — handout not answered in 30+ days
  const { data: overdueHandouts } = await admin
    .from("handouts")
    .select("id, module, completed_at, created_at")
    .eq("company_id", company.id)
    .is("completed_at", null)
    .lt("created_at", new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString())
    .limit(3);

  if ((overdueHandouts || []).length > 0) {
    triggers.push("HANDOUT_OVERDUE");
    triggerData.HANDOUT_OVERDUE = overdueHandouts!.map(h => ({
      module: h.module,
      days_overdue: Math.floor((now.getTime() - new Date(h.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  // T9: POSITIVE_MOMENTUM — revenue >10% above budget 2 months in a row
  if (recentFacts && recentFacts.length >= 2) {
    let positiveMonths = 0;
    for (const fact of recentFacts.slice(0, 2)) {
      const fMetrics: any = fact.metrics || {};
      const fRevenue = fMetrics.revenue ?? null;
      if (!fRevenue || !fact.period_key) continue;
      const pp = fact.period_key.split("-");
      const py = parseInt(pp[0]);
      const pm = parseInt(pp[1]) - 1;
      const { data: bRows } = await admin
        .from("budget_targets")
        .select("category, budget_amount")
        .eq("company_id", company.id)
        .eq("period", `${py}-base-${pm}`)
        .eq("category", "omsaetning");
      const bRev = (bRows || []).reduce((s: number, b: any) => s + b.budget_amount, 0);
      if (bRev > 0 && fRevenue > bRev * 1.10) positiveMonths++;
    }
    if (positiveMonths >= 2) {
      triggers.push("POSITIVE_MOMENTUM");
      triggerData.POSITIVE_MOMENTUM = { months_above_budget: positiveMonths };
    }
  }

  // REPORT_UPLOADED alone is not sufficient for AI analysis
  // Only keep it if at least one other substantive trigger is also active
  if (triggers.length === 1 && triggers[0] === "REPORT_UPLOADED") {
    await admin.from("weekly_focus").upsert({
      company_id: company.id,
      week_key: weekKey,
      status: "quiet",
      triggers_fired: triggers,
      trigger_data: triggerData,
      data_freshness_days: dataFreshnessDays,
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "company_id,week_key" });
    return;
  }

  // ── STEP 3: QUIET WEEK CHECK ──────────────────────────────────────
  if (triggers.length === 0) {
    await admin.from("weekly_focus").upsert({
      company_id: company.id,
      week_key: weekKey,
      status: "quiet",
      triggers_fired: [],
      trigger_data: {},
      data_freshness_days: dataFreshnessDays,
      generated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "company_id,week_key" });
    return;
  }

  // ── STEP 4: AI ANALYSIS ───────────────────────────────────────────
  // Fetch latest financial commentary for context
  const { data: commentary } = await admin
    .from("financial_commentaries")
    .select("analysis, period_key")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commentaryContext = commentary
    ? `\nSENESTE AI-ANALYSE (${commentary.period_key}):\nOverblik: ${(commentary.analysis as any)?.overview || ""}\nUdfordringer: ${((commentary.analysis as any)?.challenges || []).map((c: any) => c.title).join(", ") || "ingen"}\nNæste skridt: ${((commentary.analysis as any)?.next_steps || []).slice(0, 3).join("; ") || "ingen"}\n`
    : "";

  const industryContext = company.industry_label
    ? `Branche: ${company.industry_label}\n`
    : "";

  const triggerDescriptions: Record<string, string> = {
    REPORT_UPLOADED: "Ny rapport er uploadet denne uge",
    BUDGET_DEVIATION: "Afvigelse fra budget på mere end 15%",
    MILESTONE_DUE_SOON: "Milestone med deadline inden for 14 dage og fremskridt under 50%",
    MILESTONE_STALLED: "Milestone der ikke har rykket sig i over 30 dage",
    KPI_OFF_TARGET: "KPI mere end 15% fra målsætning",
    BENCHMARK_BELOW: "Nøgletal under brancheminimum",
    NO_REPORT_60_DAYS: "Ingen rapport uploadet i over 60 dage",
    HANDOUT_OVERDUE: "Handout ikke besvaret i over 30 dage",
    POSITIVE_MOMENTUM: "Omsætning over budget 2 måneder i træk",
  };

  const triggersText = triggers.map(t =>
    `- ${triggerDescriptions[t] || t}: ${JSON.stringify(triggerData[t])}`
  ).join("\n");

  const systemPrompt = `Du er en præcis og handlingsorienteret rådgiver for danske SMV-ejere i The Boardroom.

Du skal generere en kort ugentlig fokusanalyse baseret KUN på de aktive triggers. Du må IKKE opfinde problemer der ikke er i dataene. Du må IKKE give generiske råd.

REGLER:
- Tal kun om de triggers der er aktive
- Citér konkrete tal fra trigger-dataene
- Vær direkte og specifik — ikke akademisk
- Maksimalt 3 handlinger
- Hver handling skal være konkret og gennemførlig denne uge
- Headline: max 8 ord, fokuseret på det vigtigste
- Summary: 2-3 sætninger, konkrete tal, ingen floskler
- Svar KUN med valid JSON`;

  const userMessage = `Virksomhed: ${company.name}
${industryContext}Uge: ${weekKey}

AKTIVE TRIGGERS DENNE UGE:
${triggersText}
${commentaryContext}
Generer en ugentlig fokusanalyse. Svar med dette JSON-format:
{
  "headline": "kort headline max 8 ord",
  "summary": "2-3 sætninger med konkrete tal",
  "actions": [
    {
      "title": "konkret handling",
      "context": "hvorfor — citér et specifikt tal",
      "priority": "high|medium|low",
      "source_type": "ai_weekly"
    }
  ]
}`;

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI gateway error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const rawContent = aiData.choices?.[0]?.message?.content || "{}";

  let analysis: any;
  try {
    analysis = JSON.parse(rawContent.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error(`Failed to parse AI response: ${rawContent.slice(0, 200)}`);
  }

  const headline = analysis.headline || "Ugentlig fokus";
  const summary = analysis.summary || "";
  const actions: any[] = Array.isArray(analysis.actions) ? analysis.actions.slice(0, 3) : [];

  // ── STEP 5: PERSIST ───────────────────────────────────────────────
  await admin.from("weekly_focus").upsert({
    company_id: company.id,
    week_key: weekKey,
    status: "active",
    triggers_fired: triggers,
    trigger_data: triggerData,
    headline,
    summary,
    actions_generated: actions.length,
    data_freshness_days: dataFreshnessDays,
    generated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: "company_id,week_key" });

  // Persist actions
  if (actions.length > 0) {
    // Get company user_id (first member)
    const { data: members } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", company.id)
      .limit(1);
    const userId = members?.[0]?.user_id;

    if (userId) {
      const actionRows = actions.map((a: any) => ({
        company_id: company.id,
        user_id: userId,
        title: a.title,
        context: a.context,
        source_type: "ai_weekly",
        priority: a.priority || "medium",
        status: "open",
        week_key: weekKey,
        generated_at: now.toISOString(),
      }));
      await admin.from("company_actions").insert(actionRows);
    }
  }

  // ── STEP 6: NOTIFY ────────────────────────────────────────────────
  const { data: members2 } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", company.id);

  for (const member of (members2 || [])) {
    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: member.user_id,
      company_id: company.id,
      type: "weekly_focus_ready",
      priority: "important",
      title: "Ugens fokus er klar",
      body: headline,
      deep_link: "/",
      dedup_key: `weekly_focus:${company.id}:${weekKey}`,
    });
    if (notifErr && notifErr.code !== "23505") {
      console.error("[weekly-focus] Notification error:", notifErr);
    }
  }

  console.log(`[weekly-focus] Done: ${company.name} — ${triggers.length} triggers, ${actions.length} actions`);
}
