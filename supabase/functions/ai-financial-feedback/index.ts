import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let { financialData, historicalData, companyContext } = await req.json();

    // If companyContext doesn't include industry, try to look it up
    if (companyContext?.name && !companyContext.industry) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);
      const { data: company } = await sb
        .from("companies")
        .select("industry")
        .eq("name", companyContext.name)
        .maybeSingle();
      if (company?.industry) {
        companyContext = { ...companyContext, industry: company.industry };
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Du er en elite finansiel rådgiver og analytiker for danske startups og SMV'er i et board-/investor-miljø kaldet "The Boardroom". 

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

    const userMessage = `Her er virksomhedens finansielle data:

${companyContext ? `Virksomhed: ${companyContext.name}\nCVR: ${companyContext.cvr}\n${companyContext.industry ? `Branche: ${companyContext.industry}\nTilpas din analyse specifikt til denne branche — brug branchespecifikke KPI'er, benchmarks og termer.\n` : ""}` : ""}

AKTUEL PERIODE DATA:
${JSON.stringify(financialData, null, 2)}

${historicalData ? `HISTORISKE DATA (tidligere perioder):
${JSON.stringify(historicalData, null, 2)}` : "Ingen historiske data endnu."}

Giv din detaljerede finansielle analyse.`;

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
          tools: [
            {
              type: "function",
              function: {
                name: "deliver_financial_analysis",
                description: "Leverer en struktureret finansiel analyse med overblik, nøglefund, trends og anbefalinger",
                parameters: {
                  type: "object",
                  properties: {
                    overview: {
                      type: "string",
                      description: "2-3 sætningers overblik over den finansielle situation",
                    },
                    key_findings: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          analysis: { type: "string", description: "Detaljeret analyse med tal" },
                          recommendation: { type: "string" },
                          severity: {
                            type: "string",
                            enum: ["positiv", "advarsel", "kritisk"],
                          },
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
                          metric: { type: "string", description: "F.eks. '+20,3%' eller '74.731 DKK'" },
                          period: { type: "string", description: "F.eks. 'Okt 2025' eller 'Jul 2025 – Okt 2025'" },
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
                    strategic_questions: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-3 strategiske spørgsmål til founder/team",
                    },
                    next_steps: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-3 konkrete næste skridt",
                    },
                  },
                  required: [
                    "overview",
                    "key_findings",
                    "positive_trends",
                    "challenges",
                    "strategic_questions",
                    "next_steps",
                  ],
                },
              },
            },
          ],
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
        return new Response(
          JSON.stringify({ error: "For mange forespørgsler. Prøv igen om lidt." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-kreditter opbrugt. Tilføj flere i indstillinger." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
