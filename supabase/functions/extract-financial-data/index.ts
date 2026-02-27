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

    const { reportId, fileContent, pageImages, fileName, overwrite } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const systemPrompt = `Du er en erfaren CFO der læser danske finansielle rapporter fra bogføringssystemer som e-conomic, Dinero, Billy osv.

DIN ROLLE: Du aflæser tal PRÆCIST som de fremgår af dokumentet og normaliserer dem til en standardiseret format. Du opfinder ALDRIG tal.

═══════════════════════════════════════════════════
TRIN 1: IDENTIFICÉR RAPPORTTYPEN
═══════════════════════════════════════════════════
- "resultatopgørelse": Viser omsætning, omkostninger, bruttofortjeneste, resultat. Typisk fra e-conomic.
- "saldobalance": Viser kontonumre med debet/kredit-kolonner, balance-poster.
- Filnavnet "${fileName || ''}" kan give hint, men INDHOLDET bestemmer typen.

═══════════════════════════════════════════════════
TRIN 2: FORSTÅ KOLONNE-STRUKTUREN
═══════════════════════════════════════════════════
Danske resultatopgørelser har typisk FIRE talkolonner:
  Kolonne 1: "Perioden Faktisk" — den enkelte måneds tal
  Kolonne 2: "Perioden Året før" — samme måned sidste år  
  Kolonne 3: "År til dato Faktisk" — akkumuleret indeværende år
  Kolonne 4: "År til dato Året før" — akkumuleret sidste år

DU SKAL BRUGE:
- Kolonne 1 ("Perioden Faktisk") til alle periodefeltter (omsaetning, loenninger, resultat_foer_skat osv.)
- Kolonne 3 ("År til dato Faktisk") til alle _aar-felter (omsaetning_aar, resultat_foer_skat_aar osv.)

KRITISK: Læs kolonnenumrene fra VENSTRE mod HØJRE. Forveksl IKKE "Perioden Faktisk" med "Perioden Året før"!

═══════════════════════════════════════════════════
TRIN 3: REGNSKABSKONVENTIONER FOR FORTEGN
═══════════════════════════════════════════════════
I dansk bogføring (specielt e-conomic resultatopgørelser):

A) OMSÆTNING/INDTÆGTER:
   - Kan stå som POSITIVE tal (normalt i resultatopgørelser)
   - Kan stå som NEGATIVE tal (kreditside i saldobalancer)
   - → RETURNÉR ALTID SOM POSITIVT TAL (brug absolutværdi)

B) OMKOSTNINGER (løn, varekøb, marketing, lokaler, admin, afskrivninger):
   - Står typisk som NEGATIVE tal (f.eks. -11.205,94)
   - → RETURNÉR ALTID SOM POSITIVT TAL (brug absolutværdi)

C) RESULTAT (resultat_foer_skat, resultat_efter_skat, driftsresultat):
   - ⚠️ AFLÆS NØJAGTIGT SOM DET STÅR I DOKUMENTET — ÆNDR ALDRIG FORTEGNET! ⚠️
   - Negativt tal = UNDERSKUD/TAB (f.eks. -26.169,42 betyder tab)
   - Positivt tal = OVERSKUD (f.eks. 400.831,54 betyder overskud)
   - Find linjen "Resultat før skat" eller "Resultat for skat" og aflæs PRÆCIST fra den korrekte kolonne
   - Inkluderer ALLE omkostninger inkl. finansieringsomkostninger (renter, gebyrer mv.)

D) BALANCE-POSTER (aktiver, passiver, egenkapital, bank):
   - Aktiver: returnér som positive
   - Passiver/gæld: returnér som positive (selvom de står som negative/kredit)
   - Bank/likvider: returnér som positive (selvom de står som negative/kredit)
   - Egenkapital: behold fortegn som det er (negativ egenkapital er mulig)

═══════════════════════════════════════════════════
TRIN 4: PERIODE vs. ÅR TIL DATO
═══════════════════════════════════════════════════
- Felter UDEN "_aar" = PERIODENS tal (én enkelt måned fra Kolonne 1)
- Felter MED "_aar" = År-til-dato tal (fra Kolonne 3)
- Hvis en post viser 0,00 i periodekolonnen, er værdien 0 — brug IKKE år-til-dato!

═══════════════════════════════════════════════════
TRIN 5: RAPPORTPERIODE
═══════════════════════════════════════════════════
- Skriv som "December 2025", "Oktober 2025" osv.
- Bestem ud fra datoer i dokumenthovedet (f.eks. "01.12.25 - 31.12.25" = December 2025)

═══════════════════════════════════════════════════
BELØBSFORMAT
═══════════════════════════════════════════════════
Returnér som rene tal UDEN tusindtalsseparatorer: 1234567.89 (brug punktum som decimalseparator).

═══════════════════════════════════════════════════
LINE_ITEMS
═══════════════════════════════════════════════════
Medtag de 15-20 vigtigste poster. Brug PERIODENS tal for period_amount og ÅR-TIL-DATO for ytd_amount. Behold originale fortegn.`;

    // Build user message — prefer images (vision) for accurate table reading
    let userContent: any;
    if (pageImages && Array.isArray(pageImages) && pageImages.length > 0) {
      // Multimodal: send page images + text context
      const imageParts = pageImages.map((base64: string) => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64}` },
      }));
      userContent = [
        { type: "text", text: `Filnavn: ${fileName || 'ukendt'}\n\nHerunder er siderne fra dokumentet som billeder. Aflæs tabellerne VISUELT og vær omhyggelig med at skelne "Perioden"/"Faktisk" kolonnen (venstre) fra "År til dato" kolonnen (højre). Supplerende tekstudtræk:\n\n${(fileContent || '').slice(0, 5000)}` },
        ...imageParts,
      ];
      console.log(`Sending ${pageImages.length} page images to AI (vision mode)`);
    } else {
      // Fallback: text only
      userContent = `Filnavn: ${fileName || 'ukendt'}\n\nHer er det rå indhold fra dokumentet:\n\n${fileContent}`;
      console.log("Sending text-only content to AI (no images available)");
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
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: userContent,
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
                        tech_software: { type: "number", description: "IT, software, hosting" },
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

    // === Post-processing: Normalize signs ===
    const kf = extractedData.key_figures;
    if (kf) {
      // Ensure expense fields are stored as positive values (absolute)
      const expenseFields = ['loenninger', 'direkte_omkostninger', 'marketing', 'lokaler', 'admin', 'tech_software', 'afskrivninger'];
      for (const field of expenseFields) {
        if (kf[field] != null && kf[field] < 0) {
          console.log(`Normalizing ${field}: ${kf[field]} → ${Math.abs(kf[field])}`);
          kf[field] = Math.abs(kf[field]);
        }
      }
      
      // Ensure omsaetning fields are positive
      for (const field of ['omsaetning', 'omsaetning_aar']) {
        if (kf[field] != null && kf[field] < 0) {
          console.log(`Normalizing ${field}: ${kf[field]} → ${Math.abs(kf[field])}`);
          kf[field] = Math.abs(kf[field]);
        }
      }

      // Ensure daekningsbidrag_aar is also normalized if negative (it follows omsaetning convention)
      // but daekningsbidrag for period can be legitimately negative

      // NEVER touch resultat fields — their sign is meaningful (negative = loss, positive = profit)
      console.log(`[CFO Extraction] Period: ${extractedData.report_period}`);
      console.log(`  omsaetning: ${kf.omsaetning}, resultat_foer_skat: ${kf.resultat_foer_skat}`);
      console.log(`  omsaetning_aar: ${kf.omsaetning_aar}, resultat_foer_skat_aar: ${kf.resultat_foer_skat_aar}`);
    }

    // Check for duplicate report (same company, same period)
    if (reportId) {
      // Get the current report's company_id
      const { data: currentReport } = await supabase
        .from("financial_reports")
        .select("company_id")
        .eq("id", reportId)
        .single();

      if (currentReport) {
        const { data: existing } = await supabase
          .from("financial_reports")
          .select("id, report_period")
          .eq("company_id", currentReport.company_id)
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

        // If overwriting, delete the old report(s) and their associated milestones
        if (existing && existing.length > 0 && overwrite) {
          for (const old of existing) {
            // Delete milestones created from this report
            await supabase.from("milestones").delete().eq("source_report", old.id);
            // Delete handout_lever_milestones referencing those milestones
            // (cascade should handle it, but milestones deletion covers it)
            // Delete the old report itself
            await supabase.from("financial_reports").delete().eq("id", old.id);
          }
          console.log(`Overwrote ${existing.length} existing report(s) + associated milestones for ${extractedData.report_period}`);
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
