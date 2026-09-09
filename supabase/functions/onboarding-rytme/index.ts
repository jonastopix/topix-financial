// Onboardingens rytme — mail A (dag 0–1) og mail C (dag 14–20) til nye
// medlemmer. Mail B (dag 10, intro-påmindelsen) sendes af intro-reminder-cron,
// som henter tærsklen og teksten fra samme dom (_shared/onboardingRytme.ts).
//
// SAMME FORM SOM indgangs-paamindelser-cron: HTTP-indgang (IKKE Deno.cron —
// den eksekveres aldrig på Supabases edge-runtime, målt 13/8),
// authenticateServiceRole bag verify_jwt = true (Bucket B), og TØRKØRSEL
// SOM STANDARD: uden body findes kandidaterne og logges, men intet sendes
// og intet skrives. Kun et eksplicit { "dry_run": false } sender.
//
// DOMMEN ER MOTORENS: afgoerRytme (_shared/onboardingRytme.ts, spejl af
// src/lib/onboardingRytme.ts, paritetstestet) siger hvilken mail der skal
// gå til hvem i dag — højst én. Denne fil henter data, bygger HTML og
// sender. Begrundelserne (systemets stemme, dag 0–1-sikringen, dag 14–20)
// står i src-udgavens filhoved; læs det før noget ændres her.
//
// DEN VIGTIGSTE SIKRING står i motoren, ikke her: A sendes KUN når
// medlemskabet er højst én dag gammelt (KOM_I_GANG_TIL_DAG). Første kørsel
// i prod må derfor ikke ramme de 25 medlemmer der har været her i
// månedsvis — de får aldrig «Sådan kommer du i gang». Denne fil lægger
// intet vindue oveni; den stoler på motoren, og motorens test låser det.
//
// STEMPLET ER email_send_log-RÆKKEN (template_name = label, recipient_email,
// status 'sent') — sendManagedEmail skriver den, og kalderen slår den op
// før dommen. Ingen ny tabel, ingen ny kolonne. Fejlet eller spærret
// tæller ikke som sendt: mailen prøves igen næste dag så længe vinduet er
// åbent (samme regel som intro-reminder-cron og indgangs-paamindelser).
//
// ANKER dag 0 = første company_members.created_at pr. virksomhed. Modtager
// = den ældste medlemsrække (deterministisk .order, som intro-reminder-cron).
// Legat (companies.is_legat) springes over i motoren — de har egen velkomst.
//
// PLANLÆGNING — migration 20260909180000_onboarding_rytme_cron.sql
// (SKREVET, IKKE KØRT 9/9). Slottet 09:15 er ledigt (målt 2/9: 04:00
// opgave-udløb, 05:00 agent-runs, 06:00 weekly-focus, 07:00 event-reminders,
// 08:00 pulse/digest, 09:00 report-reminder + intro-session, 10:00
// indgangs-paamindelser). Kør først funktionen i hånden UDEN body
// (tørkørsel) og læs svaret, før migrationen køres.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { SENDER_FROM, sendManagedEmail } from "../_shared/managedEmail.ts";
import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";
import {
  afgoerRytme,
  HISTORIK_TIL_DAG,
  historikTekst,
  komIGangTekst,
  RYTME_LABEL,
  dageSidenStart,
  type RytmeGrund,
  type RytmeMail,
  type RytmeTekst,
} from "../_shared/onboardingRytme.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://app.theboardroom.dk";

interface RytmeResultat {
  ok: boolean;
  dry_run: boolean;
  /** Virksomheder med mindst ét medlem (før aldersfilter). */
  virksomheder: number;
  /** Inden for HISTORIK_TIL_DAG dage — dem motoren blev spurgt om. */
  kandidater: number;
  /** Sendte mails (altid 0 i tørkørsel). */
  sendt: number;
  /** Kun tørkørsel: ville have fået en mail. */
  ville_sende: number;
  pr_mail: Record<RytmeMail, number>;
  sprunget_over: Record<RytmeGrund | "ingen_email" | "opt_out", number>;
  /** Sendingen fejlede eller modtageren er spærret — intet stempel, prøves igen i morgen. */
  fejlet: number;
  error?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Systemets mailramme — samme skal som intro-reminder og report-reminder, ingen underskrift. */
function bygHtml(t: RytmeTekst): string {
  const href = `${APP_URL}${t.knap.sti}`;
  const P = "color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px";
  const afsnit = t.afsnit.map((a) => `<p style="${P}">${esc(a)}</p>`).join("\n");
  const punkter = t.punkter.length
    ? `<ol style="${P};padding-left:20px">${t.punkter.map((p) => `<li style="margin:0 0 8px">${esc(p)}</li>`).join("")}</ol>`
    : "";
  const efter = t.efterKnap.map((a) => `<p style="${P}">${esc(a)}</p>`).join("\n");
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
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${esc(t.emne)}</h1>
    <p style="${P}">${esc(t.overskrift)}</p>
${afsnit}
${punkter}
    ${bulletproofButton({ href, label: t.knap.tekst, bgColor: "#16a34a" })}
    ${fallbackLinkBlock(href)}
${efter}
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Indstillinger</a></span>
    </div>
  </div>
</div>
</body>
</html>`;
}

function tekstFor(mail: RytmeMail, fornavn: string | null, harVelkomstvideo: boolean): RytmeTekst {
  return mail === "kom_i_gang" ? komIGangTekst(fornavn, harVelkomstvideo) : historikTekst(fornavn);
}

async function koerRytme(supabase: SupabaseClient, toerKoersel: boolean): Promise<RytmeResultat> {
  const resultat: RytmeResultat = {
    ok: true,
    dry_run: toerKoersel,
    virksomheder: 0,
    kandidater: 0,
    sendt: 0,
    ville_sende: 0,
    pr_mail: { kom_i_gang: 0, historik: 0 },
    sprunget_over: { ingen_start: 0, legat: 0, allerede_sendt: 0, har_uploadet: 0, uden_for_vindue: 0, ingen_email: 0, opt_out: 0 },
    fejlet: 0,
  };
  const nu = new Date();

  // 1. Ankeret: første medlemsrække pr. virksomhed (dag 0 + modtager).
  const { data: medlemmer, error: medlemFejl } = await supabase
    .from("company_members")
    .select("company_id, user_id, created_at")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (medlemFejl) {
    console.error("[onboarding-rytme] company_members-opslag fejlede:", medlemFejl.message);
    return { ...resultat, ok: false, error: medlemFejl.message };
  }
  const foerste = new Map<string, { user_id: string; created_at: string }>();
  for (const m of (medlemmer ?? []) as { company_id: string; user_id: string; created_at: string }[]) {
    if (!foerste.has(m.company_id)) foerste.set(m.company_id, { user_id: m.user_id, created_at: m.created_at });
  }
  resultat.virksomheder = foerste.size;

  // 2. Kun de unge er kandidater — alt ældre end HISTORIK_TIL_DAG er uden
  //    for begge vinduer og bliver ikke slået op. (Sikringen for A ligger
  //    i motoren; dette er kun for at holde opslagene små.)
  const kandidatIds = [...foerste.entries()]
    .filter(([, f]) => {
      const dage = dageSidenStart(f.created_at, nu);
      return dage != null && dage >= 0 && dage <= HISTORIK_TIL_DAG;
    })
    .map(([id]) => id);
  resultat.kandidater = kandidatIds.length;
  if (kandidatIds.length === 0) {
    console.log("[onboarding-rytme] Ingen virksomheder inden for de første tre uger");
    return resultat;
  }

  // 3. Virksomhederne (legat-flaget), uploads og målte tal for kandidaterne.
  const [companiesRes, uploadsRes, maalteRes, videoRes] = await Promise.all([
    supabase.from("companies").select("id, name, is_legat").in("id", kandidatIds),
    supabase.from("financial_reports").select("company_id").in("company_id", kandidatIds).is("deleted_at", null),
    // data_basis-undtagelse: filtreret på measured — eksistens-check, ingen talværdier læses
    supabase.from("financial_report_facts").select("company_id").in("company_id", kandidatIds).eq("data_basis", "measured"),
    supabase.from("app_config").select("config_value").eq("config_key", "velkomstvideo_guid").maybeSingle(),
  ]);
  const fejl = [companiesRes, uploadsRes, maalteRes].find((r) => r.error)?.error;
  if (fejl) {
    console.error("[onboarding-rytme] opslag fejlede:", fejl.message);
    return { ...resultat, ok: false, error: fejl.message };
  }
  const virksomheder = new Map<string, { name: string; is_legat: boolean }>();
  for (const c of (companiesRes.data ?? []) as { id: string; name: string; is_legat: boolean }[]) virksomheder.set(c.id, c);
  const uploads = new Map<string, number>();
  for (const r of (uploadsRes.data ?? []) as { company_id: string }[]) uploads.set(r.company_id, (uploads.get(r.company_id) ?? 0) + 1);
  const maalt = new Set(((maalteRes.data ?? []) as { company_id: string }[]).map((f) => f.company_id));
  // Uden video udgår punktet «Se velkomsten» (Jonas 2/9: vi viser ikke tomt indhold).
  const harVelkomstvideo = ((videoRes.data as { config_value?: string | null } | null)?.config_value ?? "").trim() !== "";

  for (const companyId of kandidatIds) {
    const f = foerste.get(companyId)!;
    const company = virksomheder.get(companyId);
    if (!company) continue;
    try {
      // 4. Modtageren: første medlem → auth-mail, fornavn, opt-out.
      const { data: userData } = await supabase.auth.admin.getUserById(f.user_id);
      const email = (userData?.user?.email ?? "").trim().toLowerCase();
      if (!email) {
        resultat.sprunget_over.ingen_email++;
        continue;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, notification_email_prefs")
        .eq("user_id", f.user_id)
        .maybeSingle();
      const prefs = ((profile as { notification_email_prefs?: Record<string, unknown> } | null)?.notification_email_prefs) ?? {};
      if (prefs.onboarding === false) {
        resultat.sprunget_over.opt_out++;
        continue;
      }
      const fornavn = ((profile as { full_name?: string | null } | null)?.full_name ?? "").trim().split(" ")[0] || null;

      // 5. Stemplet: hvad har denne modtager allerede fået (status sent)?
      const { data: log } = await supabase
        .from("email_send_log")
        .select("template_name")
        .eq("recipient_email", email)
        .eq("status", "sent")
        .in("template_name", Object.values(RYTME_LABEL));
      const alleredeSendt = ((log ?? []) as { template_name: string }[]).map((r) => r.template_name);

      // 6. Motoren afgør.
      const dom = afgoerRytme(
        {
          medlemSiden: f.created_at,
          erLegat: company.is_legat === true,
          antalUploads: uploads.get(companyId) ?? 0,
          harMaaltRapport: maalt.has(companyId),
          alleredeSendt,
        },
        nu,
      );
      if (!dom.sendes) {
        resultat.sprunget_over[dom.grund ?? "uden_for_vindue"]++;
        continue;
      }

      const tekst = tekstFor(dom.sendes, fornavn, harVelkomstvideo);
      const label = RYTME_LABEL[dom.sendes];

      if (toerKoersel) {
        console.log(`[onboarding-rytme] TØRKØRSEL ville sende ${label} til ${email} (${company.name}, dag ${dom.dage})`);
        resultat.ville_sende++;
        resultat.pr_mail[dom.sendes]++;
        continue;
      }

      // 7. Send — systemets afsender, aldrig et navn. Loggen ER stemplet.
      const mail = await sendManagedEmail({
        adminClient: supabase,
        to: email,
        from: SENDER_FROM,
        subject: tekst.emne,
        html: bygHtml(tekst),
        text: tekst.emne,
        label,
        metadata: { company_id: companyId, dag: dom.dage },
      });
      if (!mail.sent) {
        // Ingen sent-række → prøves igen i morgen, så længe vinduet er åbent.
        console.error(`[onboarding-rytme] ${label} ikke sendt (${mail.reason}) til ${email} (${company.name})`);
        resultat.fejlet++;
        continue;
      }
      resultat.sendt++;
      resultat.pr_mail[dom.sendes]++;
      console.log(`[onboarding-rytme] ${label} sendt til ${email} (${company.name}, dag ${dom.dage})`);
    } catch (err) {
      console.error(`[onboarding-rytme] Fejl for company ${companyId}:`, err);
      resultat.fejlet++;
    }
  }

  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default: uden body findes kandidaterne og logges, men intet
  // sendes og intet skrives. Kun et eksplicit { "dry_run": false } sender.
  let toerKoersel = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await koerRytme(supabase, toerKoersel);
  console.log("[onboarding-rytme] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
