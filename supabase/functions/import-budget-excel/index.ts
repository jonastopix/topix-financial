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

Du modtager indholdet af en Excel-fil (parset som tekst/CSV).
Din opgave er at udtrække budgetdata præcist og bevare så mange
detaljer som muligt.

TRIN 1: IDENTIFICÉR ALLE BUDGETÅR
Find alle år der har budgettal (f.eks. 2025 OG 2026).
Returnér hvert år separat.

TRIN 2: FOR HVERT ÅR — UDTRÉK ALLE POSTER MED MÅNEDLIGE BELØB
Bevar ALLE budgetlinjer som separate kategorier når det giver mening.
Sammenlæg kun poster der er indholdsmæssigt identiske.

TRIN 3: BRUG DISSE KATEGORINØGLER (vælg den mest præcise):

INDTÆGTER:
- "omsaetning" — Omsætning, nettoomsætning, salg, honorar, MRR

VARIABLE OMKOSTNINGER:
- "vareforbrug" — Vareforbrug, COGS, indkøb af varer, råvarer, materialer
- "fragt_levering" — Fragt, levering, forsendelse, porto, transport af varer
- "betalingsgebyrer" — Betalingsgebyrer, kortgebyrer, Stripe, MobilePay
- "underleverandoerer" — Underleverandører, underentreprenører, ekstern produktion

PERSONALE:
- "loenninger" — Lønninger, personaleomkostninger, medarbejdere, A-løn
- "freelance_konsulenter" — Freelancere, konsulenter, honorarer til ekstern arbejdskraft
- "uddannelse" — Kurser, uddannelse, kompetenceudvikling, certificeringer

SALG & MARKETING:
- "digital_marketing" — Digital marketing, Meta Ads, Google Ads, SoMe-annoncering
- "seo_content" — SEO, content marketing, blogging, tekstforfatter
- "email_marketing" — E-mail marketing, nyhedsbrev, Klaviyo, Mailchimp
- "lokal_marketing" — Lokal markedsføring, flyers, skilte, lokale events
- "salg_kundepleje" — Salg, CRM, salgspersonale, kundearrangementer
- "rejser_repraesentant" — Rejser, repræsentation, messer, kundebesøg, hotel

DRIFT:
- "platform_tech" — Webshop-platform, Shopify, WooCommerce, hosting
- "tech_software" — Software, licenser, SaaS-abonnementer, IT-værktøjer
- "hosting_infra" — Hosting, cloud, AWS, infrastruktur, servere
- "booking_tech" — Booking-system, kasse-system, POS
- "lager_logistik" — Lagerleje, lagerhold, 3PL, pakkeri
- "koeretoej_braendstof" — Køretøjer, firmabil, brændstof, leasing af bil
- "maskiner_vaerktoj" — Maskiner, udstyr, værktøj, inventar

FASTE OMKOSTNINGER:
- "lokaler" — Husleje, kontorleje, lokaler (generisk)
- "lokaler_husleje" — Butikshusleje, butiksleje, butikslokale
- "lokaler_vaerksted" — Værksted, produktionslokale, lagerbygning
- "forsikring" — Forsikringer (generisk)
- "forsikring_abonnementer" — Forsikring + diverse abonnementer
- "admin_regnskab" — Administration, regnskab, revisor, bogføring, juridisk
- "telefon_internet" — Telefon, mobilabonnement, internet, kommunikation
- "andet" — Alt der ikke passer i ovenstående kategorier

REGLER:
- Beløb skal ALTID være POSITIVE tal
- Ignorer totaler, subtotaler, marginer og beregnede felter
- Ignorer tomme rækker
- Bevar granularitet: "Fragt" og "Vareforbrug" skal IKKE slås sammen
- Hvis en post er uklar, brug "andet" frem for at gætte forkert
- Returnér kun kategorier med faktiske tal (ikke tomme kategorier)

RETURNÉR JSON med denne struktur:
{
  "company_name": "Firmanavn hvis det fremgår",
  "years": [
    {
      "year": "2025",
      "categories": [
        {
          "key": "omsaetning",
          "label": "Omsætning",
          "monthly": [jan, feb, mar, apr, maj, jun, jul, aug, sep, okt, nov, dec],
          "details": ["Specificerede underposter fundet i filen"]
        }
      ]
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
                                  "fragt_levering",
                                  "betalingsgebyrer",
                                  "underleverandoerer",
                                  "loenninger",
                                  "freelance_konsulenter",
                                  "uddannelse",
                                  "digital_marketing",
                                  "seo_content",
                                  "email_marketing",
                                  "lokal_marketing",
                                  "salg_kundepleje",
                                  "rejser_repraesentant",
                                  "platform_tech",
                                  "tech_software",
                                  "hosting_infra",
                                  "booking_tech",
                                  "lager_logistik",
                                  "koeretoej_braendstof",
                                  "maskiner_vaerktoj",
                                  "lokaler",
                                  "lokaler_husleje",
                                  "lokaler_vaerksted",
                                  "forsikring",
                                  "forsikring_abonnementer",
                                  "admin_regnskab",
                                  "telefon_internet",
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
