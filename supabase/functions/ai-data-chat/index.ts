import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const SYSTEM_PROMPT = `Du er en finansiel sparringspartner for en dansk virksomhedsejer i The Boardroom.
Du har adgang til virksomhedens komplette finansielle historik nedenfor.
Du har også adgang til virksomhedens aktive milestones og handout-status, som du kan inddrage når det er relevant.
Svar altid på dansk. Vær konkret og referer til de faktiske tal.
Brug danske talformater (punktum som tusindtalsseparator, komma som decimaltegn).
Hold svar kortfattede — max 4-6 sætninger medmindre brugeren beder om mere.
Du må ikke opfinde tal der ikke er i dataen.
Hvis der ingen finansielle data er endnu, skal du forklare det venligt og opfordre brugeren til at uploade en rapport under Rapportering. Giv IKKE generiske finansielle råd uden data.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  const { company_id, messages } = await req.json() as {
    company_id: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };
  if (!company_id || !messages?.length) {
    return new Response(JSON.stringify({ error: "company_id and messages required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify access via RLS
  const { data: company } = await callerClient
    .from("companies").select("name").eq("id", company_id).maybeSingle();
  if (!company) {
    return new Response(JSON.stringify({ error: "Access denied" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all committed facts for the company (RLS-scoped)
  const { data: facts } = await callerClient
    .from("financial_report_facts")
    .select("period_key, period_label, metrics")
    .eq("company_id", company_id)
    .order("period_key", { ascending: true });

  // Serialize facts as compact context
  const factsContext = (facts || []).map(f => {
    const m = f.metrics as Record<string, number | null>;
    const lines = Object.entries(m)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `  ${k}: ${(v as number).toLocaleString("da-DK", { maximumFractionDigits: 0 })}`)
      .join("\n");
    return `${f.period_label} (${f.period_key}):\n${lines}`;
  }).join("\n\n");

  // Fetch active milestones
  const { data: milestones } = await callerClient
    .from("milestones")
    .select("title, deadline, progress, status, category, target_value, current_value, unit")
    .eq("company_id", company_id)
    .lt("progress", 100)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(10);

  // Fetch handout status
  const { data: handouts } = await callerClient
    .from("handouts")
    .select("module, status")
    .eq("company_id", company_id);

  const milestonesContext = (milestones || []).length > 0
    ? "\n\nAKTIVE MILESTONES:\n" + (milestones || []).map(m => {
        const deadline = m.deadline
          ? new Date(m.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })
          : "ingen";
        return `- ${m.title}: ${m.progress}% fremgang${(m as any).target_value && (m as any).unit ? ` (${(m as any).current_value ?? 0}/${(m as any).target_value} ${(m as any).unit})` : ""}, deadline: ${deadline}`;
      }).join("\n")
    : "";

  const handoutModuleLabels: Record<string, string> = {
    overordnet: "Målsætning 12 mdr.", bogholderi: "Bogholderi",
    administration: "Administration", salg: "Salg", marketing: "Marketing",
  };
  const handoutsContext = (handouts || []).length > 0
    ? "\n\nHANDOUT-STATUS:\n" + (handouts || []).map(h =>
        `- ${handoutModuleLabels[h.module] || h.module}: ${h.status === "completed" ? "gennemført" : h.status === "in_progress" ? "i gang" : "ikke startet"}`
      ).join("\n")
    : "";

  const { data: kpiTargets } = await callerClient
    .from("kpi_targets")
    .select("kpi_key, target_value, target_label")
    .eq("company_id", company_id);

  const kpiTargetsContext = (kpiTargets || []).length > 0
    ? "\n\nKPI-MÅL:\n" + kpiTargets!.map(k =>
        `- ${k.target_label || k.kpi_key}: mål ${k.target_value}`
      ).join("\n")
    : "";

  const systemWithData = `${SYSTEM_PROMPT}\n\nVIRKSOMHED: ${company.name}\n\nFINANSIELLE DATA:\n${factsContext || "Ingen data endnu."}${milestonesContext}${handoutsContext}${kpiTargetsContext}`;

  // Call Lovable AI Gateway with streaming
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemWithData },
        ...messages,
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "For mange forespørgsler — prøv igen om lidt." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI-kreditter opbrugt." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    return new Response(JSON.stringify({ error: "AI-fejl" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(response.body, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
});
