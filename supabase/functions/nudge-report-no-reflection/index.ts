// Auto-nudge: naar en virksomheds maanedsrapport er committet, men founderens
// refleksion (pulse) for SAMME periode mangler, poster vi EN chat-besked fra den
// tildelte advisor med et link til /pulse?period=P.
//
// Dette snit (2 af 3) koerer i TOERKOERSEL som default: den finder kandidater,
// vaelger advisor og tekst, og LOGGER hvad den VILLE goere, men poster intet og
// kalder ingen notifikation. Foerst naar cron'en i snit 3 sender { "dry_run": false }
// skriver den rigtigt. Manuelle test-kald uden body er derfor sikre.
//
// Betingelse (alle skal vaere sande for samme periode P = rapportens period_key):
//   (a) financial_report_facts.committed_at < now() - 3 dage,
//   (b) ingen pulse_checkins-raekke for (company_id, P),
//   (c) conversation.assigned_advisor_id IS NOT NULL (ellers skip, ingen falsk afsender),
//   (d) nudgen ikke allerede sendt for (company_id, P) (eksisterende reflection-nudge-besked).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://app.theboardroom.dk";
const NUDGE_MESSAGE_TYPE = "reflection-nudge";
const NUDGE_AGE_DAYS = 3;

// Smaa danske maanedsnavne til brug midt i en saetning ("Rapporten for maj 2026 ...").
const DANISH_MONTHS_LOWER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

// Maanedslabel for en YYYY-MM periode, fx "maj 2026". Falder tilbage til den raa
// noegle hvis formatet skulle vaere uventet.
function monthLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12) return periodKey;
  return `${DANISH_MONTHS_LOWER[m - 1]} ${y}`;
}

// De fire tekst-varianter. {month} og {link} indsaettes; {link} er et rigtigt
// <a>-anker (ikke en bar URL) saa det bliver klikbart i chatten (DOMPurify i
// CompanyChatPane tillader a/href/target/rel).
const TEXT_VARIANTS = [
  "Hej. Rapporten for {month} er på plads, godt arbejde. Det sidste der mangler er din egen refleksion. Det er tit der, man selv opdager hvad måneden egentlig handlede om. Den hører sammen med rapporten, så du udfylder den her: {link}.",
  "Hej. Godt arbejde med rapporten for {month}. Tag lige fem minutter på din refleksion også. Det er en god anledning til selv at stoppe op og se hvor det bærer hen. Du finder den her: {link}.",
  "Hej. Rapporten for {month} er i hus. Mangler bare din refleksion, dine egne ord om hvad der gik godt og hvad der drillede. Det skærper som regel ens eget billede af måneden. Udfyld den her: {link}.",
  "Hej. Flot, rapporten for {month} er klar. Det sidste skridt er din refleksion. Et par linjer til dig selv om måneden, som hører sammen med tallene. Den ligger her: {link}.",
];

function buildContent(periodKey: string): string {
  const variant = TEXT_VARIANTS[Math.floor(Math.random() * TEXT_VARIANTS.length)];
  const link = `<a href="${APP_URL}/pulse?period=${periodKey}">Udfyld din refleksion</a>`;
  return variant
    .replace(/\{month\}/g, monthLabel(periodKey))
    .replace(/\{link\}/g, link);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth gate: service-role kraevet for ALLE stier (samme som send-report-reminder) ---
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // DRY_RUN default true. Kun et eksplicit { "dry_run": false } slaar live-post til.
  let dryRun = true;
  try {
    const body = await req.clone().json();
    if (body?.dry_run === false) dryRun = false;
  } catch { /* ingen body, sikker toerkoersel */ }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const cutoffIso = new Date(Date.now() - NUDGE_AGE_DAYS * 86400000).toISOString();

  // (a) committede rapporter aeldre end 3 dage.
  const { data: facts, error: factsErr } = await supabase
    .from("financial_report_facts")
    .select("company_id, period_key, committed_at")
    .lt("committed_at", cutoffIso);

  if (factsErr) {
    console.error("[nudge] kunne ikke hente financial_report_facts:", factsErr.message);
    return new Response(JSON.stringify({ error: "facts_query_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const previews: Array<{ company_id: string; advisor: string; period: string; preview: string }> = [];
  let sent = 0;
  let skipped = 0;

  for (const fact of facts || []) {
    const companyId = fact.company_id as string;
    const P = fact.period_key as string;
    try {
      // (b) ingen refleksion for (company_id, P).
      const { data: pulse } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId)
        .eq("period_key", P)
        .maybeSingle();
      if (pulse) { skipped++; continue; }

      // (c) virksomhedens conversation skal have en tildelt advisor.
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, assigned_advisor_id")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!conv || !conv.assigned_advisor_id) { skipped++; continue; }

      // (d) idempotens: er nudgen allerede sendt for (company_id, P)?
      // Primaert: en eksisterende reflection-nudge-besked i samtalen for samme periode.
      const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .eq("message_type", NUDGE_MESSAGE_TYPE)
        .eq("context_meta->>period_key", P)
        .limit(1)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      // Resolve advisor (afsender) -> navn.
      const { data: advisorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", conv.assigned_advisor_id)
        .maybeSingle();
      const advisorName = advisorProfile?.full_name || "Rådgiver";

      const content = buildContent(P);

      if (dryRun) {
        const entry = { company_id: companyId, advisor: advisorName, period: P, preview: content };
        previews.push(entry);
        console.log(`[nudge][dry-run] ville sende -> virksomhed=${companyId} advisor="${advisorName}" periode=${P}`);
        continue;
      }

      // --- LIVE (kun naar dry_run === false) ---
      const { data: inserted, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conv.id,
          sender_id: conv.assigned_advisor_id,
          message_type: NUDGE_MESSAGE_TYPE,
          content,
          context_meta: { period_key: P, source: "nudge" },
        })
        .select("id")
        .single();
      if (msgErr) {
        console.error(`[nudge] insert fejlede for virksomhed=${companyId} periode=${P}:`, msgErr.message);
        skipped++;
        continue;
      }

      // Hold samtalen i sync (samme felter som de andre auto-beskeder saetter).
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), awaiting_reply_from: "company" })
        .eq("id", conv.id);

      // Notifikation til medlemmet (in-app + mail-fallback) via notify-chat-reply.
      // BEMAERK (skal verificeres i snit 3 foer live): notify-chat-reply bruger
      // authenticateUser (Bucket A) og forventer et bruger-JWT med sub-claim. Et
      // service-role-kald herfra har ikke et sub, saa kaldet kan svare 401. Naar vi
      // slaar live til, skal vi enten give notify-chat-reply en service-role-sti
      // eller skrive notifikationen direkte via writeNotificationToMany.
      try {
        await supabase.functions.invoke("notify-chat-reply", {
          body: { conversation_id: conv.id, message_id: inserted.id },
        });
      } catch (notifyErr) {
        console.error(`[nudge] notify-chat-reply fejlede for virksomhed=${companyId}:`, notifyErr);
      }

      console.log(`[nudge][live] sendt -> virksomhed=${companyId} advisor="${advisorName}" periode=${P}`);
      sent++;
    } catch (err) {
      console.error(`[nudge] fejl ved kandidat virksomhed=${companyId} periode=${P}:`, err);
      skipped++;
    }
  }

  const summary = {
    dry_run: dryRun,
    candidates_examined: (facts || []).length,
    nudges: dryRun ? previews.length : sent,
    skipped,
    previews: dryRun ? previews : undefined,
  };
  console.log(`[nudge] summary: dry_run=${dryRun} kandidater=${summary.candidates_examined} nudges=${summary.nudges} skippet=${skipped}`);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
