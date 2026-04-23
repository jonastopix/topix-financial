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

  // ── STEP 1: Download PDF ──
  const { data: fileData, error: downloadErr } = await adminClient.storage
    .from("financial-documents")
    .download(file_path);
  if (downloadErr || !fileData) {
    await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
    return new Response(JSON.stringify({ ok: false, error: `Download failed: ${downloadErr?.message}` }), {
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
    const err = await aiResponse.text();
    console.error("[extract-annual-report] AI error:", err);
    await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
    return new Response(JSON.stringify({ ok: false, error: "AI extraction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiData = await aiResponse.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
    return new Response(JSON.stringify({ ok: false, error: "No tool call in AI response" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let extracted: Record<string, any>;
  try {
    extracted = JSON.parse(toolCall.function.arguments);
  } catch {
    await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
    return new Response(JSON.stringify({ ok: false, error: "Could not parse AI response" }), {
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
    await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
    return new Response(JSON.stringify({ ok: false, error: "No metrics could be extracted from the document" }), {
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
    const { error: insertErr } = await adminClient.from("financial_report_facts").insert(rows);
    if (insertErr) {
      console.error("[extract-annual-report] Insert failed:", insertErr);
      await adminClient.from("financial_reports").update({ status: "error" } as any).eq("id", report_id);
      return new Response(JSON.stringify({ ok: false, error: `Insert failed: ${insertErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted = rows.length;
  }

  const protected_count = 12 - rows.length;

  // ── STEP 7: Update report record ──
  await adminClient
    .from("financial_reports")
    .update({
      status: "processed",
      extracted_data: extracted,
      normalized_data: metrics as any,
      report_period: `Årsrapport ${year}`,
    } as any)
    .eq("id", report_id);

  console.log(`[extract-annual-report] Done — inserted ${inserted} facts, ${protected_count} protected for company ${company_id} year ${year}`);

  return new Response(JSON.stringify({ ok: true, inserted, protected_count, year, extracted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
