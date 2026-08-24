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

    // S1/S2 (scenarie-design): klienten sender kun ikke-tomme linjer, hver
    // med form "fast" | "varierende". Faste vises som kontekst i deres egen
    // prompt-del og indgår IKKE i værktøjets key-enum — modellen kan se
    // omkostningsbasen men kan ikke returnere værdier for dem. Mangler
    // form (ældre kalder), behandles linjen som varierende.
    const varierendeRows = baseRows.filter((r: any) => r.form !== "fast");
    const fasteRows = baseRows.filter((r: any) => r.form === "fast");

    // Prompt-hærdning (BACKLOG [P3], hb-ai-merge-recon §a1): modellen SKAL
    // se de rigtige keys — før viste baseSummary kun labels, og modellen
    // kunne kun gætte sine "key"-returværdier.
    const varierendeSummary = varierendeRows.map((r: any) =>
      `${r.key} — ${r.label} (${r.group}): [${r.values.join(", ")}]`
    ).join("\n");
    const fasteSummary = fasteRows.map((r: any) =>
      `${r.label} (${r.group}): ${r.values[0]} kr./md.`
    ).join("\n");

    const baseKeys = varierendeRows.map((r: any) => r.key);

    const systemPrompt = `Du er en ekspert i dansk budgettering og scenarieanalyse.

Du modtager et base-budget i to dele: linjer der KAN justeres (med 12 månedlige værdier), og faste linjer der IKKE må ændres — de er med, så du kender virksomhedens samlede omkostningsbase.

Din opgave er at foreslå et realistisk ${scenarioLabel} scenarie.

REGLER:
1. For et OPTIMISTISK scenarie: indtægter stiger typisk 10-25 %, og omkostninger der følger aktiviteten stiger med — mens rene besparelser er sjældne. For et PESSIMISTISK: indtægter falder typisk 10-25 %, og aktivitetsafhængige omkostninger falder med, mens andre står fast.
2. Læs hver linjes ETIKET og tolv værdier, og vurdér hvad linjen afhænger af: følger den omsætningen (vareforbrug, gebyrer, provision), er den en beslutning (abonnementer, husleje), eller noget tredje. Skalér kun det der faktisk ville flytte sig i scenariet.
3. Bevar sæsonmønstre fra base-budgettet, men ændr størrelserne.
4. Returnér KUN de linjer du mener skal ændres. En linje der ikke ville flytte sig i scenariet, skal du lade stå — udelad den helt fra svaret.
5. For hver linje du ændrer: giv en KORT dansk begrundelse (én sætning) for netop den ændring.
6. Returnér PRÆCIS de angivne "key"-værdier — feltet FØR "—" på hver linje — ordret og uændret. Find aldrig selv på keys.
7. Alle værdier skal være hele tal (afrundet).
8. De FASTE linjer nederst må du IKKE returnere værdier for — de er kontekst, ikke opgave.`;

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
              content:
                `LINJER DER KAN JUSTERES:\n\n${varierendeSummary}\n\n` +
                (fasteRows.length > 0
                  ? `FASTE LINJER — ÆNDRES IKKE (kun kontekst):\n\n${fasteSummary}\n\n`
                  : "") +
                `Foreslå et ${scenarioLabel} scenarie. Retning: ${scenarioDirection}. ` +
                `Returnér kun de linjer der skal ændres, med en kort begrundelse pr. linje.`,
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
                          key: { type: "string", enum: baseKeys, description: "Kategori-nøgle (kun de justerbare linjer)" },
                          monthly: {
                            type: "array",
                            items: { type: "number" },
                            description: "12 månedlige værdier for linjen i scenariet",
                          },
                          begrundelse: {
                            type: "string",
                            description: "Kort dansk begrundelse (én sætning) for netop denne ændring",
                          },
                        },
                        required: ["key", "monthly", "begrundelse"],
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

      // Hærdet validering (hb-ai-merge-recon §a4): den gamle
      // `!baseRow → false`-gren lod helt umatchede svar passere som
      // "ikke identiske". Nu dømmes KUN over kategorier hvis key findes
      // i base — nul match er sin egen retry-grund.
      const baseKeySet = new Set(baseKeys);
      const matched = (parsed.categories || []).filter((cat: any) => baseKeySet.has(cat.key));

      if (matched.length === 0) {
        console.warn(
          `Attempt ${attempt + 1}: AI returned no matching keys. Received:`,
          (parsed.categories || []).map((cat: any) => cat.key),
        );
        lastError = new Error("AI returned no matching keys");
        continue;
      }

      // S3: modellen må lade linjer stå og returnerer kun dem der ændres —
      // værnet mod stille base-kopi er derfor "MINDST ÉN returneret linje
      // afviger", ikke "alle skal afvige".
      const nogenAfviger = matched.some((cat: any) => {
        const baseRow = baseRows.find((r: any) => r.key === cat.key);
        return JSON.stringify(cat.monthly) !== JSON.stringify(baseRow.values);
      });

      if (!nogenAfviger) {
        console.warn(`Attempt ${attempt + 1}: AI returned identical values`);
        lastError = new Error("AI returned identical values");
        continue;
      }

      // Log change stats
      let changedCount = 0;
      let totalCount = 0;
      for (const cat of matched) {
        const baseRow = baseRows.find((r: any) => r.key === cat.key);
        if (baseRow) {
          for (let i = 0; i < Math.min(cat.monthly.length, baseRow.values.length); i++) {
            totalCount++;
            if (cat.monthly[i] !== baseRow.values[i]) changedCount++;
          }
        }
      }
      console.log(`Matched categories: ${matched.length}/${(parsed.categories || []).length} · Values changed: ${changedCount}/${totalCount}`);

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
