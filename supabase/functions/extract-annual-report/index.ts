import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const DANISH_MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { report_id, file_path, year, company_id, user_id } = await req.json();
  if (!report_id || !file_path || !year || !company_id) {
    return new Response(JSON.stringify({ ok: false, error: "Missing params" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Helper: persist error details to the report record so UI can show them
  const failReport = async (step: string, message: string, extra?: Record<string, unknown>) => {
    const error_log = {
      step,
      message,
      at: new Date().toISOString(),
      ...(extra || {}),
    };
    console.error(`[extract-annual-report] FAIL step=${step}:`, message, extra || "");
    await adminClient
      .from("financial_reports")
      .update({
        status: "error",
        extracted_data: { error_log } as any,
      } as any)
      .eq("id", report_id);
  };

  // ── STEP 0: Auto soft-delete prior failed annual reports for same company+year ──
  // Når brugeren uploader samme år igen efter en fejl, ryddes gamle error-rapporter automatisk væk.
  try {
    const { data: cleanedRows, error: cleanupErr } = await adminClient
      .from("financial_reports")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", company_id)
      .eq("report_type", "annual_report")
      .eq("status", "error")
      .is("deleted_at", null)
      .neq("id", report_id)
      .or(`report_period.eq.Årsrapport ${year},manual_report_period_key.eq.${year}`)
      .select("id");
    if (cleanupErr) {
      console.warn(`[extract-annual-report] Auto-cleanup warning:`, cleanupErr.message);
    } else if (cleanedRows && cleanedRows.length > 0) {
      console.log(`[extract-annual-report] Auto-cleaned ${cleanedRows.length} prior failed report(s) for year ${year}`);
    }
  } catch (e) {
    console.warn(`[extract-annual-report] Auto-cleanup exception:`, (e as Error).message);
  }

  // ── STEP 1: Download PDF ──
  const { data: fileData, error: downloadErr } = await adminClient.storage
    .from("financial-documents")
    .download(file_path);
  if (downloadErr || !fileData) {
    await failReport("download", downloadErr?.message || "Unknown download error", { file_path });
    return new Response(JSON.stringify({ ok: false, error: `Download failed: ${downloadErr?.message}`, step: "download" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  // ── STEP 2: AI extraction ──
  const systemPrompt = `Du er en erfaren revisor der læser danske årsrapporter fra revisorer (BDO, Deloitte, PWC, EY, KPMG og lokale revisorer).
DIN OPGAVE: Udtræk de vigtigste nøgletal fra årsrapporten. Årsrapporten indeholder et helt regnskabsår — IKKE månedlige tal.
VIGTIGT:
- Alle tal skal være i KR. (ikke t.kr. — gang med 1000 hvis rapporten bruger t.kr.)
- Negative tal (underskud, tab) angives som negative tal
- Hvis et tal ikke fremgår af rapporten, returner null — ALDRIG 0 som erstatning`;

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [
          { type: "text", text: `Årsrapport for regnskabsåret ${year}. Udtræk nøgletal fra resultatopgørelsen og balancen.` },
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
        ]},
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_annual_report",
          description: "Udtrækker nøgletal fra en dansk årsrapport",
          parameters: {
            type: "object",
            properties: {
              year: { type: "string" },
              nettoomsaetning: { type: "number", description: "Årets nettoomsætning i kr." },
              direkte_omkostninger: { type: "number" },
              bruttoresultat: { type: "number" },
              personaleomkostninger: { type: "number", description: "Negativt tal" },
              andre_eksterne_omkostninger: { type: "number" },
              afskrivninger: { type: "number" },
              resultat_foer_skat: { type: "number" },
              aarsresultat: { type: "number" },
              likvider: { type: "number" },
              egenkapital: { type: "number" },
              aktiver_i_alt: { type: "number" },
            },
            required: ["year", "resultat_foer_skat"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_annual_report" } },
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    await failReport("ai_extraction", `AI gateway returned ${aiResponse.status}`, { http_status: aiResponse.status, body: errText.slice(0, 1000) });
    return new Response(JSON.stringify({ ok: false, error: "AI extraction failed", step: "ai_extraction", http_status: aiResponse.status }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiData = await aiResponse.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    await failReport("ai_no_tool_call", "AI returned no tool_call", { ai_response: JSON.stringify(aiData).slice(0, 1000) });
    return new Response(JSON.stringify({ ok: false, error: "No tool call in AI response", step: "ai_no_tool_call" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let extracted: Record<string, any>;
  try {
    extracted = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    await failReport("ai_parse", `Could not parse tool_call arguments: ${(e as Error).message}`, { raw: String(toolCall.function?.arguments).slice(0, 1000) });
    return new Response(JSON.stringify({ ok: false, error: "Could not parse AI response", step: "ai_parse" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[extract-annual-report] Extracted year ${year}:`, JSON.stringify(extracted));

  // ── STEP 3: Build monthly metrics ──
  const monthly = (val: number | null | undefined) => val != null ? Math.round(val / 12) : null;

  const baseMetrics: Record<string, number | null> = {
    revenue: monthly(extracted.nettoomsaetning),
    gross_profit: monthly(extracted.bruttoresultat),
    payroll: monthly(extracted.personaleomkostninger),
    ebt: monthly(extracted.resultat_foer_skat),
    depreciation: monthly(extracted.afskrivninger),
    cogs: monthly(extracted.direkte_omkostninger),
    admin_costs: monthly(extracted.andre_eksterne_omkostninger),
  };

  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(baseMetrics)) {
    if (v != null) metrics[k] = v;
  }
  if (extracted.likvider != null) metrics.cash = extracted.likvider;
  if (extracted.egenkapital != null) metrics.equity = extracted.egenkapital;

  if (Object.keys(metrics).length === 0) {
    await failReport("no_metrics", "AI returned no usable metrics from the document", { extracted });
    return new Response(JSON.stringify({ ok: false, error: "No metrics could be extracted from the document", step: "no_metrics" }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── STEP 4: Find protected months (real committed data) ──
  const { data: existingFacts } = await adminClient
    .from("financial_report_facts")
    .select("period_key, source_type")
    .eq("company_id", company_id)
    .like("period_key", `${year}-%`);

  const protectedPeriods = new Set(
    (existingFacts || [])
      .filter((f: any) => !["annual_report", "manual_baseline", "baseline"].includes(f.source_type))
      .map((f: any) => f.period_key)
  );

  // ── STEP 5: Delete old annual + baseline facts for this year ──
  await adminClient
    .from("financial_report_facts")
    .delete()
    .eq("company_id", company_id)
    .in("source_type", ["annual_report", "manual_baseline", "baseline"])
    .like("period_key", `${year}-%`);

  // ── STEP 6: Insert 12 monthly facts ──
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const monthNum = String(i + 1).padStart(2, "0");
    const periodKey = `${year}-${monthNum}`;
    if (protectedPeriods.has(periodKey)) continue;
    rows.push({
      company_id,
      period_key: periodKey,
      period_label: `${DANISH_MONTHS[i]} ${year}`,
      source_report_id: report_id,
      source_type: "annual_report",
      metrics,
      committed_by: user_id || null,
      committed_at: new Date().toISOString(),
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    // Upsert med unique constraint (company_id, period_key, source_type) sikrer ingen dubletter
    const { error: insertErr } = await adminClient
      .from("financial_report_facts")
      .upsert(rows, { onConflict: "company_id,period_key,source_type" });
    if (insertErr) {
      await failReport("insert_facts", insertErr.message, { code: insertErr.code, details: insertErr.details, hint: insertErr.hint, attempted_rows: rows.length });
      return new Response(JSON.stringify({ ok: false, error: `Insert failed: ${insertErr.message}`, step: "insert_facts", db_code: insertErr.code }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted = rows.length;
  }

  const protected_count = 12 - rows.length;

  // ── STEP 7: Update report record (clear any prior error_log) ──
  const success_log = {
    year,
    inserted_count: inserted,
    protected_count,
    total_months: 12,
    completed_at: new Date().toISOString(),
    metrics_keys: Object.keys(metrics),
  };
  await adminClient
    .from("financial_reports")
    .update({
      status: "processed",
      extracted_data: { ...extracted, success_log } as any,
      normalized_data: metrics as any,
      report_period: `Årsrapport ${year}`,
    } as any)
    .eq("id", report_id);

  console.log(`[extract-annual-report] Done — inserted ${inserted} facts, ${protected_count} protected for company ${company_id} year ${year}`);

  return new Response(JSON.stringify({ ok: true, inserted, protected_count, year, extracted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
