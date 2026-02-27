import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Post-processing validation ──────────────────────────────────────────────
interface ValidationCheck {
  name: string;
  result: "PASS" | "FAIL" | "SKIP";
  details: string;
}

function runPostProcessingValidation(extractedData: any): { status: string; checks: ValidationCheck[] } {
  const kf = extractedData?.key_figures;
  if (!kf) return { status: "SKIP", checks: [] };

  const checks: ValidationCheck[] = [];
  const TOLERANCE = 2; // 2 kr tolerance

  // 1. Dækningsbidrag = omsætning - direkte_omkostninger
  if (kf.omsaetning != null && kf.direkte_omkostninger != null && kf.daekningsbidrag != null) {
    const expected = kf.omsaetning - kf.direkte_omkostninger;
    const diff = Math.abs(expected - kf.daekningsbidrag);
    const pass = diff <= TOLERANCE;
    checks.push({
      name: "daekningsbidrag_sum",
      result: pass ? "PASS" : "FAIL",
      details: pass
        ? `OK: ${kf.omsaetning} - ${kf.direkte_omkostninger} = ${expected} ≈ ${kf.daekningsbidrag}`
        : `MISMATCH: ${kf.omsaetning} - ${kf.direkte_omkostninger} = ${expected}, men daekningsbidrag = ${kf.daekningsbidrag} (diff ${diff.toFixed(2)})`,
    });
  } else {
    checks.push({ name: "daekningsbidrag_sum", result: "SKIP", details: "Mangler felter til beregning" });
  }

  // 2. Resultat-konsistens: resultat_foer_skat bør være lavere end dækningsbidrag (i P&L)
  if (kf.resultat_foer_skat != null && kf.daekningsbidrag != null && extractedData.report_type === "resultatopgørelse") {
    // Resultat should be lower than dækningsbidrag (costs subtract from gross margin)
    const sensible = kf.resultat_foer_skat <= kf.daekningsbidrag + TOLERANCE;
    checks.push({
      name: "resultat_consistency",
      result: sensible ? "PASS" : "FAIL",
      details: sensible
        ? `OK: resultat (${kf.resultat_foer_skat}) ≤ daekningsbidrag (${kf.daekningsbidrag})`
        : `WARNING: resultat (${kf.resultat_foer_skat}) > daekningsbidrag (${kf.daekningsbidrag}) — mulig fejl`,
    });
  } else {
    checks.push({ name: "resultat_consistency", result: "SKIP", details: "Ikke relevant / mangler data" });
  }

  // 3. Balance-ligning (kun saldobalance)
  if (extractedData.report_type === "saldobalance" && kf.aktiver_i_alt != null && kf.passiver_i_alt != null) {
    const diff = Math.abs(kf.aktiver_i_alt - kf.passiver_i_alt);
    const pass = diff <= TOLERANCE;
    checks.push({
      name: "balance_equation",
      result: pass ? "PASS" : "FAIL",
      details: pass
        ? `OK: aktiver (${kf.aktiver_i_alt}) ≈ passiver (${kf.passiver_i_alt})`
        : `MISMATCH: aktiver (${kf.aktiver_i_alt}) ≠ passiver (${kf.passiver_i_alt}), diff ${diff.toFixed(2)}`,
    });
  } else {
    checks.push({ name: "balance_equation", result: "SKIP", details: "Ikke saldobalance eller mangler felter" });
  }

  // Derive overall status
  const hasFailure = checks.some((c) => c.result === "FAIL");
  const allSkip = checks.every((c) => c.result === "SKIP");
  const status = hasFailure ? "FAIL" : allSkip ? "SKIP" : "PASS";

  return { status, checks };
}

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

    const { reportId, fileContent, pageImages, fileName, overwrite, knownCompanyName } = await req.json();

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
TRIN 6: DANSK TALFORMAT
═══════════════════════════════════════════════════
Dokumenter bruger dansk talformat:
- Tusindtalsseparator: "." (punkt) — f.eks. 1.234.567
- Decimalseparator: "," (komma) — f.eks. 1.234,56
- Negative tal kan angives med minus "-1.234,56" ELLER parenteser "(1.234,56)"
- Parenteser = negativt tal: (1.234,56) = -1234.56
- Returnér som rene tal UDEN tusindtalsseparatorer: 1234567.89 (brug punktum som decimalseparator i output).

═══════════════════════════════════════════════════
TRIN 7: LINE_ITEMS MED KLASSIFICERING
═══════════════════════════════════════════════════
Medtag de 15-25 vigtigste poster. For HVER linje:
- name: postens navn som det fremgår
- period_amount: PERIODENS tal (behold originalt fortegn)
- ytd_amount: ÅR-TIL-DATO tal (behold originalt fortegn)
- raw_sign: "PLUS" hvis tallet er positivt i dokumentet, "MINUS" hvis negativt
- account_no: kontonummer hvis det fremgår, ellers null
- class: klassificér posten som én af:
  REVENUE, COGS, OPEX, DEPR, FIN_INCOME, FIN_EXPENSE, TAX, ASSET, LIABILITY, EQUITY
  Hvis du er usikker → sæt class til "UKLASSIFICERET"

═══════════════════════════════════════════════════
TRIN 8: VALIDERING (KØR INDEN DU RETURNERER)
═══════════════════════════════════════════════════
Før du kalder funktionen, kør disse checks og rapportér i validation-objektet:

1. daekningsbidrag_sum: Tjek at omsaetning - direkte_omkostninger ≈ daekningsbidrag (tolerance 2 kr.)
2. resultat_consistency: Tjek at resultat_foer_skat ≤ daekningsbidrag (i en resultatopgørelse)
3. balance_equation: Tjek at aktiver_i_alt ≈ passiver_i_alt (kun saldobalance, tolerance 2 kr.)

Sæt validation.status til:
- "PASS" hvis alle relevante checks bestod
- "FAIL" hvis mindst ét check fejlede
- "UNSURE" hvis du er i tvivl om et tals korrekthed

Hvis du er i tvivl om et tal eller en kolonne → sæt validation.status = "UNSURE" og beskriv usikkerheden i checks.`;

    // Build user message — prefer images (vision) for accurate table reading
    let userContent: any;
    if (pageImages && Array.isArray(pageImages) && pageImages.length > 0) {
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
            { role: "user", content: userContent },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_financial_data",
                description:
                  "Udtrækker nøjagtigt aflæste nøgletal fra en dansk saldobalance eller resultatopgørelse med validering",
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
                          name: { type: "string", description: "Postens navn som det fremgår i dokumentet" },
                          period_amount: { type: "number", description: "Periodens tal (originalt fortegn)" },
                          ytd_amount: { type: "number", description: "År-til-dato tal (originalt fortegn)" },
                          raw_sign: {
                            type: "string",
                            enum: ["PLUS", "MINUS"],
                            description: "Det originale fortegn i dokumentet for period_amount",
                          },
                          account_no: {
                            type: "string",
                            description: "Kontonummer hvis det fremgår, ellers null",
                          },
                          class: {
                            type: "string",
                            enum: ["REVENUE", "COGS", "OPEX", "DEPR", "FIN_INCOME", "FIN_EXPENSE", "TAX", "ASSET", "LIABILITY", "EQUITY", "UKLASSIFICERET"],
                            description: "Standardiseret regnskabsklassificering",
                          },
                        },
                        required: ["name", "period_amount", "ytd_amount", "raw_sign", "class"],
                      },
                    },
                    validation: {
                      type: "object",
                      description: "AI-sidens valideringsresultat af de udtrukkede tal",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["PASS", "FAIL", "UNSURE"],
                          description: "Overordnet status: PASS=alle checks ok, FAIL=mindst ét fejlede, UNSURE=i tvivl om et tal",
                        },
                        checks: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Check-navn: daekningsbidrag_sum, resultat_consistency, balance_equation" },
                              result: { type: "string", enum: ["PASS", "FAIL", "SKIP"] },
                              details: { type: "string", description: "Kort forklaring af resultatet" },
                            },
                            required: ["name", "result", "details"],
                          },
                        },
                      },
                      required: ["status", "checks"],
                    },
                  },
                  required: [
                    "report_type",
                    "report_period",
                    "company_name",
                    "cvr_number",
                    "key_figures",
                    "line_items",
                    "validation",
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

    // Override company name if provided by caller (prevents AI hallucination)
    if (knownCompanyName) {
      console.log(`Overriding AI company_name "${extractedData.company_name}" with known: "${knownCompanyName}"`);
      extractedData.company_name = knownCompanyName;
    }

    // === Post-processing: Normalize signs ===
    const kf = extractedData.key_figures;
    if (kf) {
      const expenseFields = ['loenninger', 'direkte_omkostninger', 'marketing', 'lokaler', 'admin', 'tech_software', 'afskrivninger'];
      for (const field of expenseFields) {
        if (kf[field] != null && kf[field] < 0) {
          console.log(`Normalizing ${field}: ${kf[field]} → ${Math.abs(kf[field])}`);
          kf[field] = Math.abs(kf[field]);
        }
      }

      for (const field of ['omsaetning', 'omsaetning_aar']) {
        if (kf[field] != null && kf[field] < 0) {
          console.log(`Normalizing ${field}: ${kf[field]} → ${Math.abs(kf[field])}`);
          kf[field] = Math.abs(kf[field]);
        }
      }

      // NEVER touch resultat fields — their sign is meaningful
      console.log(`[CFO Extraction] Period: ${extractedData.report_period}`);
      console.log(`  omsaetning: ${kf.omsaetning}, resultat_foer_skat: ${kf.resultat_foer_skat}`);
      console.log(`  omsaetning_aar: ${kf.omsaetning_aar}, resultat_foer_skat_aar: ${kf.resultat_foer_skat_aar}`);
    }

    // === Post-processing: Server-side validation ===
    const serverValidation = runPostProcessingValidation(extractedData);
    const aiValidation = extractedData.validation;

    // Merge: if AI said PASS but server found FAIL → override to FAIL
    let finalStatus = aiValidation?.status || serverValidation.status;
    if (serverValidation.status === "FAIL") {
      finalStatus = "FAIL";
    }
    // If AI said UNSURE, keep UNSURE even if server checks pass
    if (aiValidation?.status === "UNSURE" && finalStatus === "PASS") {
      finalStatus = "UNSURE";
    }

    extractedData.validation = {
      status: finalStatus,
      ai_checks: aiValidation?.checks || [],
      server_checks: serverValidation.checks,
    };

    // Log validation results
    console.log(`[Validation] Status: ${finalStatus}`);
    for (const check of serverValidation.checks) {
      if (check.result === "FAIL") {
        console.warn(`[Validation FAIL] ${check.name}: ${check.details}`);
      } else {
        console.log(`[Validation ${check.result}] ${check.name}: ${check.details}`);
      }
    }

    // Check for duplicate report (same company, same period)
    if (reportId) {
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

        if (existing && existing.length > 0 && overwrite) {
          for (const old of existing) {
            await supabase.from("milestones").delete().eq("source_report", old.id);
            await supabase.from("financial_reports").delete().eq("id", old.id);
          }
          console.log(`Overwrote ${existing.length} existing report(s) + associated milestones for ${extractedData.report_period}`);
        }
      }

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
