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
    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { baseRows, scenario } = await req.json();

    if (!baseRows || !Array.isArray(baseRows) || !scenario) {
      throw new Error("baseRows (array) and scenario ('optimistisk' | 'pessimistisk') are required");
    }

    const scenarioLabel = scenario === "optimistisk" ? "optimistisk" : "pessimistisk";
    const scenarioDirection = scenario === "optimistisk"
      ? "bedre end forventet (vækst, effektivisering, øget salg)"
      : "værre end forventet (faldende salg, stigende omkostninger, forsinkelser)";

    const baseSummary = baseRows.map((r: any) => 
      `${r.label} (${r.group}): [${r.values.join(", ")}]`
    ).join("\n");

    const systemPrompt = `Du er en ekspert i dansk budgettering og scenarieanalyse.

Du modtager et base-budget med 12 månedlige værdier per kategori.
Din opgave er at generere et realistisk ${scenarioLabel} scenarie.

REGLER:
1. For et OPTIMISTISK scenarie: Øg indtægter med 10-25%, reducer variable omkostninger med 5-15%, fasthold eller let reducer faste omkostninger.
2. For et PESSIMISTISK scenarie: Reducer indtægter med 10-25%, øg variable omkostninger med 5-15%, fasthold eller let øg faste omkostninger.
3. Bevar sæsonmønstre fra base-budgettet men ændr størrelserne.
4. Justeringerne skal være realistiske og varierede — ikke blot en flad procentjustering.
5. Personaleomkostninger ændres minimalt (2-5%).
6. Returnér PRÆCIS samme kategorier med samme "key" værdier.
7. Alle værdier skal være hele tal (afrundet).
8. Hvert tal SKAL være forskelligt fra base-budgettet.`;

    const MAX_ATTEMPTS = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      console.log(`Attempt ${attempt + 1}/${MAX_ATTEMPTS}, scenario:`, scenarioLabel, "categories:", baseRows.length);

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
              content: `Her er base-budgettet:\n\n${baseSummary}\n\nGenerer et ${scenarioLabel} scenarie. Retning: ${scenarioDirection}.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_scenario",
                description: `Genererer et ${scenarioLabel} budget-scenarie med ændrede tal i forhold til base-budgettet`,
                parameters: {
                  type: "object",
                  properties: {
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string", description: "Kategori-nøgle (samme som base)" },
                          monthly: {
                            type: "array",
                            items: { type: "number" },
                            description: "12 månedlige værdier - skal være forskellige fra base",
                          },
                        },
                        required: ["key", "monthly"],
                      },
                    },
                    reasoning: {
                      type: "string",
                      description: "Kort dansk forklaring af de vigtigste justeringer (2-3 sætninger)",
                    },
                  },
                  required: ["categories", "reasoning"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_scenario" } },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        throw new Error("No tool call in AI response");
      }

      const parsed = JSON.parse(toolCall.function.arguments);

      // Validate that AI actually changed the numbers
      const isIdentical = (parsed.categories || []).every((cat: any) => {
        const baseRow = baseRows.find((r: any) => r.key === cat.key);
        if (!baseRow) return false;
        return JSON.stringify(cat.monthly) === JSON.stringify(baseRow.values);
      });

      if (isIdentical) {
        console.warn(`Attempt ${attempt + 1}: AI returned identical values`);
        lastError = new Error("AI returned identical values");
        continue;
      }

      // Log change stats
      let changedCount = 0;
      let totalCount = 0;
      for (const cat of (parsed.categories || [])) {
        const baseRow = baseRows.find((r: any) => r.key === cat.key);
        if (baseRow) {
          for (let i = 0; i < Math.min(cat.monthly.length, baseRow.values.length); i++) {
            totalCount++;
            if (cat.monthly[i] !== baseRow.values[i]) changedCount++;
          }
        }
      }
      console.log(`Values changed: ${changedCount}/${totalCount}`);

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw lastError || new Error("Failed to generate scenario after retries");
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
