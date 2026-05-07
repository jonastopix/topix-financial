import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

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

    const { fileContent, growthPercent = 0 } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (!fileContent || typeof fileContent !== "string") {
      throw new Error("fileContent (base64 PDF or text) is required");
    }

    const systemPrompt = `Du er en ekspert i dansk regnskab. Du modtager indholdet fra en dansk resultatopgørelse eller årsregnskab.

DIN OPGAVE: Læs HVER ENESTE linje i resultatopgørelsen og generer et komplet 12-måneders budget for det kommende år.

REGLER:
1. Identificér ALLE poster i resultatopgørelsen — udelad ingenting.
2. Gruppér posterne i budget-kategorier. Brug disse nøgler:
   - "omsaetning" for al omsætning/revenue
   - "vareforbrug" for vareforbrug/COGS
   - "loenninger" for lønninger og personale
   - "marketing" for salg, marketing, annoncering
   - "lokaler" for husleje, el, vand, varme, lokaleomkostninger
   - "tech_software" for IT, software, licenser
   - "admin" for admin, revisor, forsikring, kontor
   - "afskrivninger" for af- og nedskrivninger
   - "finansielle" for renteindtægter og -udgifter
   - "betalingsgebyrer" for betalingsgebyrer
   - "fragt_levering" for fragt og levering
   - For alt andet, brug et beskrivende key (snake_case, kun a-z og underscore)

3. For HVER kategori:
   - Angiv det totale årsbeløb du læser fra regnskabet
   - Fordel beløbet på 12 måneder. Brug sæsonkorrektion hvis muligt (f.eks. højere omsætning i Q4 for retail), ellers fordel jævnt.
   - Omsætning skal altid være POSITIVE tal
   - Omkostninger skal altid være POSITIVE tal (vi ved de er udgifter ud fra kategorien)

4. Angiv hvilket regnskabsår dataene stammer fra.

5. Angiv de originale linjer fra regnskabet der er inkluderet i hver kategori.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
              content: `Her er indholdet fra regnskabet/resultatopgørelsen:\n\n${fileContent}\n\nGenerer et komplet 12-måneders budget baseret på disse tal.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_budget",
                description: "Genererer et 12-måneders budget fra en resultatopgørelse",
                parameters: {
                  type: "object",
                  properties: {
                    source_year: {
                      type: "string",
                      description: "Regnskabsåret dataene stammer fra, f.eks. '2025'",
                    },
                    company_name: {
                      type: "string",
                      description: "Virksomhedsnavnet hvis det kan aflæses",
                    },
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: {
                            type: "string",
                            description: "Kategori-nøgle (snake_case, f.eks. 'omsaetning', 'loenninger')",
                          },
                          label: {
                            type: "string",
                            description: "Dansk label (f.eks. 'Omsætning', 'Lønninger')",
                          },
                          group: {
                            type: "string",
                            enum: ["indtaegter", "variable", "personale", "salg_marketing", "drift", "faste"],
                            description: "Budget-gruppe",
                          },
                          annual_amount: {
                            type: "number",
                            description: "Totalt årsbeløb fra regnskabet (altid positivt)",
                          },
                          monthly: {
                            type: "array",
                            items: { type: "number" },
                            description: "12 månedsbeløb (Jan-Dec), altid positive",
                          },
                          source_lines: {
                            type: "array",
                            items: { type: "string" },
                            description: "De originale linjer fra regnskabet der indgår i denne kategori",
                          },
                        },
                        required: ["key", "label", "group", "annual_amount", "monthly", "source_lines"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["source_year", "categories"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "generate_budget" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørgsler. Prøv igen om lidt." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter opbrugt. Tilføj flere i indstillinger." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("AI returned no structured budget data");
    }

    const budgetData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(budgetData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-budget-from-accounts error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
