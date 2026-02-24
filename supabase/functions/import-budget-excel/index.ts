import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

1. Identificere hvilke faner/sektioner der indeholder det faktiske budget (ikke opsætningsfaner)
2. Finde det relevante budgetår
3. Udtrække ALLE budgetposter med månedlige beløb (Januar-December)
4. Intelligent gruppere posterne i følgende hovedkategorier:
   - "omsaetning" (Omsætning / indtægter)
   - "vareforbrug" (Vareforbrug, COGS, direkte omkostninger)
   - "loenninger" (Lønninger, medarbejderomkostninger, personalepleje)
   - "marketing" (Marketing, content, repræsentation)
   - "lokaler" (Kontorleje, lager, el, vand, varme)
   - "tech_software" (Platform, hosting, software, domæner, IT-udstyr)
   - "admin" (Bogføring, revision, advokat, forsikring, kontorartikler, telefon)
   - "betalingsgebyrer" (Betalingshåndtering, transaktionsgebyrer)
   - "andet" (Alt der ikke passer andre kategorier)

5. For hver kategori, summer ALLE relevante underposter per måned

Regler:
- Alle beløb skal være POSITIVE tal (fjern minus-tegn fra omkostninger)
- Omsætning er positiv, omkostninger er positive (vi ved de er omkostninger fra kategorien)
- Ignorer tomme rækker, totaler, marginer og beregnede felter
- Hvis der er flere budgetår, returnér det seneste
- Ignorer "uforudsete omkostninger" som separat post — inkluder dem i "andet"

Returnér resultatet som et JSON-objekt med denne struktur:
{
  "year": "2025",
  "company_name": "Firmanavn",
  "categories": [
    {
      "key": "omsaetning",
      "label": "Omsætning",
      "monthly": [jan, feb, mar, apr, maj, jun, jul, aug, sep, okt, nov, dec],
      "details": ["Topix salg", "Boardroom salg"]
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
              description: "Extract structured budget data from the Excel content",
              parameters: {
                type: "object",
                properties: {
                  year: { type: "string", description: "Budget year e.g. 2025" },
                  company_name: { type: "string", description: "Company name if found" },
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
                          description: "Original line items that were summed into this category",
                        },
                      },
                      required: ["key", "label", "monthly", "details"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["year", "company_name", "categories"],
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
