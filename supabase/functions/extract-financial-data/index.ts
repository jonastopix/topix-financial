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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
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

    const { reportId, fileContent, fileName, overwrite } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const systemPrompt = `Du er en ekspert i dansk regnskab og bogføring. Du modtager det rå tekstindhold fra en dansk finansiel rapport (saldobalance eller resultatopgørelse).

DIN OPGAVE: Udtræk NØJAGTIGE tal fra dokumentet. Opfind ALDRIG tal. Hvis et tal ikke kan findes, udelad feltet.

VIGTIGE REGLER FOR KORREKT AFLÆSNING:

1. RAPPORTTYPE — Bestem typen ud fra indholdet:
   - "saldobalance": Indeholder kontonumre, debitor/kreditor-kolonner, balance-poster (aktiver, passiver, egenkapital)
   - "resultatopgørelse": Indeholder primært omsætning, omkostninger, bruttofortjeneste, resultat
   - Filnavnet "${fileName || ''}" kan give hint, men INDHOLDET bestemmer typen

2. FORTEGN — I dansk regnskab:
   - Omsætning/indtægter vises ofte som NEGATIVE tal (kreditposter). Konvertér dem til POSITIVE tal.
   - Omkostninger vises ofte som POSITIVE tal (debetposter). Behold dem som positive.
   - Resultat: Overskud = positiv, Underskud = negativ
   - Aktiver: normalt positive
   - Passiver/gæld: kan vises som negative (kreditside) — returner som POSITIVE tal

3. PERIODER — Dokumentet har typisk TO kolonner med tal:
   - "Perioden" / "Faktisk" (venstre kolonne): Tal for EN ENKELT MÅNED
   - "År til dato" / "Å.t.d." (højre kolonne): Akkumulerede tal fra årets start
   - Rapportperioden: skriv den som "August 2025", "Oktober 2025" etc.

4. KRITISK: PERIOD vs. ÅR TIL DATO
   - key_figures SKAL indeholde PERIODENS tal (den enkelte måned), IKKE år-til-dato-tal.
   - Felter der slutter på "_aar" (f.eks. omsaetning_aar, resultat_foer_skat_aar) skal indeholde år-til-dato-tal.
   - Hvis en post har 0,00 i periodekolonnen, så er værdien 0 for den måned — brug IKKE år-til-dato-værdien i stedet!
   - Eksempel: Hvis "Gager" viser "0,00" i perioden og "-135.238,14" i år-til-dato, så er loenninger=0 (IKKE 135238).

5. NØGLETAL — Udtræk kun det du FAKTISK kan se i dokumentet:
    - omsaetning: Total omsætning/nettoomsætning FOR PERIODEN (den enkelte måned)
    - omsaetning_aar: Omsætning år til dato
    - direkte_omkostninger: Vareforbrug/produktionsomkostninger FOR PERIODEN
    - daekningsbidrag: Bruttofortjeneste/dækningsbidrag FOR PERIODEN
    - daekningsbidrag_aar: Dækningsbidrag år til dato
    - loenninger: Personaleomkostninger/lønninger FOR PERIODEN
    - marketing: Salgs- og marketingomkostninger FOR PERIODEN
    - lokaler: Lokaleomkostninger FOR PERIODEN
    - admin: Administrative omkostninger FOR PERIODEN
    - afskrivninger: Af- og nedskrivninger FOR PERIODEN
    - resultat_foer_skat: Resultat før skat FOR PERIODEN
    - resultat_foer_skat_aar: Resultat før skat å.t.d.
    - resultat_efter_skat: Resultat efter skat FOR PERIODEN
    - resultat_efter_skat_aar: Resultat efter skat å.t.d.
    - aktiver_i_alt: Sum af aktiver (kun saldobalance)
    - passiver_i_alt: Sum af passiver (kun saldobalance)
    - egenkapital: Egenkapital i alt (kun saldobalance)
    - bank_balance: Likvide beholdninger/bank
    - debitorer: Tilgodehavender fra salg
    - kreditorer: Leverandørgæld

6. KATEGORISERING AF OMKOSTNINGER:
    - "marketing": Saml ALLE salgs- og marketingrelaterede poster FOR PERIODEN
    - "lokaler": Saml ALLE lokaleomkostninger FOR PERIODEN
    - "admin": Saml ALLE administrative/kontoromkostninger FOR PERIODEN
    - Hvis en post kan tilhøre flere kategorier, vælg den mest specifikke

7. BELØB — Returnér som rene tal UDEN tusindtalsseparatorer. Eksempel: 1234567.89

8. LINE_ITEMS — Medtag de 15-20 vigtigste poster med korrekte beløb. Brug PERIODENS tal for period_amount og ÅR-TIL-DATO for ytd_amount.`;

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
              content: `Filnavn: ${fileName || 'ukendt'}\n\nHer er det rå indhold fra dokumentet:\n\n${fileContent}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_financial_data",
                description:
                  "Udtrækker nøjagtigt aflæste nøgletal fra en dansk saldobalance eller resultatopgørelse",
                parameters: {
                  type: "object",
                  properties: {
                    report_type: {
                      type: "string",
                      enum: ["saldobalance", "resultatopgørelse"],
                      description: "Bestem ud fra indholdet — IKKE kun filnavnet",
                    },
                    report_period: { 
                      type: "string",
                      description: "F.eks. 'Oktober 2025'. Angiv den måned rapporten primært dækker.",
                    },
                    company_name: { type: "string" },
                    cvr_number: { type: "string" },
                    key_figures: {
                      type: "object",
                      properties: {
                        omsaetning: { type: "number" },
                        omsaetning_aar: { type: "number" },
                        direkte_omkostninger: { type: "number" },
                        daekningsbidrag: { type: "number" },
                        daekningsbidrag_aar: { type: "number" },
                        loenninger: { type: "number" },
                        marketing: { type: "number", description: "Salgs- og marketingomkostninger samlet" },
                        lokaler: { type: "number", description: "Lokaleomkostninger samlet (husleje, el, vand, etc.)" },
                        admin: { type: "number", description: "Administrative omkostninger samlet (kontor, telefon, forsikring, revisor, etc.)" },
                        afskrivninger: { type: "number", description: "Af- og nedskrivninger" },
                        resultat_foer_skat: { type: "number" },
                        resultat_foer_skat_aar: { type: "number" },
                        resultat_efter_skat: { type: "number" },
                        resultat_efter_skat_aar: { type: "number" },
                        aktiver_i_alt: { type: "number" },
                        passiver_i_alt: { type: "number" },
                        egenkapital: { type: "number" },
                        bank_balance: { type: "number" },
                        debitorer: { type: "number" },
                        kreditorer: { type: "number" },
                      },
                    },
                    line_items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          period_amount: { type: "number" },
                          ytd_amount: { type: "number" },
                        },
                        required: ["name", "period_amount", "ytd_amount"],
                      },
                    },
                  },
                  required: [
                    "report_type",
                    "report_period",
                    "company_name",
                    "cvr_number",
                    "key_figures",
                    "line_items",
                  ],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_financial_data" },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørgsler. Prøv igen om lidt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter opbrugt. Tilføj flere i indstillinger." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("AI returned no tool call");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    // Check for duplicate report (same user, same period, same type)
    if (reportId) {
      // Get the current report's user_id
      const { data: currentReport } = await supabase
        .from("financial_reports")
        .select("user_id")
        .eq("id", reportId)
        .single();

      if (currentReport) {
        const { data: existing } = await supabase
          .from("financial_reports")
          .select("id, report_period")
          .eq("user_id", currentReport.user_id)
          .eq("report_period", extractedData.report_period)
          .eq("status", "processed")
          .neq("id", reportId);

        if (existing && existing.length > 0 && !overwrite) {
          // Delete the new (duplicate) report record
          await supabase.from("financial_reports").delete().eq("id", reportId);

          return new Response(
            JSON.stringify({
              duplicate: true,
              existing_period: extractedData.report_period,
              existing_report_id: existing[0].id,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // If overwriting, delete the old report(s) for that period
        if (existing && existing.length > 0 && overwrite) {
          for (const old of existing) {
            await supabase.from("financial_reports").delete().eq("id", old.id);
          }
          console.log(`Overwrote ${existing.length} existing report(s) for ${extractedData.report_period}`);
        }
      }

      // Update the report record with extracted data
      const { error: updateError } = await supabase
        .from("financial_reports")
        .update({
          report_type: extractedData.report_type,
          report_period: extractedData.report_period,
          company_name: extractedData.company_name,
          cvr_number: extractedData.cvr_number,
          extracted_data: extractedData,
          processed_at: new Date().toISOString(),
          status: "processed",
        })
        .eq("id", reportId);

      if (updateError) {
        console.error("DB update error:", updateError);
      }
    }

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-financial-data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
