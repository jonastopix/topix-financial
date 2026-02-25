import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const modulePrompts: Record<string, string> = {
  overordnet: `Du er en erfaren forretningsrådgiver der hjælper iværksættere med at sætte klare 12-måneders mål. Analyser medlemmets svar om nuværende situation, mål og motivation. Giv konstruktiv feedback der:
1. Anerkender deres ærlige selvindsigt
2. Udfordrer dem til at være mere specifikke med deres mål
3. Identificerer potentielle blinde vinkler
4. Foreslår konkrete næste skridt`,
  bogholderi: `Du er en ekspert i bogholderi og økonomistyring for små virksomheder. Analyser medlemmets svar om deres bogholderipraksis. Giv feedback der:
1. Anerkender hvad de allerede gør godt
2. Identificerer risici ved manglende processer
3. Foreslår konkrete forbedringer prioriteret efter effekt
4. Giver praktiske tips til automatisering og rutiner`,
  administration: `Du er specialist i drift og procesoptimering for SMV'er. Analyser medlemmets administrative setup. Giv feedback der:
1. Anerkender eksisterende systemer og rutiner
2. Identificerer flaskehalse og dobbeltarbejde
3. Foreslår konkrete SOP'er og automatiseringer
4. Hjælper med prioritering af indsatser`,
  salg: `Du er en erfaren salgscoach for B2B og B2C virksomheder. Analyser medlemmets salgsproces. Giv feedback der:
1. Anerkender deres nuværende salgsindsats
2. Identificerer huller i salgsprocessen
3. Foreslår konkrete forbedringer til pipeline og opfølgning
4. Giver råd om leadgenerering og konvertering`,
  marketing: `Du er marketingekspert med fokus på resultater og ROI. Analyser medlemmets marketingindsats. Giv feedback der:
1. Anerkender deres nuværende kanaler og indsats
2. Identificerer manglende tracking og måling
3. Foreslår fokuserede forbedringer (én ting ad gangen)
4. Giver råd om test-kultur og skalerbare kanaler`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { handout_id, module, company_name, industry } = await req.json();
    if (!handout_id || !module) throw new Error("Missing handout_id or module");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, serviceKey);

    const { data: handout, error: hErr } = await sb
      .from("handouts")
      .select("*, companies:company_id(name, industry)")
      .eq("id", handout_id)
      .single();
    if (hErr || !handout) throw new Error("Handout not found");

    // Use provided values or fall back to DB
    const effectiveCompanyName = company_name || (handout as any).companies?.name || null;
    const effectiveIndustry = industry || (handout as any).companies?.industry || null;

    const responses = handout.responses || {};
    const checklist = handout.checklist || {};
    const levers = handout.levers || [];

    // Build context string
    let context = "";
    if (effectiveCompanyName) context += `VIRKSOMHED: ${effectiveCompanyName}\n`;
    if (effectiveIndustry) context += `BRANCHE: ${effectiveIndustry}\n`;
    context += `MODUL: ${module}\n\nSVAR:\n`;
    for (const [key, value] of Object.entries(responses)) {
      if (value && (value as string).trim()) {
        context += `- ${key}: ${value}\n`;
      }
    }
    context += `\nTJEKLISTE:\n`;
    for (const [key, value] of Object.entries(checklist)) {
      context += `- ${key}: ${value ? "✓" : "✗"}\n`;
    }
    if ((levers as string[]).some((l: string) => l.trim())) {
      context += `\nLØFTESTÆNGER:\n`;
      (levers as string[]).forEach((l: string, i: number) => {
        if (l.trim()) context += `${i + 1}. ${l}\n`;
      });
    }

    const systemPrompt = modulePrompts[module] || modulePrompts.overordnet;

    // Build industry-aware prompt addition
    const industryPrompt = effectiveIndustry
      ? `\n\nMedlemmet driver en virksomhed inden for: ${effectiveIndustry}.${effectiveCompanyName ? ` Virksomheden hedder "${effectiveCompanyName}".` : ""}
Tilpas dine råd og eksempler specifikt til denne branche.
En autoværkstedsejer har andre udfordringer end en webshop eller en konsulentvirksomhed.
Brug branchespecifikke termer, KPI'er og konkrete eksempler fra netop denne branche.`
      : "";

    const qualityGuard = `VIGTIG REGEL: Før du giver feedback, skal du vurdere om svarene er meningsfulde og gennemtænkte. 
Hvis svarene er tilfældige bogstaver, nonsens, copy-paste af spørgsmålet, ekstremt korte (1-2 ord uden substans) eller tydeligt ikke-seriøse:
- Sig det DIREKTE og ærligt. Lad være med at lade som om der er substans hvor der ikke er nogen.
- Forklar at du ikke kan give brugbar feedback på tomme eller tilfældige svar.
- Opfordr dem til at bruge 10-15 minutter på at reflektere og svare ærligt, så du kan give reel værdi.
- Vær venlig men bestemt — lad ALDRIG som om tilfældige bogstaver er "ærlig selvindsigt" eller "et godt udgangspunkt".

Kun hvis svarene faktisk indeholder reel substans, skal du følge instruktionerne nedenfor.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${qualityGuard}\n\n${systemPrompt}${industryPrompt}\n\nSvar ALTID på dansk. Vær konkret og handlingsorienteret. Hold dig under 500 ord.` },
          { role: "user", content: `Her er medlemmets svar:\n\n${context}\n\nVurdér først kvaliteten af svarene, og giv derefter passende feedback.` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit nået, prøv igen om lidt." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Betalingskrævet, tilføj credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const feedbackText = aiData.choices?.[0]?.message?.content || "Ingen feedback modtaget.";

    // Save feedback to handout
    await sb.from("handouts").update({
      ai_feedback: { text: feedbackText },
      ai_feedback_at: new Date().toISOString(),
    }).eq("id", handout_id);

    return new Response(JSON.stringify({ feedback: feedbackText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("handout-ai-feedback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
