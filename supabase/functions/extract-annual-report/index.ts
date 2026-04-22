import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { report_id, file_path, year, company_id } = await req.json();
  if (!report_id || !file_path || !year || !company_id) {
    return new Response(JSON.stringify({ error: "Missing params" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Download PDF from storage
  const { data: fileData, error: downloadErr } = await adminClient.storage
    .from("reports")
    .download(file_path);
  if (downloadErr || !fileData) {
    return new Response(JSON.stringify({ error: "Could not download file" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Convert to base64
  const arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const systemPrompt = `Du er en erfaren revisor der læser danske årsrapporter fra revisorer (BDO, Deloitte, PWC, EY, KPMG og lokale revisorer).

DIN OPGAVE: Udtræk de vigtigste nøgletal fra årsrapporten. Årsrapporten indeholder et helt regnskabsår — IKKE månedlige tal.

VIGTIGT:
- Alle tal skal være i KR. (ikke t.kr. — gang med 1000 hvis rapporten bruger t.kr.)
- Negative tal (underskud, tab) angives som negative tal
- Hvis et tal ikke fremgår af rapporten, returner null — ALDRIG 0 som erstatning
- Resultatopgørelsen viser årets samlede tal
- Balancen viser statustal pr. regnskabsårets slutning`;

  const userContent = [
    {
      type: "text",
      text: `Årsrapport for regnskabsåret ${year}. Udtræk nøgletal fra resultatopgørelsen og balancen.`,
    },
    {
      type: "image_url",
      image_url: { url: `data:application/pdf;base64,${base64}` },
    },
  ];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_annual_report",
            description: "Udtrækker nøgletal fra en dansk årsrapport",
            parameters: {
              type: "object",
              properties: {
                year: { type: "string", description: "Regnskabsåret, fx '2024'" },
                company_name: { type: "string" },
                cvr_number: { type: "string" },
                currency: { type: "string", description: "'kr' eller 't.kr'" },
                nettoomsaetning: { type: "number", description: "Årets nettoomsætning i kr." },
                direkte_omkostninger: { type: "number", description: "Direkte/variable omkostninger, vareforbrug, produktionsomkostninger" },
                bruttoresultat: { type: "number", description: "Bruttoresultat/bruttofortjeneste" },
                personaleomkostninger: { type: "number", description: "Løn, gager og personaleomkostninger samlet — negativt tal" },
                andre_eksterne_omkostninger: { type: "number", description: "Andre eksterne omkostninger, administrationsomkostninger, salgsomkostninger" },
                afskrivninger: { type: "number", description: "Af- og nedskrivninger" },
                driftsresultat: { type: "number", description: "Resultat af primær drift / EBIT" },
                finansielle_poster: { type: "number", description: "Finansielle indtægter minus finansielle omkostninger netto" },
                resultat_foer_skat: { type: "number", description: "Resultat før skat" },
                skat: { type: "number", description: "Skat af årets resultat" },
                aarsresultat: { type: "number", description: "Årets resultat efter skat" },
                likvider: { type: "number", description: "Likvide beholdninger pr. balancedato" },
                egenkapital: { type: "number", description: "Egenkapital pr. balancedato" },
                aktiver_i_alt: { type: "number", description: "Aktiver i alt" },
                kortfristet_gaeld: { type: "number", description: "Kortfristede gældsforpligtelser i alt" },
              },
              required: ["year", "resultat_foer_skat"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_annual_report" } },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[extract-annual-report] AI error:", err);
    return new Response(JSON.stringify({ error: "AI extraction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiData = await response.json();
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return new Response(JSON.stringify({ error: "No tool call in response" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let extracted: Record<string, any>;
  try {
    extracted = JSON.parse(toolCall.function.arguments);
  } catch {
    return new Response(JSON.stringify({ error: "Could not parse AI response" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update report with extracted data
  await adminClient
    .from("financial_reports")
    .update({
      status: "processed",
      extracted_data: extracted,
      report_period: `Årsrapport ${year}`,
    } as any)
    .eq("id", report_id);

  console.log(`[extract-annual-report] Extracted ${year} annual report for company ${company_id}`);

  return new Response(JSON.stringify({ ok: true, extracted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
