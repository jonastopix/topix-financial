import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// CANONICAL SYSTEM PROMPT (Phase 3) — English canonical names
// ═══════════════════════════════════════════════════════════════
const CORE_METRIC_KEYS = ["revenue", "gross_profit", "ebt"];
const ALL_METRIC_KEYS = [
  "revenue", "cogs", "gross_profit", "gross_margin_pct", "payroll",
  "sales_costs", "facility_costs", "admin_costs", "depreciation",
  "ebitda", "ebit", "ebt", "net_result", "assets_total", "equity_total",
  "cash", "trade_receivables", "current_liabilities", "liabilities_total", "debt_total",
];

const CANONICAL_SYSTEM_PROMPT = `Du er en elite finansiel rådgiver og analytiker for danske startups og SMV'er i et board-/investor-miljø kaldet "The Boardroom". 

Du modtager KUN validerede, kanoniske nøgletal fra en regnskabsmotor. Tallene er allerede normaliserede og validerede — du skal IKKE gætte på fortegn.

METRICS FORMAT (engelske navne):
- revenue: Omsætning (altid positiv)
- cogs: Vareforbrug (positiv = omkostning)
- gross_profit: Dækningsbidrag (positiv = overskud)
- gross_margin_pct: Bruttomargin i procent
- payroll: Lønninger
- sales_costs: Salgs/marketingomkostninger
- facility_costs: Lokaleomkostninger
- admin_costs: Administrative omkostninger (inkl. IT/software)
- depreciation: Afskrivninger
- ebitda: EBITDA
- ebit: EBIT
- ebt: Resultat før skat
- net_result: Årets resultat
- assets_total: Aktiver i alt
- equity_total: Egenkapital
- cash: Likvider/bank (kan være negativ = overtræk)
- trade_receivables: Debitorer
- current_liabilities: Kortfristet gæld
- liabilities_total: Passiver i alt

KRITISKE REGLER:
- Hvis et felt er null, ignorer det i din analyse og nævn ikke at det mangler — analyser kun de tilgængelige tal.
- Hvis cash er negativ: beskriv som "bankovertræk", IKKE "insolvens"
- Negativ egenkapital er KUN mulig hvis equity_total < 0
- Brug altid danske talformater (punktum som tusindtalsseparator, komma som decimaltegn)
- Vær specifik — referer til de konkrete tal

Du skal altid:
1. Starte med et klart OVERBLIK (2-3 sætninger)
2. Identificere 3-5 NØGLEFUND med severity (positiv/advarsel/kritisk)
3. Lave TREND-ANALYSE (3 positive, 3 udfordringer)
4. Give STRATEGISKE ANBEFALINGER (2-3 konkrete næste skridt)

Hvis der er historiske data, analysér trends og mønstre.`;

// ═══════════════════════════════════════════════════════════════
// LEGACY SYSTEM PROMPT — uændret fra eksisterende kode
// ═══════════════════════════════════════════════════════════════
const LEGACY_SYSTEM_PROMPT = `Du er en elite finansiel rådgiver og analytiker for danske startups og SMV'er i et board-/investor-miljø kaldet "The Boardroom". 

Din opgave er at levere knivskarp, detaljeret og handlingsorienteret finansiel feedback baseret på virksomhedens regnskabsdata.

Du skal altid:
1. Starte med et klart OVERBLIK der opsummerer den samlede finansielle situation i 2-3 sætninger
2. Identificere 3-5 NØGLEFUND – nummererede punkter med dybdegående analyse. Hvert fund skal indeholde:
   - En tydelig overskrift
   - Konkret analyse med tal og procenter
   - Kontekst: hvad betyder det for virksomheden?
   - Anbefaling: hvad bør de gøre?
   - Markér hvert fund som "positiv", "advarsel" eller "kritisk"
3. Lave en TREND-ANALYSE med:
   - 3 positive trends (med konkrete tal og udvikling over tid)
   - 3 udfordringer/risici (med konkrete tal og forslag)
4. Give en STRATEGISK ANBEFALING med 2-3 konkrete næste skridt

Brug altid danske tal-formater (punktum som tusindtalsseparator, komma som decimaltegn).
Vær specifik – undgå generiske råd. Referer altid til de konkrete tal.
Tænk som en erfaren CFO der rådgiver en founder.

Hvis der er historiske data, skal du analysere trends og mønstre over tid og give indsigter der bygger på denne historik.`;

// Tool definition (shared between both paths)
const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "deliver_financial_analysis",
    description: "Leverer en struktureret finansiel analyse med overblik, nøglefund, trends og anbefalinger",
    parameters: {
      type: "object",
      properties: {
        overview: { type: "string", description: "2-3 sætningers overblik over den finansielle situation" },
        key_findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              analysis: { type: "string", description: "Detaljeret analyse med tal" },
              recommendation: { type: "string" },
              severity: { type: "string", enum: ["positiv", "advarsel", "kritisk"] },
            },
            required: ["title", "analysis", "recommendation", "severity"],
          },
        },
        positive_trends: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              metric: { type: "string" },
              period: { type: "string" },
            },
            required: ["title", "description", "metric", "period"],
          },
        },
        challenges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              metric: { type: "string" },
              period: { type: "string" },
            },
            required: ["title", "description", "metric", "period"],
          },
        },
        strategic_questions: { type: "array", items: { type: "string" } },
        next_steps: { type: "array", items: { type: "string" } },
      },
      required: ["overview", "key_findings", "positive_trends", "challenges", "strategic_questions", "next_steps"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    let { financialData, historicalData, companyContext, companyId, canonicalPayload, historicalCanonical, request_type, budgetContext } = await req.json();

    // ── Caller→resource access check for company context (JWT-scoped) ──
    // If companyId is provided, verify caller has RLS access to that company
    // before any service-role operations
    if (companyId) {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: companyAccess, error: companyAccessErr } = await callerClient
        .from("companies")
        .select("name, industry_label")
        .eq("id", companyId)
        .maybeSingle();

      if (companyAccessErr) {
        console.error("Company access check error:", companyAccessErr);
        return jsonRes({ error: "Internal server error" }, 500);
      }
      if (!companyAccess) {
        return jsonRes({ error: "Forbidden" }, 403);
      }

      // Use the RLS-verified data directly — no service-role fetch needed
      companyContext = {
        ...companyContext,
        name: companyAccess.name || companyContext?.name,
        industry: companyAccess.industry || companyContext?.industry,
      };
      console.log(`[ai-financial-feedback] Using RLS-verified company name: "${companyAccess.name}"`);
    } else if (companyContext?.name && !companyContext.industry) {
      // Fallback: look up industry by name via caller's RLS scope
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: company } = await callerClient
        .from("companies")
        .select("industry_label")
        .eq("name", companyContext.name)
        .maybeSingle();

      if (company?.industry_label) {
        companyContext = { ...companyContext, industry: company.industry_label };
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ═══════════════════════════════════════════════════════════════
    // SESSION PREP — lightweight bullet-point path
    // ═══════════════════════════════════════════════════════════════
    if (request_type === "session_prep") {
      const companyName = companyContext?.name || "Ukendt";
      const sessionSystemPrompt = `Du er rådgiver for ${companyName} i The Boardroom. Forbered Morten Larsen eller Jonas Herlev til en kort advisory-session. Skriv præcis 3 bullet points på dansk — konkrete ting rådgiveren bør spørge ind til eller tage op, baseret på de seneste finansielle data. Vær direkte. Maks 15 ord per bullet. Ingen introduktion, ingen opsummering — kun de 3 bullets. Returner KUN en JSON-array med 3 strings, fx: ["bullet 1","bullet 2","bullet 3"]`;

      const sessionUserMessage = `SENESTE FINANSIELLE DATA:
${JSON.stringify(historicalCanonical || financialData || canonicalPayload?.metrics || {}, null, 2)}

Returner præcis 3 bullet points som JSON-array.`;

      const sessionResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: sessionSystemPrompt },
              { role: "user", content: sessionUserMessage },
            ],
          }),
        }
      );

      if (!sessionResponse.ok) {
        const errText = await sessionResponse.text();
        console.error("AI gateway error (session_prep):", sessionResponse.status, errText);
        if (sessionResponse.status === 429) return jsonRes({ error: "For mange forespørgsler. Prøv igen om lidt." }, 429);
        if (sessionResponse.status === 402) return jsonRes({ error: "AI-kreditter opbrugt." }, 402);
        throw new Error(`AI error: ${sessionResponse.status}`);
      }

      const sessionResult = await sessionResponse.json();
      const content = (sessionResult.choices?.[0]?.message?.content || "").trim();

      // Parse bullet array from AI response
      let bullets: string[] = [];
      try {
        // Try JSON parse first (AI was asked for JSON array)
        const cleaned = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) bullets = parsed.map((s: unknown) => String(s));
      } catch {
        // Fallback: split by newlines, strip bullet markers
        bullets = content
          .split(/\n/)
          .map((l: string) => l.replace(/^[-•*]\s*/, "").trim())
          .filter((l: string) => l.length > 0)
          .slice(0, 3);
      }

      return new Response(JSON.stringify({ session_prep: bullets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // DATA SUFFICIENCY CHECK — return early if too few metrics
    // ═══════════════════════════════════════════════════════════════
    const isCanonicalPath = canonicalPayload?.input_type === "canonical";

    const metricsToCheck = isCanonicalPath
      ? (canonicalPayload?.metrics as Record<string, unknown> | undefined)
      : (financialData as Record<string, unknown> | undefined);

    if (metricsToCheck) {
      const nonNullCount = ALL_METRIC_KEYS.filter(k => metricsToCheck[k] != null && metricsToCheck[k] !== "").length;

      if (nonNullCount < 3) {
        const missingFields = ALL_METRIC_KEYS.filter(k => metricsToCheck[k] == null || metricsToCheck[k] === "");
        return new Response(JSON.stringify({
          feedback: "Ikke nok data til analyse",
          message: "Tilføj venligst de manglende nøgletal for at modtage en komplet AI-analyse.",
          needs_more_data: true,
          missing_fields: missingFields,
          populated_count: nonNullCount,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // DUAL PATH: Canonical vs Legacy
    // ═══════════════════════════════════════════════════════════════
    let systemPrompt: string;
    let userMessage: string;

    if (isCanonicalPath) {
      // ═══ CANONICAL PATH ═══
      console.log("[ai-financial-feedback] Using CANONICAL path");
      systemPrompt = CANONICAL_SYSTEM_PROMPT;

      const industryLine = companyContext?.industry
        ? `Branche: ${companyContext.industry}\nTilpas din analyse specifikt til denne branche.\n` : "";

      userMessage = `Virksomhed: ${canonicalPayload.company_name || companyContext?.name || "Ukendt"}
CVR: ${companyContext?.cvr || ""}
${industryLine}
Rapporttype: ${canonicalPayload.statement_type}
Periode: ${canonicalPayload.report_period_label || `${canonicalPayload.period_start || "?"} – ${canonicalPayload.period_end || "?"}`}
Period basis: ${canonicalPayload.selected_period_basis}

VALIDEREDE KANONISKE METRICS:
${JSON.stringify(canonicalPayload.metrics, null, 2)}

${historicalCanonical && historicalCanonical.length > 0 ? `HISTORISKE DATA (kun validerede PASS-rapporter):
${JSON.stringify(historicalCanonical, null, 2)}` : "Ingen historiske data endnu."}

${budgetContext || ""}
${budgetContext ? "- Sammenlign nøgletal med budgetmålene og fremhæv væsentlige afvigelser (>10%)" : ""}
Giv din detaljerede finansielle analyse.`;

    } else {
      // ═══ LEGACY PATH ═══
      console.log("[ai-financial-feedback] Using LEGACY path");
      systemPrompt = LEGACY_SYSTEM_PROMPT;

      const industryLine = companyContext?.industry
        ? `Branche: ${companyContext.industry}\nTilpas din analyse specifikt til denne branche.\n` : "";

      userMessage = `Her er virksomhedens finansielle data:

${companyContext ? `Virksomhed: ${companyContext.name}\nCVR: ${companyContext.cvr}\n${industryLine}` : ""}

AKTUEL PERIODE DATA:
${JSON.stringify(financialData, null, 2)}

${historicalData ? `HISTORISKE DATA (tidligere perioder):
${JSON.stringify(historicalData, null, 2)}` : "Ingen historiske data endnu."}

Giv din detaljerede finansielle analyse.`;
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          tools: [ANALYSIS_TOOL],
          tool_choice: {
            type: "function",
            function: { name: "deliver_financial_analysis" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return jsonRes({ error: "For mange forespørgsler. Prøv igen om lidt." }, 429);
      }
      if (response.status === 402) {
        return jsonRes({ error: "AI-kreditter opbrugt. Tilføj flere i indstillinger." }, 402);
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("AI returned no structured analysis");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-financial-feedback error:", error);
    return jsonRes({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function jsonRes(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
