import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { fileContent, fileName } = await req.json();

    if (!fileContent) {
      return new Response(
        JSON.stringify({ error: "No file content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `Du er en ekspert i at læse og forstå danske budgetter og regnskaber fra Excel-filer.

Du modtager indholdet af en Excel-fil (parset som tekst/CSV). Din opgave er at:

1. Identificere ALLE budgetår i filen (f.eks. 2025 OG 2026 hvis begge findes)
2. For HVERT år: udtrække ALLE budgetposter med månedlige beløb (Januar-December)
3. Intelligent gruppere posterne i følgende hovedkategorier:
   - "omsaetning" (Omsætning / indtægter)
   - "vareforbrug" (Vareforbrug, COGS, direkte omkostninger)
   - "loenninger" (Lønninger, medarbejderomkostninger, personalepleje)
   - "marketing" (Marketing, content, repræsentation)
   - "lokaler" (Kontorleje, lager, el, vand, varme)
   - "tech_software" (Platform, hosting, software, domæner, IT-udstyr)
   - "admin" (Bogføring, revision, advokat, forsikring, kontorartikler, telefon)
   - "betalingsgebyrer" (Betalingshåndtering, transaktionsgebyrer)
   - "andet" (Alt der ikke passer andre kategorier)

4. For hver kategori, summer ALLE relevante underposter per måned

Regler:
- Alle beløb skal være POSITIVE tal (fjern minus-tegn fra omkostninger)
- Omsætning er positiv, omkostninger er positive (vi ved de er omkostninger fra kategorien)
- Ignorer tomme rækker, totaler, marginer og beregnede felter
- Returnér ALLE budgetår der findes i filen — hvert år som et separat objekt i "years" arrayet
- Ignorer "uforudsete omkostninger" som separat post — inkluder dem i "andet"

Returnér resultatet som et JSON-objekt med denne struktur:
{
  "company_name": "Firmanavn",
  "years": [
    {
      "year": "2025",
      "categories": [
        {
          "key": "omsaetning",
          "label": "Omsætning",
          "monthly": [jan, feb, mar, apr, maj, jun, jul, aug, sep, okt, nov, dec],
          "details": ["Topix salg", "Boardroom salg"]
        }
      ]
    },
    {
      "year": "2026",
      "categories": [...]
    }
  ]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Her er indholdet af Excel-filen "${fileName}":\n\n${fileContent}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_budget",
              description: "Extract structured budget data for ALL years found in the Excel content",
              parameters: {
                type: "object",
                properties: {
                  company_name: { type: "string", description: "Company name if found" },
                  years: {
                    type: "array",
                    description: "One entry per budget year found in the file",
                    items: {
                      type: "object",
                      properties: {
                        year: { type: "string", description: "Budget year e.g. 2025" },
                        categories: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              key: {
                                type: "string",
                                enum: [
                                  "omsaetning",
                                  "vareforbrug",
                                  "loenninger",
                                  "marketing",
                                  "lokaler",
                                  "tech_software",
                                  "admin",
                                  "betalingsgebyrer",
                                  "andet",
                                ],
                              },
                              label: { type: "string" },
                              monthly: {
                                type: "array",
                                items: { type: "number" },
                                minItems: 12,
                                maxItems: 12,
                              },
                              details: {
                                type: "array",
                                items: { type: "string" },
                                description: "Original line items summed into this category",
                              },
                            },
                            required: ["key", "label", "monthly", "details"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["year", "categories"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["company_name", "years"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_budget" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Prøv igen om et øjeblik." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-kreditter opbrugt. Tilføj kreditter i Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    const budgetData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(budgetData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("import-budget-excel error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
