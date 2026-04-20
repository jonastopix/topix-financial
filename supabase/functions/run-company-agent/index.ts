import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const SYSTEM_PROMPT = `Du er en proaktiv finansiel sparringspartner for The Boardroom — en platform der hjælper danske iværksættere med at drive bedre virksomheder.

Du handler autonomt når en founder committer en ny rapport. Dit job er at levere én kort, præcis og handlingsorienteret besked der føles personlig og værdifuld — ikke generisk AI-output.

TONE OG STIL:

- Skriv som en erfaren rådgiver der kender founderen — ikke som et regnskabssystem
- Brug fornavnet når du kender det
- Vær direkte. Nævn de konkrete tal. Undgå sætninger som "det er vigtigt at..." eller "man bør overveje..."
- Maks 5 sætninger i chat-beskeden til founder. Kvalitet over kvantitet.
- Skriv altid på dansk

HVAD DU GØR (i rækkefølge):

1. Hent fakta, pulse, milestones, handouts og KPI-mål
2. Analysér: hvad er det vigtigste signal i denne måneds tal? Sammenlign med forrige måned og med mål.
3. Skriv én besked til founder — fokusér på ét nøglefund, ikke fem
4. Opret max ét milestone hvis tallene klart indikerer et specifikt næste skridt
5. Notificér advisor med 2 konkrete observationer og ét spørgsmål til næste møde
6. Kald finish

HVAD DU IKKE GØR:

- Gentag ikke hvad AI-analysen allerede har sagt (den er en detaljeret rapport, din besked er en sparring)
- Opret ikke milestones der allerede eksisterer
- Skriv ikke generiske råd der kunne gælde enhver virksomhed
- Roser ikke bare for at rose — vær ærlig

FORTEGN PÅ TAL (vigtigt):

- revenue, gross_profit, ebt, net_result: positiv = godt, negativ = tab
- cash: positiv = penge i banken, negativ = overtræk
- cogs, payroll, admin_costs: positive tal = omkostninger (højere = dyrere)`;

const tools = [
  {
    type: "function",
    function: {
      name: "get_company_facts",
      description:
        "Henter committede finansielle nøgletal for virksomheden. Returnerer de seneste perioder med revenue, gross_profit, ebt, payroll, cash m.fl.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          limit: { type: "number", default: 6 },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pulse_checkins",
      description:
        "Henter de seneste pulse check-ins fra founder. Viser hvad der gik godt, største udfordring og milestone-fremgang.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          limit: { type: "number", default: 3 },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_milestones",
      description: "Henter aktive milestones for virksomheden med fremgang og deadline.",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" } },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_handout_levers",
      description:
        "Henter virksomhedens handout-status — hvilke vækstmoduler der er aktive og hvilke der er gennemført.",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" } },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kpi_targets",
      description: "Henter de KPI-mål som founder selv har sat. Brug dette til at sammenligne faktiske tal med foundrens egne ambitioner og mål.",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" } },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_vs_actual",
      description:
        "Sammenligner budget med realiserede tal for en given periode. Returnerer afvigelser i procent.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          period_key: { type: "string" },
        },
        required: ["company_id", "period_key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_chat_message",
      description:
        "Skriver en besked i virksomhedens chat-samtale som en system-besked fra agenten. Brug denne til at levere analysen og sparringen til founder.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          content: { type: "string" },
        },
        required: ["company_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_milestone",
      description:
        "Opretter et milestone-forslag til virksomheden baseret på tallene. Brug kun hvis der er et klart rationale.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          deadline_days: { type: "number" },
        },
        required: ["company_id", "title", "description", "category", "deadline_days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_advisor",
      description:
        "Sender en kort Slack-notifikation til virksomhedens tildelte advisor. Skriv en actionable besked på maks 2 sætninger.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          message: { type: "string" },
        },
        required: ["company_id", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Afslutter agentens arbejde. Kald denne når alle opgaver er fuldført.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
      },
    },
  },
];

async function executeTool(name: string, args: any, adminClient: any): Promise<any> {
  switch (name) {
    case "get_company_facts": {
      const limit = args.limit ?? 6;
      const { data, error } = await adminClient
        .from("financial_report_facts")
        .select("period_key, period_label, metrics")
        .eq("company_id", args.company_id)
        .order("period_key", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_pulse_checkins": {
      const limit = args.limit ?? 3;
      const { data, error } = await adminClient
        .from("pulse_checkins")
        .select("period_key, went_well, biggest_challenge, milestone_progress")
        .eq("company_id", args.company_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_milestones": {
      const { data, error } = await adminClient
        .from("milestones")
        .select("id, title, progress, deadline, category")
        .eq("company_id", args.company_id)
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_handout_levers": {
      const { data, error } = await adminClient
        .from("handouts")
        .select("module, status")
        .eq("company_id", args.company_id);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_kpi_targets": {
      // kpi_targets is linked via user_id, find the member first
      const { data: member } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", args.company_id)
        .limit(1)
        .maybeSingle();

      if (!member) return [];

      const { data, error } = await adminClient
        .from("kpi_targets")
        .select("kpi_key, target_value, target_label, lower_is_better")
        .eq("user_id", member.user_id);

      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_budget_vs_actual": {
      const { data: budgetRows, error: budgetErr } = await adminClient
        .from("budget_targets")
        .select("category, budget_amount, period")
        .eq("company_id", args.company_id);
      if (budgetErr) throw new Error(budgetErr.message);

      const { data: factsRow, error: factsErr } = await adminClient
        .from("financial_report_facts")
        .select("metrics")
        .eq("company_id", args.company_id)
        .eq("period_key", args.period_key)
        .maybeSingle();
      if (factsErr) throw new Error(factsErr.message);

      if (!factsRow?.metrics) return [];

      const metrics = factsRow.metrics as Record<string, number>;
      const budgetByCategory: Record<string, number> = {};
      for (const row of budgetRows ?? []) {
        if (row.category === "__template__" || row.category?.startsWith("__")) continue;
        budgetByCategory[row.category] = (budgetByCategory[row.category] ?? 0) + Number(row.budget_amount ?? 0);
      }

      const result: any[] = [];
      for (const [metric, actual] of Object.entries(metrics)) {
        const budget = budgetByCategory[metric];
        if (typeof budget === "number" && budget !== 0 && typeof actual === "number") {
          const diff_pct = ((actual - budget) / Math.abs(budget)) * 100;
          result.push({ metric, budget, actual, diff_pct: Math.round(diff_pct * 10) / 10 });
        }
      }
      return result;
    }

    case "write_chat_message": {
      const { data: conv, error: convErr } = await adminClient
        .from("conversations")
        .select("id, member_id")
        .eq("company_id", args.company_id)
        .maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conv) return { ok: false, reason: "no_conversation" };

      const { data: msg, error: msgErr } = await adminClient
        .from("messages")
        .insert({
          conversation_id: conv.id,
          sender_id: conv.member_id,
          content: args.content,
          message_type: "system",
          context_type: "agent",
          context_meta: { source: "run-company-agent", trigger: "report_committed" },
        })
        .select("id")
        .single();
      if (msgErr) throw new Error(msgErr.message);
      return { ok: true, message_id: msg.id };
    }

    case "create_milestone": {
      const { data: member, error: memberErr } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", args.company_id)
        .limit(1)
        .maybeSingle();
      if (memberErr) throw new Error(memberErr.message);
      if (!member) return { ok: false, reason: "no_member" };

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + Number(args.deadline_days ?? 30));

      const { data: milestone, error: msErr } = await adminClient
        .from("milestones")
        .insert({
          company_id: args.company_id,
          user_id: member.user_id,
          title: args.title,
          description: args.description,
          category: args.category,
          deadline: deadline.toISOString(),
          source: "agent",
          progress: 0,
          status: "active",
        })
        .select("id")
        .single();
      if (msErr) throw new Error(msErr.message);
      return { ok: true, milestone_id: milestone.id };
    }

    case "notify_advisor": {
      const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
      const slackChannel = Deno.env.get("SLACK_ADVISOR_CHANNEL_ID");
      if (!slackToken || !slackChannel) {
        return { ok: false, reason: "slack_not_configured" };
      }
      const resp = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${slackToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ channel: slackChannel, text: args.message }),
      });
      const data = await resp.json();
      if (!data.ok) return { ok: false, reason: data.error ?? "slack_error" };
      return { ok: true };
    }

    case "finish": {
      return { done: true, summary: args.summary };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  const body = await req.json();
  const { company_id, trigger, period_key, period_label } = body;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PERIOD_RE = /^\d{4}-\d{2}$/;

  if (!company_id || !period_key) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing required fields" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!UUID_RE.test(company_id)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid company_id (must be UUID)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!PERIOD_RE.test(period_key)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid period_key (must be YYYY-MM)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Verify caller has RLS access to this company before any admin operations
  const { data: accessCheck } = await callerClient
    .from("companies")
    .select("id")
    .eq("id", company_id)
    .maybeSingle();

  if (!accessCheck) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch company context
    const { data: companyData, error: companyErr } = await adminClient
      .from("companies")
      .select("name, industry_label, cvr_number, start_date")
      .eq("id", company_id)
      .maybeSingle();

    if (companyErr || !companyData) {
      console.error("Company lookup failed", companyErr);
      return new Response(
        JSON.stringify({ ok: false, error: "company_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `VIRKSOMHED: ${companyData.name}

Branche: ${companyData.industry_label || "ukendt"}

Oprettet: ${companyData.start_date ? new Date(companyData.start_date).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : "ukendt"}

Ny rapport: ${period_label} (${period_key})

Start med at kalde get_company_facts, get_pulse_checkins, get_milestones og get_kpi_targets parallelt for at danne dig et komplet billede. Analysér derefter situationen og skriv din besked.`,
      },
    ];

    const MAX_ITERATIONS = 8;
    let iterations = 0;
    let done = false;
    let messageWritten = false;
    let lastError: string | null = null;
    let stopReason: string | null = null;

    while (!done && iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error", response.status, errText);
        lastError = `AI gateway error ${response.status}: ${errText.slice(0, 500)}`;
        stopReason = "ai_gateway_error";
        break;
      }

      const result = await response.json();
      const choice = result.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) {
        stopReason = "no_assistant_message";
        break;
      }

      messages.push(assistantMessage);

      if (!assistantMessage.tool_calls?.length) {
        stopReason = "no_tool_calls";
        break;
      }

      const toolResults: any[] = [];
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          toolArgs = {};
        }

        // Sanitize: always force the verified company_id from the request,
        // never trust the model's value (it sometimes confuses CVR with UUID).
        if (toolName !== "finish" && typeof toolArgs === "object" && toolArgs !== null) {
          toolArgs.company_id = company_id;
        }

        let toolResult: any;
        try {
          toolResult = await executeTool(toolName, toolArgs, adminClient);
        } catch (err) {
          console.error(`Tool ${toolName} failed:`, err);
          toolResult = { error: err instanceof Error ? err.message : "Tool execution failed" };
        }

        if (toolName === "write_chat_message" && toolResult?.ok === true) {
          messageWritten = true;
        }

        if (toolName === "finish") {
          done = true;
        }

        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      messages.push(...toolResults);
    }

    if (!messageWritten) {
      return new Response(
        JSON.stringify({
          ok: false,
          done,
          iterations,
          error: lastError || "Agent fuldførte uden at skrive en chat-besked",
          diagnostics: { stop_reason: stopReason || "max_iterations_reached", message_written: false },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, iterations, done, message_written: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("run-company-agent error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
