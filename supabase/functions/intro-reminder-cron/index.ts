import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { SENDER_FROM, sendManagedEmail } from "../_shared/managedEmail.ts";
import { introPaamindelseModen, introPaamindelseTekst, type RytmeTekst } from "../_shared/onboardingRytme.ts";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";

// BAGGRUND (rettelse 13-08-2026): Funktionen havde kun Deno.cron og ingen
// HTTP-overflade. Deno.cron eksekveres ALDRIG på Supabases edge-runtime, så den
// havde aldrig kørt — ingen intro-påmindelse er nogensinde sendt, og
// companies.intro_reminder_last_sent_at er NULL for alle. Kolonnen skrives kun
// ét sted i hele repoet: af denne funktion. Rettelsen er at give den en
// HTTP-indgang og planlægge den med pg_cron, som de seks fungerende jobs
// (målt i prod 13. august: alle seks bruger hårdkodet URL og vault-nøglen
// email_queue_service_role_key).
//
// Dagligt pg_cron-mål: paaminder fulde medlemmer der endnu ikke har booket deres
// inkluderede intro-session hos Morten. Foerste mail INTRO_PAAMINDELSE_FRA_DAG
// (10) dage efter medlemskabsstart, derefter maanedligt indtil de booker
// (intro_session_used_at saettes) eller kontrakten udloeber.
//
// DAG 10, IKKE DAG 2 — BESLUTTET af Jonas 9/9 («God idé»): dag 2 er FØR de
// har uploadet noget, så samtalen med Morten har intet grundlag; dag 10 er
// efter de har haft tid til at lægge tal ind. Det er mail B i onboardingens
// rytme (analyse-onboardingens-rytme.md §5; dommen og teksten bor i
// _shared/onboardingRytme.ts, spejl af src/lib/onboardingRytme.ts).
//
// SYSTEMETS STEMME (9/9): mailen sendes af en cron, så den siger ikke
// længere «Du har en sparring med MIG til gode … Morten» — den siger «Din
// sparring med Morten er inkluderet», afsender «The Boardroom». En maskine
// der skriver som Morten er en løgn; en maskine der fortæller om Morten er
// ærlig (analyse §4).
//
// ANKERET er første company_members.created_at («de fik adgang»), som
// forsidens dom, ikkeIGang og onboarding-rytme — ikke contract_start_date
// (kan ligge før adgangen) og ikke companies.created_at (kan være en
// importeret ansøgning måneder før). Rækken hentes alligevel i trin 3.
// HTTP-indgang (Bucket B): samme form som event-reminders —
// authenticateServiceRole fra _shared/edgeFunctionAuth.ts bag verify_jwt = true.
// Send-vej, bruger-opslag og opt-out-tjek er genbrugt verbatim fra
// send-pulse-reminder.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_URL = "https://app.theboardroom.dk";

// Teksten vises for medlemmer og skrives med danske tegn. Filen er UTF-8, og
// resten af huset skriver æøå — translitterationen var unødvendig forsigtighed.
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Systemets mailramme — ingen underskrift; teksten kommer fra onboardingRytme.introPaamindelseTekst. */
function buildIntroReminderHtml(t: RytmeTekst): string {
  const href = `${APP_URL}${t.knap.sti}`;
  const P = "color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px";
  const afsnit = t.afsnit.map((a) => `<p style="${P}">${esc(a)}</p>`).join("\n");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background-color:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 0">
<div style="max-width:520px;margin:0 auto">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse">
    <tr><td style="background-color:#133332;border-radius:10px 10px 0 0;padding:18px 28px">
      <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em;font-family:'Manrope',Arial,sans-serif">The Boardroom</span>
    </td></tr>
  </table>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:28px 28px 0">
    <p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Din sparring med Morten</p>
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${esc(t.emne)}</h1>
    <p style="${P}">${esc(t.overskrift)}</p>
${afsnit}
    ${bulletproofButton({ href, label: t.knap.tekst, bgColor: "#16a34a" })}
    ${fallbackLinkBlock(href)}
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Indstillinger</a></span>
    </div>
  </div>
</div>
</body>
</html>`;
}

interface IntroPaamindelsesResultat {
  ok: boolean;
  dry_run: boolean;
  /** Raekker fra maalgruppe-query'en (foer per-virksomhed-filtre). */
  kandidater: number;
  /** Enqueuede mails (altid 0 i toerkoersel). */
  sendte: number;
  /** Kun toerkoersel: passerede alle filtre og VILLE have faaet en mail. */
  ville_sende: number;
  sprunget_over: {
    /** Medlemskabet er under INTRO_PAAMINDELSE_FRA_DAG (10) dage gammelt. */
    for_tidligt: number;
    ingen_medlemsbruger: number;
    ingen_email: number;
    opt_out: number;
    enqueue_fejl: number;
    fejl: number;
  };
  error?: string;
}

async function koerIntroPaamindelser(
  supabase: ReturnType<typeof createClient>,
  toerKoersel: boolean,
): Promise<IntroPaamindelsesResultat> {
  const resultat: IntroPaamindelsesResultat = {
    ok: true,
    dry_run: toerKoersel,
    kandidater: 0,
    sendte: 0,
    ville_sende: 0,
    sprunget_over: {
      for_tidligt: 0,
      ingen_medlemsbruger: 0,
      ingen_email: 0,
      opt_out: 0,
      enqueue_fejl: 0,
      fejl: 0,
    },
  };

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // 1. Maalgruppe: fulde medlemmer (aktiv kontrakt) der ikke har booket, og hvor der enten
  //    aldrig er sendt en paamindelse eller der er gaaet over 30 dage siden sidst.
  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name, contract_start_date, created_at, intro_reminder_last_sent_at")
    .gt("contract_end_date", nowIso)          // aktiv kontrakt = tier full
    .is("intro_session_used_at", null)         // har ikke booket endnu
    .or(`intro_reminder_last_sent_at.is.null,intro_reminder_last_sent_at.lt.${thirtyDaysAgo}`);

  if (companiesErr) {
    console.error("[intro-reminder-cron] Failed to fetch companies:", companiesErr.message);
    return { ...resultat, ok: false, error: companiesErr.message };
  }

  resultat.kandidater = companies?.length ?? 0;

  if (!companies || companies.length === 0) {
    console.log("[intro-reminder-cron] No eligible companies found");
    return resultat;
  }

  for (const company of companies) {
    try {
      // 2+3. Find medlemsbrugeren FØRST — rækkens created_at er ankeret (dag 0). Rollefilteret .eq("role", "member") er FJERNET
      //    (13-08-2026): en intro-sparring er inkluderet i medlemskabet, ikke i en
      //    rolle — ejeren er typisk netop den, sessionen er til. I prod-toerkoerslen
      //    var 8 af 12 kandidater role='owner' og blev fejlagtigt talt som
      //    ingen_medlemsbruger. Moenstret var kopieret fra send-pulse-reminder og
      //    create-free-intro-booking, som formentlig deler samme blinde vinkel —
      //    det skal efterproeves separat og er IKKE rettet her.
      //    .limit(1) uden .order() vaelger vilkaarligt ved flere raekker (samme
      //    faelde som user_company_id), derfor deterministisk aeldste raekke foerst.
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: true })
        .limit(1);

      const member = members?.[0] as { user_id?: string; created_at?: string } | undefined;
      if (!member?.user_id) {
        resultat.sprunget_over.ingen_medlemsbruger++;
        continue;
      }

      // Dag 10 (motoren: introPaamindelseModen) — regnet fra første
      // medlemsrække, ikke fra kontrakten. Se filhovedet.
      if (!introPaamindelseModen(member.created_at ?? company.created_at, new Date())) {
        resultat.sprunget_over.for_tidligt++;
        continue;
      }

      const { data: userData } = await supabase.auth.admin.getUserById(member.user_id);
      const email = userData?.user?.email;
      if (!email) {
        resultat.sprunget_over.ingen_email++;
        continue;
      }

      // 4. Fornavn + opt-out (samme moenster som send-pulse-reminder).
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, notification_email_prefs")
        .eq("user_id", member.user_id)
        .maybeSingle();

      const prefs = (profile?.notification_email_prefs as any) || {};
      if (prefs.intro_reminders === false) {
        resultat.sprunget_over.opt_out++;
        continue;
      }

      if (toerKoersel) {
        // Toerkoersel: kandidaten er fundet og logget — intet sendes, intet skrives.
        console.log(`[intro-reminder-cron] TOERKOERSEL ville sende til: ${email} (${company.name})`);
        resultat.ville_sende++;
        continue;
      }

      const firstName = profile?.full_name?.trim().split(" ")[0] || null;
      const tekst = introPaamindelseTekst(firstName);
      const subject = tekst.emne;
      const html = buildIntroReminderHtml(tekst);
      // 5. Send-vej: mailen sendes med det samme og bogfoeres i email_send_log.
      const mailResultat = await sendManagedEmail({
        adminClient: supabase,
        to: email,
        from: SENDER_FROM,
        subject,
        html,
        text: subject,
        label: "intro-reminder",
      });

      if (!mailResultat.sent) {
        // Ikke sendt: last_sent opdateres IKKE, saa den proeves igen i morgen (ikke om en maaned).
        console.error(`[intro-reminder-cron] Mail ikke sendt (${mailResultat.reason}) for company ${company.id}`);
        resultat.sprunget_over.enqueue_fejl++;
        continue;
      }

      // 6. Kun ved succes: markér hvornaar paamindelsen blev sendt (styrer maanedlig kadence).
      await supabase
        .from("companies")
        .update({ intro_reminder_last_sent_at: new Date().toISOString() })
        .eq("id", company.id);

      console.log(`[intro-reminder-cron] Enqueued for: ${email} (${company.name})`);
      resultat.sendte++;
    } catch (err) {
      console.error(`[intro-reminder-cron] Error processing company ${company.id}:`, err);
      resultat.sprunget_over.fejl++;
    }
  }

  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TOERKOERSEL default: samme moenster som nudge-report-no-reflection. Uden body
  // finder funktionen kandidaterne og logger dem, men sender intet — saa et
  // fejlkald aldrig sender mails til medlemmer. Kun et eksplicit
  // { "dry_run": false } slaar live-afsendelse til.
  let toerKoersel = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
  } catch { /* ingen body, sikker toerkoersel */ }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await koerIntroPaamindelser(supabase, toerKoersel);
  console.log("[intro-reminder-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
