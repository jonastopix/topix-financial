import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const SYSTEM_PROMPT = `Du er en proaktiv finansiel sparringspartner for The Boardroom — en platform der hjælper danske iværksættere med at drive bedre virksomheder.

Du handler autonomt når et event sker for en founder (rapport-commit, pulse-refleksion, anomali, onboarding eller ugentlig gennemgang). Dit job er at levere én kort, præcis og handlingsorienteret besked der føles personlig og værdifuld — ikke generisk AI-output. Brug ALTID den korrekte terminologi for det aktuelle event (rapport, refleksion, etc.) — bland aldrig event-typer.

DATAKVALITET — VIGTIGT: Når du kalder get_company_facts, vil hvert fact have et 'data_quality' felt:
- 'rigtig_månedlig_rapport': Rigtige tal fra founders uploadede rapport — brug frit til analyse
- 'estimat_fra_årsrapport_divideret_med_12': Årstal divideret jævnt med 12 — tallene er IDENTISKE hver måned, så kommenter IKKE på månedlige variationer eller stabilitet i disse perioder. Brug dem kun til årssammenligning og historisk kontekst.
- 'estimat_fra_baseline': Auto-genereret baseline — brug kun som kontekst, ikke som grundlag for konkrete anbefalinger

Når du sammenligner perioder: Tjek altid data_quality. Sig fx "Sammenlignet med dit årsregnskab for 2025..." i stedet for "I december 2025 så vi at..." når dataen er et årsestimat.

TONE OG STIL:

- Skriv som en erfaren rådgiver der kender founderen — ikke som et regnskabssystem
- Brug fornavnet når du kender det
- Vær direkte. Nævn de konkrete tal. Undgå sætninger som "det er vigtigt at..." eller "man bør overveje..."
- Maks 5 sætninger i chat-beskeden til founder. Kvalitet over kvantitet.
- Skriv altid på dansk
- Tilpas din tone til virksomhedens alder: 0-6 mdr = validér og opmuntr, 6-18 mdr = fokusér på vækstmønstre, 2+ år = strategisk og udfordrende

HVAD DU GØR (i rækkefølge):

1. Hent fakta, pulse, milestones, handouts og KPI-mål
2. Analysér: hvad er det vigtigste signal i denne måneds tal? Sammenlign med forrige måned og med mål.
3. Opdatér weekly focus-kortet på dashboardet med en kort overskrift og opsummering
4. Skriv én besked til founder i chatten — fokusér på ét nøglefund, ikke fem
5. Opret én konkret handlingsopgave med write_company_action hvis der er et klart næste skridt founder skal tage inden for de næste 7 dage
6. Opret max ét milestone hvis tallene klart indikerer et specifikt næste skridt
7. Notificér advisor med 2 konkrete observationer og ét spørgsmål til næste møde
8. Hvis der er emner der kræver menneskelig sparring, kald write_session_prep med 3 konkrete punkter til næste møde
9. Kald finish

HVAD DU IKKE GØR:

- Kald altid get_previous_agent_messages som dit første tool-kald
- Hvis du tidligere har anbefalet noget specifikt (fx "fokusér på at øge dækningsbidraget"), og tallene nu viser fremgang eller tilbagegang på netop det punkt, så nævn det eksplicit: "Sidst anbefalede jeg X — her er hvad der er sket"
- Skriv aldrig det samme som du sagde sidst — men referer gerne til det
- Gentag ikke hvad AI-analysen allerede har sagt (den er en detaljeret rapport, din besked er en sparring)
- Opret ikke milestones der allerede eksisterer
- Skriv ikke generiske råd der kunne gælde enhver virksomhed
- Roser ikke bare for at rose — vær ærlig
- Hvis get_budget_vs_actual viser afvigelser over 20%, skal dette altid nævnes konkret i din besked — det er det founder har brug for at vide
- Hvis get_handout_levers viser et relevant ugennemført modul der matcher en udfordring i tallene, nævn det som et konkret næste skridt
- Analyser altid den periode der er angivet i triggeren (period_key) — ikke den nyeste periode. Når en founder backfiller gamle rapporter, er det den committede periode der er relevant, ikke den seneste i databasen.

FORTEGN PÅ TAL (vigtigt):

- revenue, gross_profit, ebt, net_result: positiv = godt, negativ = tab
- cash: positiv = penge i banken, negativ = overtræk
- cogs, payroll, admin_costs: positive tal = omkostninger (højere = dyrere)

REGLER FOR notify_advisor (KRITISK):

- Beskeden er en NEUTRAL OPSUMMERING + KONKRET FORSLAG, ikke en fortælling.
- ALDRIG skriv i første person om handlinger du har udført. Du foreslår, du udfører ikke. Skriv ALDRIG "Han har fået...", "Jeg har bedt ham...", "Jeg har anbefalet...", "Jeg har sat...", "Han har modtaget...". Skriv i stedet "Foreslår at..." eller "Det kunne være relevant at...".
- ALDRIG forveksle event-typer. Hvis trigger er pulse_submitted, brug ordet "refleksion" eller "pulse". Brug ALDRIG ordet "rapport" om en refleksion.
- ALDRIG forveksle perioder. Refleksionen vedrører den periode der er angivet i det aktuelle event — referer ALDRIG til en anden måned eller periode i notifikationen, selvom du har data fra andre perioder via get_company_facts.

REGLER FOR HVORDAN DU MÅ BRUGE FACTS i notify_advisor:

- Du må kun knytte fakta (omsætning, cash, debitorer, etc.) til SPECIFIKKE temaer founder nævner i sin refleksion. Specifik = founder bruger ord der direkte refererer til det fact ("omsætning", "kunder", "ansatte", "cash flow", "likviditet", "salg", "debitorer", "udgifter", "pipeline", etc.).
- Hvis founders refleksion er VAG ("det går godt", "det går super godt", "det kunne være bedre", "kunder", "ro", "udfordringer" uden specifik kontekst), så MÅ DU IKKE knytte den til finansielle facts. Gentag i stedet hvad founder skrev som det er, og foreslå advisor spørger ind for at få mere konkret indsigt.
- Hvis du knytter et fact, skal det være DIREKTE og IKKE-FABRIKERET relateret til hvad founder skrev. Ingen koblinger der "lyder rimelige" - kun reelle.
- Format: [hvad founder rapporterede i denne event, evt. med 1-2 relevante facts hvis temaet er specifikt] + [konkret forslag til advisor].

Eksempler på KORREKT notify_advisor besked for pulse_submitted:

Specifik refleksion + relevant fact:
"Founder Jonas rapporterer at omsætningen har været presset i maj. Facts viser et fald på 12% fra april. Foreslår at I drøfter pipeline-status og kommende ordrer i jeres næste session."

Vag refleksion - ingen facts:
"Founder Jonas rapporterer at 'det går super godt' i maj, men er kortfattet i sin refleksion. Foreslår at I spørger ind til hvad der specifikt går godt og hvordan han ser udviklingen fremover."

Eksempler på FORKERT notify_advisor besked for pulse_submitted:

Forkert (rapport-forveksling + fabrikerede tal + første person):
"Jonas har sendt aprils rapport. Omsætning faldt med 59%. Jeg har bedt ham kontakte ubetalte kunder."

Forkert (vag refleksion koblet til facts + forkert periode + 'han har fået'):
"Jonas rapporterer at 'det går super godt' og hans cash flow er forbedret til 29.364 DKK i april. Han har fået en opgave om at evaluere sin likviditetsstyring."
(Forkert af fire grunde: 'det går super godt' er vagt og må ikke kobles til cash flow; refleksion er for maj, ikke april; skriver 'Han har fået' som om handling er udført; har fabrikeret en kobling der ikke giver mening.)`;

const tools = [
  {
    type: "function",
    function: {
      name: "get_company_facts",
      description:
        "Henter committede finansielle nøgletal for virksomheden sorteret med nyeste først. Bemærk: facts[0] er den seneste periode — men ved report_committed trigger skal du primært analysere den periode der matcher period_key fra triggeren, ikke automatisk den nyeste.",
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
        "Henter virksomhedens handout-status. Brug dette til at identificere om der er et handout-modul der er relevant for de udfordringer tallene viser — fx hvis cash flow er kritisk og 'Likviditetsstyring'-modulet ikke er gennemført, nævn det konkret i din besked.",
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
      name: "get_previous_agent_messages",
      description: "Henter agentens egne tidligere beskeder til denne virksomhed. Brug dette FØR du skriver en ny besked, så du ikke gentager observationer du allerede har delt. Se hvad der er sagt og fokusér på noget nyt.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          limit: { type: "number", description: "Antal tidligere beskeder, standard 3" },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_industry_benchmark",
      description: "Henter anonymiserede gennemsnit for virksomhedens branche baseret på andre virksomheder på platformen. Brug dette til at sætte tallene i kontekst — fx 'din bruttomargin er over/under gennemsnittet for din branche'.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          period_key: { type: "string" },
        },
        required: ["company_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_alerts",
      description: "Henter aktive finansielle alerts for virksomheden — fx omsætningsfald, bankovertræk eller negativt resultat. Brug dette til at prioritere hvad der er mest kritisk at adressere i din besked.",
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
      name: "get_application_context",
      description: "Henter ansøgningsdata for virksomheden — nuværende situation, mål, hvad de søger hjælp til, og omsætningstal. Brug dette ved onboarding for at skrive en personlig velkomst der tager udgangspunkt i hvad founder selv har skrevet.",
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
        "Skriver en besked i virksomhedens chat-samtale. Standard: system-besked fra agenten (grå boks). Sæt as_advisor=true for at sende beskeden som en almindelig chat-besked fra den tildelte rådgiver (med navn og avatar) — brug dette til velkomstbeskeden ved onboarding.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          content: { type: "string" },
          as_advisor: { type: "boolean", description: "Hvis true, sendes beskeden som rådgiver (sender_id = assigned_advisor_id, message_type=user). Default false." },
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
      name: "update_milestone_progress",
      description: "Opdaterer fremgangen på et eksisterende milestone baseret på de faktiske tal. Brug KUN hvis tallene klart viser fremgang mod et specifikt milestone-mål — fx omsætningsmilestone der nærmer sig målet.",
      parameters: {
        type: "object",
        properties: {
          milestone_id: { type: "string", description: "ID fra get_milestones" },
          progress: { type: "number", description: "Ny fremgang 0-100" },
          reason: { type: "string", description: "Kort forklaring på hvorfor" },
        },
        required: ["milestone_id", "progress", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_advisor",
      description:
        "Notificerer den tildelte advisor (in-app + Slack) om det aktuelle event. Maks 2 sætninger. Format: [neutral opsummering af hvad founder rapporterede i dette specifikke event] + [konkret forslag til opfølgning]. ALDRIG i første person om udførte handlinger. ALDRIG forveksle event-typer (refleksion vs rapport). ALDRIG citer tal der ikke var i founders input.",
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
      name: "write_session_prep",
      description: "Gemmer 3 konkrete punkter som advisor bør tage op til næste session med founder. Brug dette når du har identificeret vigtige emner der kræver menneskelig sparring. Punkterne vises direkte i advisor-dashboardet.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          points: {
            type: "array",
            items: { type: "string" },
            description: "Præcis 3 punkter. Maks 15 ord per punkt. Konkrete og handlingsorienterede.",
          },
        },
        required: ["company_id", "points"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_weekly_focus",
      description: "Opdaterer ugens fokus-kort på member's dashboard. Brug dette til at sætte en kort, handlingsorienteret overskrift og opsummering baseret på rapporten. Det er det første founder ser når de logger ind.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          headline: { type: "string", description: "Maks 8 ord. Direkte og konkret — fx 'Omsætning op 23% — hold momentum i salg'" },
          summary: { type: "string", description: "2-3 sætninger. Hvad betyder tallene og hvad er næste skridt?" },
        },
        required: ["company_id", "headline", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_company_action",
      description: "Opretter en konkret handlingsopgave i virksomhedens action center på dashboardet. Brug kun til ét klart, specifikt næste skridt — fx 'Ring til din bank om kreditfacilitet' eller 'Opdatér din salgspipeline inden fredag'. Maks 1 action per kørsel.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          title: { type: "string", description: "Handlingen i imperativ form. Maks 10 ord." },
          context: { type: "string", description: "Kort forklaring på hvorfor. Maks 20 ord." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["company_id", "title", "context", "priority"],
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

async function executeTool(name: string, args: any, adminClient: any, trigger: string): Promise<any> {
  switch (name) {
    case "get_company_facts": {
      const limit = args.limit ?? 6;
      const { data, error } = await adminClient
        .from("financial_report_facts")
        .select("period_key, period_label, metrics, source_type")
        .eq("company_id", args.company_id)
        .order("period_key", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      // Annotate each fact with its data quality so the agent can reason correctly
      return (data ?? []).map((f: any) => ({
        ...f,
        data_quality: ["canonical", "canonical_v2", "manual"].includes(f.source_type)
          ? "rigtig_månedlig_rapport"
          : f.source_type === "annual_report"
            ? "estimat_fra_årsrapport_divideret_med_12"
            : f.source_type === "manual_baseline"
              ? "estimat_fra_baseline"
              : f.source_type,
      }));
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
        .select("id, member_id, assigned_advisor_id")
        .eq("company_id", args.company_id)
        .maybeSingle();
      if (convErr) throw new Error(convErr.message);
      if (!conv) return { ok: false, reason: "no_conversation" };

      const asAdvisor = args.as_advisor === true;
      let senderId: string = conv.member_id;
      let messageType = "system";
      let contextType: string | null = "agent";
      let contextMeta: Record<string, unknown> | null = { source: "run-company-agent", trigger };

      if (asAdvisor) {
        let advisorId: string | null = conv.assigned_advisor_id ?? null;
        if (!advisorId) {
          const { data: advisorRole } = await adminClient
            .from("user_roles")
            .select("user_id")
            .in("role", ["advisor", "admin"])
            .limit(1)
            .maybeSingle();
          advisorId = advisorRole?.user_id ?? null;
        }
        if (!advisorId) return { ok: false, reason: "no_advisor_available" };
        senderId = advisorId;
        messageType = "user";
        contextType = null;
        contextMeta = null;
      }

      const { data: msg, error: msgErr } = await adminClient
        .from("messages")
        .insert({
          conversation_id: conv.id,
          sender_id: senderId,
          content: args.content,
          message_type: messageType,
          context_type: contextType,
          context_meta: contextMeta,
        })
        .select("id")
        .single();
      if (msgErr) throw new Error(msgErr.message);
      return { ok: true, message_id: msg.id };
    }

    case "create_milestone": {
      // Check for existing milestone with similar title (broader dedup)
      const titleWords = args.title.toLowerCase().split(" ").slice(0, 3).join(" ");
      const { data: existingMilestones } = await adminClient
        .from("milestones")
        .select("id, title")
        .eq("company_id", args.company_id)
        .eq("status", "active");
      
      const duplicate = (existingMilestones ?? []).find(m =>
        m.title.toLowerCase().includes(titleWords) ||
        args.title.toLowerCase().includes(m.title.toLowerCase().split(" ").slice(0, 3).join(" "))
      );
      
      if (duplicate) return { ok: false, reason: "milestone_already_exists", id: duplicate.id };

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
      // Find assigned advisor for this company
      const { data: conv } = await adminClient
        .from("conversations")
        .select("assigned_advisor_id, member_id")
        .eq("company_id", args.company_id)
        .maybeSingle();

      const advisorId = conv?.assigned_advisor_id;
      const memberId = conv?.member_id;

      // Company name + trigger-aware title so the notification reflects the
      // actual event (not always "ny rapport") and Slack carries context.
      const { data: company } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", args.company_id)
        .maybeSingle();
      const companyName = company?.name || "Virksomhed";

      const titleByTrigger: Record<string, string> = {
        pulse_submitted: "AI-agent har reageret på refleksion",
        weekly_cron: "AI-agents ugentlige gennemgang",
        anomaly_detected: "AI-agent har detekteret anomali",
        onboarding: "AI-agent har modtaget ny founder",
        report_committed: "AI-agent har analyseret ny rapport",
      };
      const notificationTitle = titleByTrigger[trigger] || "AI-agent har analyseret ny rapport";

      // In-app notification (always, regardless of Slack)
      if (advisorId) {
        await adminClient
          .from("advisor_notifications")
          .insert({
            type: "agent_insight",
            title: notificationTitle,
            body: args.message,
            company_id: args.company_id,
            member_id: memberId || advisorId,
            advisor_id: advisorId || null,
            reference_type: "agent",
          });
      }

      // Slack notification (best effort)
      const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
      const slackChannel = Deno.env.get("SLACK_ADVISOR_CHANNEL_ID");
      if (slackToken && slackChannel) {
        const resp = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${slackToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ channel: slackChannel, text: `*${companyName}*: ${args.message}` }),
        });
        const data = await resp.json();
        if (!data.ok) console.warn("Slack notification failed:", data.error);
      }

      return { ok: true, in_app: !!advisorId, slack: !!(slackToken && slackChannel) };
    }

    case "update_weekly_focus": {
      const now = new Date();
      const dayNum = now.getUTCDay() || 7;
      const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1 - dayNum));
      const yearStart = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((monday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      const weekKey = `${monday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;

      const { error } = await adminClient
        .from("weekly_focus")
        .upsert({
          company_id: args.company_id,
          week_key: weekKey,
          status: "active",
          headline: args.headline,
          summary: args.summary,
          triggers_fired: [trigger],
          trigger_data: { trigger },
          actions_generated: 1,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: "company_id,week_key" });

      if (error) throw new Error(error.message);
      return { ok: true, week_key: weekKey };
    }

    case "write_session_prep": {
      const points = (args.points as string[]).slice(0, 3);
      const now = new Date();

      const { data: conv } = await adminClient
        .from("conversations")
        .select("id, assigned_advisor_id, member_id")
        .eq("company_id", args.company_id)
        .maybeSingle();
      if (!conv) return { ok: false, reason: "no_conversation" };

      // Store as a pinned system message so advisor sees it in chat
      const content = `**Forbered til næste session:**\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;

      const { error } = await adminClient
        .from("messages")
        .insert({
          conversation_id: conv.id,
          sender_id: conv.member_id,
          content,
          message_type: "system",
          context_type: "session_prep",
          context_meta: { source: "run-company-agent", points, generated_at: now.toISOString() },
        });

      if (error) throw new Error(error.message);
      return { ok: true, points_count: points.length };
    }

    case "update_milestone_progress": {
      const progress = Math.min(100, Math.max(0, Number(args.progress)));
      const { error } = await adminClient
        .from("milestones")
        .update({
          progress,
          status: progress >= 100 ? "completed" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.milestone_id);
      if (error) throw new Error(error.message);
      return { ok: true, milestone_id: args.milestone_id, new_progress: progress };
    }

    case "write_company_action": {
      const { data: member } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", args.company_id)
        .limit(1)
        .maybeSingle();
      if (!member) return { ok: false, reason: "no_member" };

      const { error } = await adminClient
        .from("company_actions")
        .insert({
          company_id: args.company_id,
          user_id: member.user_id,
          title: args.title,
          context: args.context,
          priority: args.priority,
          source_type: "agent",
          status: "open",
        } as any);

      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "finish": {
      return { done: true, summary: args.summary };
    }

    case "get_previous_agent_messages": {
      const limit = args.limit ?? 3;
      const { data: conv } = await adminClient
        .from("conversations")
        .select("id")
        .eq("company_id", args.company_id)
        .maybeSingle();
      if (!conv) return [];

      const { data, error } = await adminClient
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", conv.id)
        .eq("context_type", "agent")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(m => ({
        content: m.content.slice(0, 300),
        date: new Date(m.created_at).toLocaleDateString("da-DK", { month: "long", year: "numeric" }),
      }));
    }

    case "get_industry_benchmark": {
      // Find this company's industry
      const { data: company } = await adminClient
        .from("companies")
        .select("industry_label")
        .eq("id", args.company_id)
        .maybeSingle();
      if (!company?.industry_label) return { available: false, reason: "no_industry_set" };

      // Find other companies in same industry (exclude this company)
      const { data: peers } = await adminClient
        .from("companies")
        .select("id")
        .eq("industry_label", company.industry_label)
        .neq("id", args.company_id)
        .eq("status", "active");
      if (!peers || peers.length < 3) {
        return { available: false, reason: "too_few_peers", count: peers?.length ?? 0 };
      }
      const peerIds = peers.map(p => p.id);

      // Get latest facts for peers
      const { data: peerFacts } = await adminClient
        .from("financial_report_facts")
        .select("company_id, metrics")
        .in("company_id", peerIds)
        .order("period_key", { ascending: false });

      // Take only the most recent fact per company
      const latestPerCompany = new Map<string, Record<string, number>>();
      for (const f of peerFacts ?? []) {
        if (!latestPerCompany.has(f.company_id)) {
          latestPerCompany.set(f.company_id, f.metrics as Record<string, number>);
        }
      }
      if (latestPerCompany.size < 3) {
        return { available: false, reason: "too_few_peers_with_data" };
      }

      // Use ratios not absolute values — otherwise large companies dominate averages
      const ratios: { gross_margin_pct: number | null; ebt_margin_pct: number | null; payroll_pct: number | null } = {
        gross_margin_pct: null,
        ebt_margin_pct: null,
        payroll_pct: null,
      };
      const grossMargins: number[] = [];
      const ebtMargins: number[] = [];
      const payrollPcts: number[] = [];
      for (const m of latestPerCompany.values()) {
        if (m.revenue && m.revenue > 0) {
          if (m.gross_profit != null) grossMargins.push((m.gross_profit / m.revenue) * 100);
          if (m.ebt != null) ebtMargins.push((m.ebt / m.revenue) * 100);
          if (m.payroll != null) payrollPcts.push((m.payroll / m.revenue) * 100);
        }
      }
      const avg = (arr: number[]) => arr.length >= 3
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : null;
      ratios.gross_margin_pct = avg(grossMargins);
      ratios.ebt_margin_pct = avg(ebtMargins);
      ratios.payroll_pct = avg(payrollPcts);

      return {
        available: true,
        industry: company.industry_label,
        peer_count: latestPerCompany.size,
        ratios,
        note: "Anonymiserede gennemsnit — ratioer, ikke absolutte tal. Minimum 3 virksomheder.",
      };
    }

    case "get_financial_alerts": {
      // Find the member user_id for this company
      const { data: member } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", args.company_id)
        .limit(1)
        .maybeSingle();
      if (!member) return [];

      const { data, error } = await adminClient
        .from("notifications")
        .select("type, title, body, created_at")
        .eq("company_id", args.company_id)
        .eq("user_id", member.user_id)
        .in("type", ["alert_revenue_drop", "alert_negative_cash", "alert_result_negative"])
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "get_application_context": {
      const { data, error } = await adminClient
        .from("companies")
        .select("application_context, start_date, industry_label, cvr_number")
        .eq("id", args.company_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.application_context) return { available: false };
      return { available: true, ...data.application_context, industry_label: data.industry_label, start_date: data.start_date };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

  let callerClient: any;
  if (isServiceRole) {
    // Internal call from weekly cron or other edge functions — trust fully
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    callerClient = createClient(supabaseUrl, anonKey);
  } else {
    // User-triggered call — validate JWT
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    callerClient = auth.callerClient;
  }

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

  // Pulse-refleksion: advisor faar en deterministisk template-notifikation fra
  // send-slack-report-notification, saa agenten skal IKKE have notify_advisor.
  // Arkitektonisk haandhaevelse - prompt-instruktion alene virkede ikke (Gemini
  // kaldte notify_advisor alligevel trods eksplicit forbud i PR #63).
  // write_company_action og create_milestone fjernes ogsaa - refleksion er
  // founderens stille check-in, ikke en handlings-trigger.
  const POOL_BLOCKLIST: Record<string, string[]> = {
    pulse_submitted: ["notify_advisor", "write_company_action", "create_milestone"],
  };
  const blocked = POOL_BLOCKLIST[trigger] ?? [];
  const activeTools = blocked.length
    ? tools.filter((t) => !blocked.includes(t.function.name))
    : tools;
  if (blocked.length) {
    console.log(`[run-company-agent] trigger=${trigger} blocking tools: ${blocked.join(", ")} (${activeTools.length}/${tools.length} tools available)`);
  }

  // Verify caller has RLS access to this company before any admin operations
  if (!isServiceRole) {
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

    // Fetch founder's first name
    const { data: memberData } = await adminClient
      .from("company_members")
      .select("user_id")
      .eq("company_id", company_id)
      .limit(1)
      .maybeSingle();

    let founderFirstName = "du";
    if (memberData?.user_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", memberData.user_id)
        .maybeSingle();

      if (profile?.full_name) {
        founderFirstName = profile.full_name.split(" ")[0];
      }
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `VIRKSOMHED: ${companyData.name}

Founders fornavn: ${founderFirstName}

Branche: ${companyData.industry_label || "ukendt"}

Oprettet: ${companyData.start_date ? new Date(companyData.start_date).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : "ukendt"}
Virksomhedens alder: ${companyData.start_date ? (() => { const months = Math.floor((Date.now() - new Date(companyData.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)); return months < 6 ? `${months} måneder (tidlig fase)` : months < 18 ? `${months} måneder (vækstfase)` : `${Math.floor(months/12)} år (moden fase)`; })() : "ukendt"}

${trigger === "pulse_submitted" 
  ? `Founder har netop afleveret månedlig REFLEKSION (pulse check-in) for ${period_label}. Dette er IKKE en rapport, og refleksionen vedrører UDELUKKENDE ${period_label}.\n\nHent refleksions-svaret med get_pulse_checkins. Du må hente facts med get_company_facts hvis du vil knytte dem til chat-svaret til founder.\n\nSkriv en kort personlig respons i founderens chat med write_chat_message og **as_advisor: true** (så beskeden vises som fra rådgiveren, ikke som grå system-boks). Tag udgangspunkt i hvad founder selv har skrevet i deres REFLEKSION — særligt deres største udfordring. Foreslå ét konkret næste skridt. Opdatér weekly focus.\n\nKALD IKKE notify_advisor for denne trigger. Advisor får automatisk en separat template-notifikation med refleksionens fulde indhold (sendes af send-slack-report-notification), så din opgave her er KUN at give founder en god chat-respons og opdatere weekly focus. Du må heller ikke kalde write_company_action, create_milestone eller andre tools der laver synlige aktioner — pulse-refleksion er founderens stille check-in, ikke en trigger for opgaver.`
  : trigger === "weekly_cron"
  ? `Det er mandag morgen og agenten gennemgår automatisk virksomhedens seneste data.\n\nHent facts, pulse, milestones og KPI-mål. Skriv én kort motiverende besked i chatten der opsummerer hvad der er vigtigst at fokusere på denne uge. Opdatér weekly focus. Notificér advisor kun hvis der er noget konkret at handle på.`
  : trigger === "anomaly_detected"
  ? `KRITISK ALERT: Der er detekteret en finansiel anomali for ${period_label}.\n\nDetaljer: ${period_key}\n\nHent get_financial_alerts og get_company_facts omgående. Skriv en kort, direkte besked til founder der forklarer hvad der er sket og hvad de skal gøre NU. Maks 3 sætninger. Opdatér IKKE weekly focus med negativ information — brug kun chat. Notificér advisor med høj prioritet.`
  : trigger === "onboarding"
  ? `Founder ${founderFirstName} logger ind i The Boardroom for første gang.\n\nDette er en onboarding-kørsel. Gør følgende i rækkefølge:\n1. Hent ansøgningskontekst med get_application_context\n2. Hent virksomhedens brancheinfo\n3. Skriv en personlig velkomstbesked i chatten med write_chat_message og **as_advisor: true** (så den vises som besked fra rådgiveren med navn og avatar — IKKE som system-boks). Beskeden skal:\n   - Bruge fornavnet\n   - Referere specifikt til hvad de selv har skrevet om deres situation og mål\n   - Være varm og motiverende — dette er dag ét\n   - Maks 4 sætninger\n4. Opret præcis 2 start-milestones baseret på deres mål — de skal være tydeligt forskellige fra hinanden og maksimalt 6 ord lange. Tjek eksisterende milestones med get_milestones først.\n5. Opret én konkret første handlingsopgave (fx upload første rapport)\n6. Sæt weekly focus med en velkomst-headline\n7. Notificér advisor om at ny member er aktiv — inkluder et resumé af deres situation og mål\n8. Kald finish`
  : `Ny rapport committed: ${period_label} (${period_key})\n\nStart med at kalde get_company_facts, get_previous_agent_messages, get_milestones, get_kpi_targets og get_budget_vs_actual parallelt for at danne dig et komplet billede. Hvis der er budget-afvigelser over 20%, prioritér disse i din besked.\n\nBemærk: Hvis dette er virksomhedens første rapport, er der automatisk oprettet et udkast-budget og en årsbaseline baseret på de committede tal (annualiseret ×12 med jævn fordeling). Nævn dette i din besked og opfordr founder til at justere budgetmånederne der afviger fra gennemsnittet — fx høj- og lavsæson.\n\nHvis der findes historiske årsrapport-facts (data_quality='estimat_fra_årsrapport_divideret_med_12') for tidligere år, så sammenlign årets udvikling med det historiske niveau — fx 'Sammenlignet med jeres årsregnskab for 2024 viser denne rapport...'`
}`,
      },
    ];

    const MAX_ITERATIONS = 12;
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
          tools: activeTools,
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
          toolResult = await executeTool(toolName, toolArgs, adminClient, trigger);
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

    // Mark onboarding completed if this was an onboarding trigger
    if (trigger === "onboarding" && messageWritten) {
      await adminClient
        .from("companies")
        .update({ onboarding_completed: true })
        .eq("id", company_id);
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
