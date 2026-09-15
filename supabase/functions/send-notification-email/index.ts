/**
 * send-notification-email — Phase 2 email worker
 *
 * Cron-triggered (service-role only). Polls unseen notifications
 * older than 15 minutes and enqueues email fallback.
 *
 * Rules:
 * - action_required: always send email (mandatory)
 * - important: send email (mandatory default, no preferences in phase 2)
 * - info: never send email
 * - report_reminder: skip (already emailed by send-report-reminder)
 * - Anti-spam: max MAX_EMAILS_PER_DAY (5) emails/day per user, talt mod
 *   email_send_log med status «sent» (det der nåede frem, _shared/dagskvote.ts)
 *   — IKKE notifications.email_sent_at, som også sættes af
 *   commit-suppress/dispose, og IKKE afviste rækker (failed/rate_limited/
 *   suppressed), som er mails medlemmet aldrig så (målt 14/9).
 * - Rapport-notifikationer udvælges via selectNotificationEmails
 *   (_shared/notificationEmailSelection.ts): slettede/committede rapporter
 *   disposes, dubletter per (company, periode) kollapses, og kvote-udskudte
 *   mails sendes kun kl. 07-20 dansk tid (aldrig ved midnats-kvotereset).
 * - ESCAPING (3/9): `title` og `body` er tekst, aldrig HTML. Alle skrivere
 *   i huset bygger dem som skabelon-strenge uden markup (målt 3/9: ingen
 *   `<` i nogen title/body-streng), men flere bærer brugerskrevet tekst —
 *   trådtitlen i community_naevnelse, rådgiverens broadcast, aflysnings-
 *   begrundelsen — og de blev lagt ind råt i HTML'en. Nu går de gennem
 *   escHtml i BEGGE render-stier (buildEmailHtml og DB-skabelonens
 *   {{body}}/{{title}}); \n i body bliver <br>. Emnet er en mail-header,
 *   ikke HTML, og escapes ikke.
 * - community_opslag (opslagsmail 3/9): mailen bygges ikke af title/body
 *   men af tråden selv (reference_id → community_traade + forfatterens
 *   profil + virksomhed) via _shared/opslagsMail.ts — så portræt, navn,
 *   virksomhed og uddrag kan stå i mailen. Tråd der ikke længere er
 *   aktiv → dispose (som slettede rapporter), ingen mail.
 * - UDLØBET-REGLEN (15/9, chattens beslutning på Jonas' krav «ingen
 *   platformsmails i forlængelsesvinduet», DEL 2 «15. september» §15): en
 *   række til en bruger hvis virksomheder ALLE er tier expired
 *   (_shared/mailModtager.ts, computeMembershipTier) stemples uden mail
 *   med grund «udloebet» — FØR chat-grupperingen og selectNotificationEmails,
 *   for alle typer. Bruger uden company_members-række er uberørt.
 * - TØRKØRSEL (15/9): body {"dry_run": true} → ingen sendManagedEmail,
 *   ingen stempling, ingen email_send_log; svaret bærer dry_run, nu og
 *   hvad der VILLE sendes/stemples. Tom eller ugyldig body (cronens {}) →
 *   sender som i dag. «nu» (ISO) læses KUN i tørkørsel og styrer i PR 1
 *   kun udløbet-reglen (køens egne ure er låst af kildeværnene). ALLE
 *   sideeffekter går gennem to hjælpere i filen — send() og stempl() —
 *   låst af src/lib/__tests__/sendNotificationEmail.dryrun.guard.test.ts.
 * - SAMLEMAILEN (15/9, PR 2, chattens beslutninger, DEL 2 «15. september»
 *   §16): event_published og community_opslag (SAMLEMAIL_TYPER) er UDE af
 *   køens første hentning og hentes i en egen forespørgsel, kun i vinduet
 *   17–20 dansk (erISamlemailVindue). De går gennem udløbet-reglen og
 *   derefter fordelSamlemail (_shared/samlemail.ts) → én mail pr. modtager
 *   pr. dansk døgn (bygSamlemail, label SAMLEMAIL_LABEL, idempotency-nøgle
 *   pr. dansk dato). Løkken kører EFTER de to eksisterende og ikke hvis
 *   rateLimit er sat. Låst af sendNotificationEmail.samlemail.guard.test.ts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  BEGIVENHED_MAKS_ALDER_MS,
  COMMUNITY_TRAAD_TYPES,
  REPORT_NOTIFICATION_TYPES,
  delChatKandidater,
  emailDelayMinutes,
  erChatBeskedRef,
  parseDkReportPeriodKey,
  selectNotificationEmails,
  type ReportJoin,
} from "../_shared/notificationEmailSelection.ts";

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}


const APP_URL = "https://app.theboardroom.dk";

const EMAIL_SUBJECTS: Record<string, string> = {
  advisor_replied: "Ny besked fra din rådgiver",
  chat_reply: "Ny besked fra din rådgiver",
  member_message: "Ny besked i chatten",
  report_review_ready: "Dine tal er klar til gennemsyn",
  report_error: "Din rapport kunne ikke behandles",
  report_committed: "Ny rapport godkendt",
  milestone_completed: "Milestone fuldført",
  pulse_checkin_received: "Nyt pulse check-in modtaget",
  weekly_focus_ready: "Ugens fokus er klar",
  event_published: "Nyt event i The Boardroom",
};

const NOTIFICATION_TEMPLATE_NAMES: Record<string, string> = {
  advisor_replied:        "Notifikation: Ny besked fra rådgiver",
  chat_reply:             "Notifikation: Ny besked fra rådgiver",
  member_message:         "Notifikation: Ny besked i chatten",
  report_review_ready:    "Notifikation: Rapport klar til gennemsyn",
  report_error:           "Notifikation: Rapport fejl",
  report_committed:       "Notifikation: Rapport godkendt",
  milestone_completed:    "Notifikation: Milestone fuldført",
  pulse_checkin_received: "Notifikation: Pulse check-in modtaget",
  weekly_focus_ready:     "Notifikation: Ugens fokus klar",
};

// Chat notification types that should be deduplicated and aggregated
const CHAT_NOTIFICATION_TYPES = new Set(["advisor_replied", "chat_reply"]);

import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";
import { escHtml, escHtmlMedLinjeskift } from "../_shared/htmlEscape.ts";
import { opslagsMail } from "../_shared/opslagsMail.ts";
import { sendManagedEmail, SENDER_FROM, VERIFIED_FROM_EMAIL, type ManagedMailResultat } from "../_shared/managedEmail.ts";
import { skalKoeStoppe } from "../_shared/mailFejl.ts";
import { KVOTE_STATUSSER, MAX_EMAILS_PER_DAY, taelDagskvote } from "../_shared/dagskvote.ts";
import { UDLOEBET_GRUND, fordelUdloebne, type VirksomhedTilMail } from "../_shared/mailModtager.ts";
import {
  SAMLEMAIL_LABEL,
  SAMLEMAIL_TYPER,
  bygSamlemail,
  erISamlemailVindue,
  fordelSamlemail,
  fornavnFraFuldtNavn,
  type OpslaaetData,
  type SamlemailModtager,
  type SamlemailRaekke,
} from "../_shared/samlemail.ts";

/** Nyt community-opslag (notify-community-opslag). Mailen bygges af tråden, ikke af body. */
const COMMUNITY_OPSLAG_TYPE = "community_opslag";

function buildEmailHtml(title: string, body: string, deepLink: string, ctaLabel?: string, eyebrow?: string, highlight?: string): string {
  const fullUrl = `${APP_URL}${deepLink}`;

  const highlightBlock = highlight
    ? `<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0"><p style="color:#166534;font-size:13px;margin:0;font-weight:500">${highlight}</p></div>`
    : '';
  const eyebrowBlock = eyebrow
    ? `<p style="font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">${eyebrow}</p>`
    : '';

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
    ${eyebrowBlock}
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${escHtml(title)}</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px">${escHtmlMedLinjeskift(body)}</p>
    ${highlightBlock}
    ${bulletproofButton({ href: fullUrl, label: ctaLabel || 'Åbn i The Boardroom', bgColor: "#16a34a" })}
    ${fallbackLinkBlock(fullUrl)}
    <div style="height:0.5px;background:#e5e7eb;margin:0"></div>
    <div style="padding:16px 0">
      <span style="font-size:12px;color:#9ca3af">The Boardroom · theboardroom.dk &nbsp;·&nbsp; <a href="${APP_URL}/settings" style="font-size:12px;color:#9ca3af;text-decoration:underline">Administrer notifikationer</a></span>
    </div>
  </div>
</div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Service-role only (cron) — use JWT claims parsing (same as process-email-queue)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const claims = parseJwtClaims(token);
  if (claims?.role !== "service_role") {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Tørkørsel (chattens beslutning 15/9): KUN body {"dry_run": true}.
    //    Tom eller ugyldig body (cronens {}) → sender som i dag. «nu»
    //    læses kun i tørkørsel. Fejler læsningen, er det IKKE tørkørsel. ──
    let toerKoersel = false;
    let nu = new Date();
    try {
      const raaBody = await req.text();
      const body: unknown = raaBody.trim() ? JSON.parse(raaBody) : {};
      if (body && typeof body === "object" && (body as { dry_run?: unknown }).dry_run === true) {
        toerKoersel = true;
        const nuIso = (body as { nu?: unknown }).nu;
        if (typeof nuIso === "string" && !Number.isNaN(new Date(nuIso).getTime())) nu = new Date(nuIso);
      }
    } catch {
      toerKoersel = false;
    }

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Bredt net: 15 minutter er kun DB-forfilteret (den mindste mulige
    // ventetid). Den faktiske ventetid pr. type afgøres i
    // selectNotificationEmails (emailDelayMinutes — handlingsudløste typer
    // som report_review_ready venter længere).
    //
    // AFGJORT 10/9 — nettet forbliver bredt, med vilje: udvælgelsen skal se
    // HELE familien for en rapport i samme kørsel. Dublet-reglen (nyeste
    // report_review_ready pr. company+periode vinder, den ældre disposes)
    // og rapport_vaek (rapporten committet/slettet → dispose) virker kun når
    // den unge søskende også er hentet. Hentede vi først når typens 240 min
    // var gået, ville den ældre blive sendt alene, og den nyere sendes 200
    // min senere som en mail nr. to. Prisen for det brede net er én række
    // hentet ~45 gange over fire timer — og den pris var usynlig, fordi
    // svaret ikke sagde «venter». Det gør det nu (venter_paa_tid /
    // venter_paa_vindue), så {processed: 1, sent: 0, skipped: 0} ikke
    // igen kan ligne en fejl.
    // Fetch unseen notifications eligible for email
    const { data: pending, error: fetchErr } = await admin
      .from("notifications")
      .select("id, user_id, type, priority, title, body, deep_link, reference_id, company_id, created_at")
      .is("email_sent_at", null)
      .is("seen_at", null)
      .in("priority", ["action_required", "important"])
      .lt("created_at", fifteenMinAgo)
      .neq("type", "report_reminder") // Already emailed by send-report-reminder
      // SAMLEMAILEN (PR 2, 15/9): event_published og community_opslag er
      // UDE af denne hentning — de venter til kl. 17 og ville ellers fylde
      // alle 50 pladser og stoppe chatsvar og andre mails hele dagen.
      .not("type", "in", `(${SAMLEMAIL_TYPER.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (fetchErr) {
      console.error("Fetch error:", fetchErr);
      return json({ error: "fetch_failed" }, 500);
    }

    // ── SAMLEMAILENS EGEN HENTNING (PR 2, 15/9) — kun i vinduet 17–20
    //    dansk; uden for vinduet hentes intet, og intet sker. «nu» er
    //    tørkørslens nu, når den er sat. Loftet 500: 40 medlemmer × ca. 7
    //    rækker på en dag ≈ 280; en webinardag med 15 præsentationer × 40
    //    modtagere ≈ 600 tages i to kørsler (cronen kører hvert 5. minut i
    //    vinduet, ældste først; en modtager der allerede har fået dagens
    //    mail, får resten i morgen — under 48 t er de ikke forældede).
    //    Samme filtre som køen (usete, umailede, prioritet, > 15 min). ──
    const SAMLEMAIL_LOFT = 500;
    const samlemailIVinduet = erISamlemailVindue(nu);
    let samlemailRaekker: SamlemailRaekke[] = [];
    if (samlemailIVinduet) {
      const samlemailGraense = new Date(nu.getTime() - 15 * 60 * 1000).toISOString();
      const { data: samlemailRows, error: samlemailFejl } = await admin
        .from("notifications")
        .select("id, user_id, type, reference_id, deep_link, created_at")
        .in("type", [...SAMLEMAIL_TYPER])
        .is("email_sent_at", null)
        .is("seen_at", null)
        .in("priority", ["action_required", "important"])
        .lt("created_at", samlemailGraense)
        .order("created_at", { ascending: true })
        .limit(SAMLEMAIL_LOFT);
      if (samlemailFejl) console.error("[samlemail] hentning fejlede:", samlemailFejl.message);
      samlemailRaekker = (samlemailRows || []) as SamlemailRaekke[];
    }

    if (!pending?.length && samlemailRaekker.length === 0) {
      return json({ processed: 0, sent: 0, skipped: 0, udloebet: 0, venter_paa_tid: 0, venter_paa_vindue: 0, mails_sendt: 0, samlemail: { i_vinduet: samlemailIVinduet, hentet: 0, udloebet: 0, mails: 0, stemplet_uden_mail: 0, venter: 0 }, ...(toerKoersel ? { dry_run: true, nu: nu.toISOString(), ville_sende: [], ville_stemple: [] } : {}) });
    }

    // Load notification email templates (one query for all types)
    const { data: notifTemplates } = await admin
      .from("email_templates")
      .select("name, subject, body_html, sender_name, sender_email, enabled")
      .in("name", Object.values(NOTIFICATION_TEMPLATE_NAMES));

    const notifTemplateMap = new Map(
      (notifTemplates || [])
        .filter((t: any) => t.enabled)
        .map((t: any) => [t.name, t])
    );

    // Auto-create missing templates (disabled by default) so they appear in admin panel
    for (const [type, tplName] of Object.entries(NOTIFICATION_TEMPLATE_NAMES)) {
      const exists = (notifTemplates || []).some((t: any) => t.name === tplName);
      if (!exists && !toerKoersel) {
        const defaultSubject = EMAIL_SUBJECTS[type] || tplName;
        await admin.from("email_templates").insert({
          name: tplName,
          subject: defaultSubject,
          body_html: buildEmailHtml(
            defaultSubject,
            "{{body}}",
            "{{deep_link}}",
            "{{cta_label}}",
            "{{eyebrow}}",
            "{{highlight}}"
          ),
          sender_name: "The Boardroom",
          sender_email: VERIFIED_FROM_EMAIL,
          trigger_type: "event",
          trigger_config: { event: type },
          enabled: false,
        });
      }
    }

    // TÆLLERNE (10/9) tæller RÆKKER, så regnestykket går op:
    //   processed = sent + skipped + venter_paa_tid + venter_paa_vindue.
    // sent er rækker stemplet efter en afsendt mail (en chat-samlemail
    // dækker N rækker → N); mails_sendt er antal mails. Før talte sent
    // mails, og de ventende talte ingen steder.
    let sent = 0;
    let skipped = 0;
    let mailsSendt = 0;
    // PAUSEN (14/9, recon-event-fanout.md §6): rammer en sending udbyderens
    // loft (429), får de næste rækker samme svar — hver med en logrække.
    // Kørslen stopper ved den første; rækkerne står ustemplede (email_sent_at
    // IS NULL) og tages af cronen ved næste kørsel. Ingen backoff-tabel,
    // ingen ny kolonne: næste kørsel er om fem minutter, og prøver den for
    // tidligt, stopper den igen ved den første række.
    let rateLimit: { retryAfterSeconds: number | null; tilbage: number } | null = null;

    // ── SIDEEFFEKTERNE — KUN her (15/9). To hjælpere: send() kalder
    //    sendManagedEmail, stempl() sætter email_sent_at. I tørkørsel
    //    registrerer de kun i svaret. Låst af
    //    src/lib/__tests__/sendNotificationEmail.dryrun.guard.test.ts. ──
    type RaekkeRef = { id: string; user_id: string; type: string; ids?: string[] };
    const villeSende: Array<{ id: string; user_id: string; type: string; ids?: string[] }> = [];
    const villeStemple: Array<{ id: string; user_id: string; type: string; grund: string }> = [];
    async function stempl(n: RaekkeRef, grund: string): Promise<void> {
      if (toerKoersel) {
        if (grund !== "sendt") villeStemple.push({ id: n.id, user_id: n.user_id, type: n.type, grund });
        return;
      }
      await admin.from("notifications").update({ email_sent_at: new Date().toISOString() }).eq("id", n.id);
    }
    async function send(args: Parameters<typeof sendManagedEmail>[0], raekker: readonly RaekkeRef[]): Promise<ManagedMailResultat> {
      if (toerKoersel) {
        for (const n of raekker) villeSende.push({ id: n.id, user_id: n.user_id, type: n.type, ...(n.ids ? { ids: n.ids } : {}) });
        return { sent: true, messageId: "toerkoersel" };
      }
      return await sendManagedEmail(args);
    }

    // Group by user for anti-spam check — inkl. samlemailens modtagere (PR 2),
    // så advisor-, pref-, mail- og kvoteopslagene dækker dem uden nye kald.
    const userIds = [...new Set([...pending, ...samlemailRaekker].map((n: any) => n.user_id as string))];

    // ── UDLØBET-REGLEN (15/9, _shared/mailModtager.ts): brugere hvis
    //    virksomheder ALLE er tier expired får ingen platformsmails —
    //    rækkerne stemples uden mail, grund «udloebet». Afgøres FØR
    //    chat-grupperingen og selectNotificationEmails, for alle typer.
    //    Koblingen går user_id → company_members → companies (company_id
    //    er ikke sat på event_*/community_*/chat_reply-rækker). ──
    const medlemskaber = new Map<string, VirksomhedTilMail[]>();
    {
      const { data: medlemRows, error: medlemFejl } = await admin
        .from("company_members")
        .select("user_id, company_id")
        .in("user_id", userIds);
      if (medlemFejl) console.error("[udloebet] company_members-opslag fejlede:", medlemFejl.message);
      const companyIds = [...new Set((medlemRows || []).map((m: any) => m.company_id as string))];
      const virksomhedById = new Map<string, VirksomhedTilMail>();
      if (companyIds.length > 0) {
        const { data: companyRows, error: companyFejl } = await admin
          .from("companies")
          .select("id, contract_end_date, subscription_status, subscription_current_period_end")
          .in("id", companyIds);
        if (companyFejl) console.error("[udloebet] companies-opslag fejlede:", companyFejl.message);
        for (const c of (companyRows || []) as any[]) {
          virksomhedById.set(c.id, {
            contract_end_date: c.contract_end_date ?? null,
            subscription_status: c.subscription_status ?? null,
            subscription_current_period_end: c.subscription_current_period_end ?? null,
          });
        }
      }
      for (const m of (medlemRows || []) as any[]) {
        const virk = virksomhedById.get(m.company_id);
        if (!virk) continue; // virksomhed ikke fundet → ingen dom på den
        const liste = medlemskaber.get(m.user_id) ?? [];
        liste.push(virk);
        medlemskaber.set(m.user_id, liste);
      }
    }
    const { udloebne: udloebneIds } = fordelUdloebne(
      pending.map((n: any) => ({ id: n.id as string, user_id: n.user_id as string })),
      medlemskaber,
      nu,
    );
    const udloebneSet = new Set(udloebneIds);
    let udloebet = 0;
    for (const notif of pending) {
      if (!udloebneSet.has(notif.id)) continue;
      await stempl(notif, UDLOEBET_GRUND);
      console.log(`[dispose] IKKE SENDT — ${UDLOEBET_GRUND}: ${notif.type} ${notif.id} (alle brugerens virksomheder er expired)`);
      udloebet++;
      skipped++;
    }
    const raekkerTilMail = pending.filter((n: any) => !udloebneSet.has(n.id));
    // Samme regel på samlemailens rækker (PR 2): et medlem kan udløbe mellem
    // opslaget og kl. 17. Udløbne stemples her; resten går til fordelingen.
    const { udloebne: samlemailUdloebneIds } = fordelUdloebne(
      samlemailRaekker.map((n) => ({ id: n.id, user_id: n.user_id })),
      medlemskaber,
      nu,
    );
    const samlemailUdloebneSet = new Set(samlemailUdloebneIds);
    let samlemailUdloebet = 0;
    for (const n of samlemailRaekker) {
      if (!samlemailUdloebneSet.has(n.id)) continue;
      await stempl(n, UDLOEBET_GRUND);
      console.log(`[dispose] IKKE SENDT — ${UDLOEBET_GRUND}: ${n.type} ${n.id} (samlemail; alle brugerens virksomheder er expired)`);
      samlemailUdloebet++;
      skipped++;
    }
    const samlemailTilFordeling = samlemailRaekker.filter((n) => !samlemailUdloebneSet.has(n.id));

    // Advisor/admin role lookup for email suppression
    const { data: advisorRoleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["advisor", "admin"]);
    const advisorUserIds = new Set((advisorRoleRows || []).map((r: any) => r.user_id));

    // Advisors receive Slack notifications — email is for members only
    const ADVISOR_EMAIL_DISABLED = true;

    // Fetch notification email preferences per user
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, notification_email_prefs")
      .in("user_id", userIds);
    const prefsByUser = new Map(
      (profileRows || []).map((p: any) => [p.user_id, p.notification_email_prefs])
    );

    // Resolve user emails up front (needed for both quota count and sending)
    const userEmailMap = new Map<string, string>();
    for (const uid of userIds) {
      const { data: userData } = await admin.auth.admin.getUserById(uid);
      if (userData?.user?.email) userEmailMap.set(uid, userData.user.email);
    }

    // Fetch daily email counts per user — counted against email_send_log
    // (mails that actually went out). notifications.email_sent_at is ALSO
    // set by commit-suppress and delete-dispose without any mail being sent,
    // so counting that column would let suppressions eat the daily quota and
    // defer legitimate mails to the next quota window.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const emailToUser = new Map(
      [...userEmailMap.entries()].map(([uid, email]) => [email, uid]),
    );
    let countMap: Record<string, number> = {};
    if (emailToUser.size > 0) {
      // Kvoten tæller det der NÅEDE FREM (status sent), ikke det der blev
      // forsøgt. Målt 14/9 kl. 19:38: fem adresser spærret resten af dagen
      // efter tre modtagne mails, fordi to afvisninger fra kl. 09:10 stod
      // som «failed» (før #857) og talte med. #857 undtog kun rate_limited
      // — én fejlstatus ad gangen holder ikke. Dommen bor i
      // _shared/dagskvote.ts (KVOTE_STATUSSER + taelDagskvote).
      const { data: dailyCounts } = await admin
        .from("email_send_log")
        .select("recipient_email, status")
        .gte("created_at", todayIso)
        .like("template_name", "notification-%")
        .in("status", [...KVOTE_STATUSSER])
        .in("recipient_email", [...emailToUser.keys()]);
      countMap = taelDagskvote(dailyCounts || [], emailToUser);
    }

    const ctaLabels: Record<string, string> = {
      report_review_ready: "Gennemgå mine tal →",
      report_error: "Prøv igen →",
      advisor_replied: "Læs beskeden →",
      chat_reply: "Læs beskeden →",
      report_committed: "Se virksomhedens tal →",
      weekly_focus_ready: "Se ugens fokus",
      // Kalender-linket bor paa eventsiden (#788): mailen kan ikke baere en fil, knappen siger hvor den er.
      event_published: "Se eventet og føj til kalender →",
    };
    const eyebrows: Record<string, string> = {
      report_review_ready: "Dine tal er klar",
      report_error: "Rapport fejl",
      advisor_replied: "Ny besked",
      chat_reply: "Ny besked",
      weekly_focus_ready: "Ugens fokus",
      event_published: "Nyt event",
    };
    const highlights: Record<string, string> = {
      report_review_ready: "Omsætning, dækningsbidrag og resultat er klar til verifikation.",
      report_error: "Prøv at eksportere filen direkte fra dit regnskabsprogram og upload igen.",
    };

    // ── Separate chat notifications from non-chat ──
    const chatNotifsByUser = new Map<string, any[]>();
    const nonChatNotifs: any[] = [];

    for (const notif of raekkerTilMail) {
      if (CHAT_NOTIFICATION_TYPES.has(notif.type)) {
        const existing = chatNotifsByUser.get(notif.user_id) || [];
        existing.push(notif);
        chatNotifsByUser.set(notif.user_id, existing);
      } else {
        nonChatNotifs.push(notif);
      }
    }

    // ── Rapport-tilstandsjoin: financial_reports + committed-state ──
    // Udvælgelsen (pure function) afgør mail/dispose/vent — se fejlspor
    // 2026-07-22 (natlige mails for slettede/duplikerede rapporter).
    const reportIds = [
      ...new Set(
        nonChatNotifs
          .filter((n: any) => REPORT_NOTIFICATION_TYPES.has(n.type) && n.reference_id)
          .map((n: any) => n.reference_id as string),
      ),
    ];
    const reportJoinMap = new Map<string, ReportJoin>();
    if (reportIds.length > 0) {
      const { data: reportRows } = await admin
        .from("financial_reports")
        .select("id, deleted_at, report_period, manual_report_period_key")
        .in("id", reportIds);
      // data_basis-undtagelse: committed-eksistens via source_report_id til mail-gating — ingen talberegning
      const { data: factRows } = await admin
        .from("financial_report_facts")
        .select("source_report_id")
        .in("source_report_id", reportIds);
      const committedIds = new Set((factRows || []).map((f: any) => f.source_report_id));
      for (const r of reportRows || []) {
        reportJoinMap.set(r.id, {
          deleted_at: r.deleted_at,
          committed: committedIds.has(r.id),
          period_key: r.manual_report_period_key ?? parseDkReportPeriodKey(r.report_period),
        });
      }
    }

    // ── «Set i appen» for community (Jonas 10/9): community_visninger har
    //    én række pr. bruger pr. tråd, skrevet når tråden åbnes
    //    (registrer_community_visning). reference_id er tråd-id for både
    //    opslag og nævnelser (notify-community-opslag:113,
    //    notify-community-naevnelse:185). Har modtageren set tråden, får
    //    kandidaten set_i_app = true og disposes i udvælgelsen — de der
    //    læste opslaget i går, skal ikke have mailen i morges. ──
    const communityKandidater = nonChatNotifs.filter(
      (n: any) => COMMUNITY_TRAAD_TYPES.has(n.type) && n.reference_id,
    );
    const setTraadeAf = new Set<string>(); // `${user_id}|${traad_id}`
    if (communityKandidater.length > 0) {
      const traadIds = [...new Set(communityKandidater.map((n: any) => n.reference_id as string))];
      const brugerIds = [...new Set(communityKandidater.map((n: any) => n.user_id as string))];
      const { data: visninger, error: visningFejl } = await admin
        .from("community_visninger")
        .select("traad_id, bruger_id")
        .in("traad_id", traadIds)
        .in("bruger_id", brugerIds);
      if (visningFejl) {
        // Fejler opslaget, dømmes ingen som set — hellere en mail for meget
        // end en tavs fejl; det skal ses i loggen.
        console.error("[set-i-app] community_visninger-opslag fejlede:", visningFejl.message);
      }
      for (const v of (visninger ?? []) as { traad_id: string; bruger_id: string }[]) {
        setTraadeAf.add(`${v.bruger_id}|${v.traad_id}`);
      }
    }

    const candidates = nonChatNotifs.map((n: any) => ({
      ...n,
      report:
        REPORT_NOTIFICATION_TYPES.has(n.type) && n.reference_id
          ? reportJoinMap.get(n.reference_id) ?? null // null = rapport findes ikke længere
          : undefined,
      set_i_app:
        COMMUNITY_TRAAD_TYPES.has(n.type) && n.reference_id
          ? setTraadeAf.has(`${n.user_id}|${n.reference_id}`)
          : undefined,
    }));

    const { toEmail, toDispose, disposeGrund, venterPaaTid, venterPaaVindue } = selectNotificationEmails(candidates);
    for (const notif of venterPaaTid) {
      const alderMin = Math.round((Date.now() - new Date(notif.created_at).getTime()) / 60_000);
      console.log(`[venter] for ung — ${notif.type} ${notif.id}: ${alderMin} af ${emailDelayMinutes(notif.type)} min`);
    }
    for (const notif of venterPaaVindue) {
      console.log(`[venter] uden for vinduet 07–20 — ${notif.type} ${notif.id}`);
    }

    // Dispose: marker email_sent_at UDEN at sende — samme mekanisme som
    // commit-suppress. Kolonnen betyder «behandlet», ikke «sendt». Grunden
    // står i loggen, så en senere læser ikke tror mailen gik ud:
    //   set_i_app    — modtageren har set tråden i appen (community_visninger)
    //   foraeldet    — begivenhed ældre end 12 t (BEGIVENHED_MAKS_ALDER_MS)
    //   rapport_vaek — rapporten er slettet/committet
    //   dublet       — samme (company, periode), nyeste vandt
    for (const notif of toDispose) {
      const grund = disposeGrund.get(notif.id) ?? "ukendt";
      await stempl(notif, grund);
      const alderTimer = Math.round((Date.now() - new Date(notif.created_at).getTime()) / 3_600_000);
      console.log(
        `[dispose] IKKE SENDT — ${grund}: ${notif.type} ${notif.id} (ref=${notif.reference_id}, ${alderTimer} t gammel, grænse ${BEGIVENHED_MAKS_ALDER_MS / 3_600_000} t for begivenheder)`,
      );
      skipped++;
    }

    // ── «Set i appen» for chatten (10/9): messages.read_at ──
    //    chat_reply peger på beskeden (reference_type "message"). Er den
    //    læst i chatten (mark_messages_read → read_at), disposes den her —
    //    før aggregeringen — så en samlet mail hverken sendes for eller
    //    tæller læste beskeder. Fejler opslaget, dømmes ingen som læst:
    //    hellere en mail for meget end en tavs fejl, og det står i loggen.
    {
      const alleChat = [...chatNotifsByUser.values()].flat();
      const beskedIds = [...new Set(alleChat.filter(erChatBeskedRef).map((n) => n.reference_id as string))];
      const laesteBeskedIds = new Set<string>();
      if (beskedIds.length > 0) {
        const { data: laeste, error: laestFejl } = await admin
          .from("messages")
          .select("id")
          .in("id", beskedIds)
          .not("read_at", "is", null);
        if (laestFejl) {
          console.error("[set-i-app] messages.read_at-opslag fejlede:", laestFejl.message);
        }
        for (const m of (laeste ?? []) as { id: string }[]) laesteBeskedIds.add(m.id);
      }
      if (laesteBeskedIds.size > 0) {
        for (const [userId, chatNotifs] of [...chatNotifsByUser.entries()]) {
          const { send: tilbage, disposed } = delChatKandidater(chatNotifs, laesteBeskedIds);
          for (const n of disposed) {
            await stempl(n, "set_i_app");
            console.log(`[dispose] IKKE SENDT — set_i_app: ${n.type} ${n.id} (besked ${n.reference_id} læst i chatten)`);
            skipped++;
          }
          if (tilbage.length === 0) chatNotifsByUser.delete(userId);
          else if (disposed.length > 0) chatNotifsByUser.set(userId, tilbage);
        }
      }
    }

    // ── Process aggregated chat notifications (one email per user) ──
    for (const [userId, chatNotifs] of chatNotifsByUser.entries()) {
      const userDailyCount = countMap[userId] || 0;
      if (userDailyCount >= MAX_EMAILS_PER_DAY) {
        console.log(`[anti-spam] Skipping chat notifs for user ${userId} (${userDailyCount} emails today)`);
        skipped += chatNotifs.length;
        continue;
      }

      if (advisorUserIds.has(userId)) {
        for (const n of chatNotifs) await stempl(n, "advisor");
        console.log(`[advisor-skip] Skipping ${chatNotifs.length} chat emails for advisor ${userId}`);
        skipped += chatNotifs.length;
        continue;
      }

      const userPrefs = prefsByUser.get(userId);
      if (userPrefs && (userPrefs as any).important === false) {
        for (const n of chatNotifs) await stempl(n, "pref_optout");
        console.log(`[pref-optout] User ${userId} opted out of important emails`);
        skipped += chatNotifs.length;
        continue;
      }

      const userEmail = userEmailMap.get(userId);
      if (!userEmail) {
        skipped += chatNotifs.length;
        continue;
      }

      // Aggregate: use the latest notification for deep_link, send one email
      const latestNotif = chatNotifs[chatNotifs.length - 1];
      const msgCount = chatNotifs.length;
      const subject = msgCount > 1
        ? `Du har ${msgCount} ulæste beskeder fra din rådgiver`
        : (EMAIL_SUBJECTS[latestNotif.type] || latestNotif.title);
      const body = msgCount > 1
        ? `Du har ${msgCount} ulæste beskeder. Log ind for at læse dem.`
        : (latestNotif.body || "");
      const deepLink = latestNotif.deep_link || "/chat";

      const html = buildEmailHtml(
        subject,
        body,
        deepLink,
        "Læs beskeden →",
        "Ny besked",
        undefined
      );

      const resultat = await send({
        adminClient: admin,
        to: userEmail,
        from: SENDER_FROM,
        subject,
        html,
        text: subject,
        label: `notification-chat_aggregated`,
      }, chatNotifs);

      if (!resultat.sent) {
        console.error(`Mail ikke sendt (${resultat.reason}) for aggregated chat notifs user ${userId}`);
        skipped += chatNotifs.length;
        if (skalKoeStoppe(resultat)) {
          // Resten af chat-brugerne OG hele nonChat-løkken venter til næste kørsel.
          const tilbage = [...chatNotifsByUser.keys()].indexOf(userId);
          rateLimit = {
            retryAfterSeconds: resultat.reason === "rate_limited" ? resultat.retryAfterSeconds : null,
            tilbage: chatNotifsByUser.size - tilbage - 1 + toEmail.length,
          };
          console.error(`[rate-limit] udbyderen afviste (429) — stopper kørslen; ${rateLimit.tilbage} kandidater venter til næste kørsel (Retry-After ${rateLimit.retryAfterSeconds ?? "ukendt"})`);
          break;
        }
        continue;
      }

      // Mark all chat notifications as email_sent
      for (const n of chatNotifs) await stempl(n, "sendt");

      countMap[userId] = (countMap[userId] || 0) + 1;
      sent += chatNotifs.length;
      mailsSendt++;
    }

    // ── Community-opslag: tråd + forfatter + virksomhed pr. reference_id ──
    // Kun aktive tråde; resten disposes i løkken. Virksomheden vælges som
    // get_community_medlemmer gør det: ældste medlemskab først.
    const opslagByTraadId = new Map<string, Parameters<typeof opslagsMail>[0]>();
    const opslagTraadIds = [
      ...new Set(
        toEmail
          .filter((n: any) => n.type === COMMUNITY_OPSLAG_TYPE && n.reference_id)
          .map((n: any) => n.reference_id as string),
      ),
    ];
    if (opslagTraadIds.length > 0) {
      const { data: traade } = await admin
        .from("community_traade")
        .select("id, titel, indhold, forfatter_id, status")
        .in("id", opslagTraadIds)
        .eq("status", "aktiv");
      const forfatterIds = [...new Set((traade || []).map((t: any) => t.forfatter_id as string))];
      const profilMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      const virksomhedMap = new Map<string, string>();
      if (forfatterIds.length > 0) {
        const { data: profiler } = await admin
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", forfatterIds);
        for (const p of profiler || []) profilMap.set(p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url });
        const { data: medlemskaber } = await admin
          .from("company_members")
          .select("user_id, created_at, company_id, companies(name)")
          .in("user_id", forfatterIds)
          .order("created_at", { ascending: true });
        for (const m of (medlemskaber || []) as any[]) {
          const navn = m.companies?.name;
          if (typeof navn === "string" && !virksomhedMap.has(m.user_id)) virksomhedMap.set(m.user_id, navn);
        }
      }
      for (const t of (traade || []) as any[]) {
        const profil = profilMap.get(t.forfatter_id);
        opslagByTraadId.set(t.id, {
          traadId: t.id,
          titel: t.titel,
          indhold: t.indhold,
          forfatterNavn: profil?.full_name ?? null,
          forfatterAvatarUrl: profil?.avatar_url ?? null,
          forfatterVirksomhed: virksomhedMap.get(t.forfatter_id) ?? null,
        });
      }
    }

    // ── Process non-chat notifications (én mail per udvalgt kandidat) ──
    for (let i = 0; i < toEmail.length; i++) {
      const notif = toEmail[i];
      if (rateLimit) break; // chat-løkken ramte loftet — intet mere i denne kørsel
      const userDailyCount = countMap[notif.user_id] || 0;
      if (userDailyCount >= MAX_EMAILS_PER_DAY) {
        console.log(`[anti-spam] Skipping user ${notif.user_id} (${userDailyCount} emails today)`);
        skipped++;
        continue;
      }

      // Advisor/admin email suppression: skip email for Slack-covered events
      if (advisorUserIds.has(notif.user_id)) {
        // Mark email_sent_at to prevent future retries, but don't actually send
        await stempl(notif, "advisor");
        console.log(`[advisor-skip] Skipping email for advisor ${notif.user_id}, type=${notif.type}`);
        skipped++;
        continue;
      }

      // User email preference opt-out
      const userPrefs = prefsByUser.get(notif.user_id);
      if (userPrefs) {
        const priorityKey = notif.priority as string;
        if ((userPrefs as any)[priorityKey] === false) {
          await stempl(notif, "pref_optout");
          console.log(`[pref-optout] User ${notif.user_id} opted out of ${priorityKey} emails`);
          skipped++;
          continue;
        }
      }

      // Get user email
      const userEmail = userEmailMap.get(notif.user_id);
      if (!userEmail) {
        skipped++;
        continue;
      }

      // Template-aware subject and body rendering
      const tplName = NOTIFICATION_TEMPLATE_NAMES[notif.type];
      const tpl = tplName ? notifTemplateMap.get(tplName) : undefined;

      // Subject: use DB template if available, else hardcoded fallback
      let subject = tpl?.subject
        ? tpl.subject
            .replace("{{title}}", notif.title)
            .replace("{{type}}", notif.type)
        : (EMAIL_SUBJECTS[notif.type] || notif.title);

      // Body: use DB template if available, else buildEmailHtml with hardcoded content
      const deepLink = notif.deep_link || "/";
      // Escaping: body/title er tekst. Funktions-replacer, så «$&»/«$1» i
      // teksten ikke tolkes som replace-mønstre.
      let html = tpl?.body_html
        ? tpl.body_html
            .replace(/\{\{body\}\}/g, () => escHtmlMedLinjeskift(notif.body || ""))
            .replace(/\{\{deep_link\}\}/g, () => escHtml(notif.deep_link || "/"))
            .replace(/\{\{cta_label\}\}/g, ctaLabels[notif.type] || "Åbn i The Boardroom →")
            .replace(/\{\{eyebrow\}\}/g, eyebrows[notif.type] || "")
            .replace(/\{\{highlight\}\}/g, highlights[notif.type] || "")
            .replace(/\{\{title\}\}/g, () => escHtml(notif.title))
            .replace(/\{\{first_name\}\}/g, "")
        : buildEmailHtml(
            notif.title,
            notif.body || "",
            deepLink,
            ctaLabels[notif.type],
            eyebrows[notif.type],
            highlights[notif.type]
          );
      let text = subject;

      // Nyt community-opslag: mailen er tråden selv (portræt, navn,
      // virksomhed, uddrag, knap) — ikke title/body. Manglende/inaktiv
      // tråd → dispose uden mail.
      if (notif.type === COMMUNITY_OPSLAG_TYPE) {
        const opslag = notif.reference_id ? opslagByTraadId.get(notif.reference_id) : undefined;
        if (!opslag) {
          await stempl(notif, "traad_vaek");
          console.log(`[dispose] ${notif.type} ${notif.id} (traad=${notif.reference_id}) — tråd mangler/inaktiv, ingen mail`);
          skipped++;
          continue;
        }
        const mail = opslagsMail(opslag);
        subject = mail.subject;
        html = mail.html;
        text = mail.text;
      }

      const senderFrom = tpl?.sender_name
        ? `${tpl.sender_name} <${VERIFIED_FROM_EMAIL}>`
        : SENDER_FROM;

      const resultat = await send({
        adminClient: admin,
        to: userEmail,
        from: senderFrom,
        subject,
        html,
        text,
        label: `notification-${notif.type}`,
        idempotencyKey: `notification-${notif.id}`,
      }, [notif]);

      if (!resultat.sent) {
        console.error(`Mail ikke sendt (${resultat.reason}) for ${notif.id}`);
        skipped++;
        if (skalKoeStoppe(resultat)) {
          rateLimit = {
            retryAfterSeconds: resultat.reason === "rate_limited" ? resultat.retryAfterSeconds : null,
            tilbage: toEmail.length - i - 1,
          };
          console.error(`[rate-limit] udbyderen afviste (429) — stopper kørslen; ${rateLimit.tilbage} kandidater venter til næste kørsel (Retry-After ${rateLimit.retryAfterSeconds ?? "ukendt"})`);
          break;
        }
        continue;
      }

      // Mark email_sent_at
      await stempl(notif, "sendt");

      countMap[notif.user_id] = (countMap[notif.user_id] || 0) + 1;
      sent++;
      mailsSendt++;
    }

    // ── SAMLEMAILEN (PR 2, 15/9): opslag, fordeling og afsendelse — EFTER
    //    de to eksisterende løkker, og ikke hvis kørslen allerede ramte
    //    loftet. Dommene (rådgiver, pref, mail, kvote, sidst sendt,
    //    forældet, mapning) ligger i fordelSamlemail (_shared/samlemail.ts). ──
    let samlemailSendt = 0;
    let samlemailStemplet = 0;
    let samlemailVenter = 0;
    if (samlemailTilFordeling.length > 0 && !rateLimit) {
      // Opslag pr. række: events og tråde på reference_id, forfatternes navn,
      // og «set i appen» med samme dom som køen (community_visninger).
      const eventIds = [...new Set(samlemailTilFordeling.filter((n) => n.type === "event_published" && n.reference_id).map((n) => n.reference_id as string))];
      const traadIds = [...new Set(samlemailTilFordeling.filter((n) => n.type === "community_opslag" && n.reference_id).map((n) => n.reference_id as string))];
      const eventById = new Map<string, { title: string; starts_at: string; meet_url: string | null; status: string }>();
      if (eventIds.length > 0) {
        const { data: eventRows, error: eventFejl } = await admin
          .from("events")
          .select("id, title, starts_at, meet_url, status")
          .in("id", eventIds);
        if (eventFejl) console.error("[samlemail] events-opslag fejlede:", eventFejl.message);
        for (const e of (eventRows || []) as any[]) eventById.set(e.id, { title: e.title, starts_at: e.starts_at, meet_url: e.meet_url ?? null, status: e.status });
      }
      const traadById = new Map<string, { titel: string; status: string; kilde_type: string | null; forfatter_id: string }>();
      const forfatternavn = new Map<string, string | null>();
      const samlemailSetTraade = new Set<string>(); // `${user_id}|${traad_id}` — samme dom som setTraadeAf
      if (traadIds.length > 0) {
        const { data: traadRows, error: traadFejl } = await admin
          .from("community_traade")
          .select("id, titel, status, kilde_type, forfatter_id")
          .in("id", traadIds);
        if (traadFejl) console.error("[samlemail] community_traade-opslag fejlede:", traadFejl.message);
        for (const t of (traadRows || []) as any[]) traadById.set(t.id, { titel: t.titel, status: t.status, kilde_type: t.kilde_type ?? null, forfatter_id: t.forfatter_id });
        const forfatterIds = [...new Set([...traadById.values()].map((t) => t.forfatter_id))];
        if (forfatterIds.length > 0) {
          const { data: forfattere } = await admin.from("profiles").select("user_id, full_name").in("user_id", forfatterIds);
          for (const f of (forfattere || []) as any[]) forfatternavn.set(f.user_id, f.full_name ?? null);
        }
        const brugerIds = [...new Set(samlemailTilFordeling.filter((n) => n.type === "community_opslag").map((n) => n.user_id))];
        const { data: visninger, error: visningFejl } = await admin
          .from("community_visninger")
          .select("traad_id, bruger_id")
          .in("traad_id", traadIds)
          .in("bruger_id", brugerIds);
        if (visningFejl) console.error("[samlemail] community_visninger-opslag fejlede:", visningFejl.message);
        for (const v of (visninger ?? []) as { traad_id: string; bruger_id: string }[]) samlemailSetTraade.add(`${v.bruger_id}|${v.traad_id}`);
      }
      const opslaaet = new Map<string, OpslaaetData>();
      for (const n of samlemailTilFordeling) {
        if (n.type === "event_published") {
          opslaaet.set(n.id, { event: n.reference_id ? eventById.get(n.reference_id) ?? null : null });
        } else {
          const traad = n.reference_id ? traadById.get(n.reference_id) ?? null : null;
          opslaaet.set(n.id, {
            traad,
            forfatternavn: traad ? forfatternavn.get(traad.forfatter_id) ?? null : null,
            harAabnetTraaden: n.reference_id ? samlemailSetTraade.has(`${n.user_id}|${n.reference_id}`) : false,
          });
        }
      }

      // Modtagerne: rådgiver (samme opslag som køen), pref, mail, fornavn,
      // sidst sendt (email_send_log, label SAMLEMAIL_LABEL, status sent) og
      // dagskvoten (køens countMap — ikke hentet igen).
      const samlemailUserIds = [...new Set(samlemailTilFordeling.map((n) => n.user_id))];
      const raadgiverIds = advisorUserIds; // alias: rådgiverdommen ligger i fordelSamlemail, ikke i endnu en gate i denne fil
      const fornavnAf = new Map<string, string | null>();
      const { data: modtagerProfiler } = await admin.from("profiles").select("user_id, full_name").in("user_id", samlemailUserIds);
      for (const p of (modtagerProfiler || []) as any[]) fornavnAf.set(p.user_id, fornavnFraFuldtNavn(p.full_name));
      const sidstSendtPrMail = new Map<string, Date>();
      const samlemailMails = samlemailUserIds.map((uid) => userEmailMap.get(uid)).filter((e): e is string => !!e);
      if (samlemailMails.length > 0) {
        const { data: sendte } = await admin
          .from("email_send_log")
          .select("recipient_email, created_at")
          .eq("template_name", SAMLEMAIL_LABEL)
          .eq("status", "sent")
          .in("recipient_email", samlemailMails)
          .order("created_at", { ascending: false });
        for (const r of (sendte || []) as any[]) {
          if (!sidstSendtPrMail.has(r.recipient_email)) sidstSendtPrMail.set(r.recipient_email, new Date(r.created_at));
        }
      }
      const modtagere = new Map<string, SamlemailModtager>();
      for (const uid of samlemailUserIds) {
        const email = userEmailMap.get(uid) ?? null;
        const prefs = prefsByUser.get(uid) as { important?: unknown } | undefined;
        modtagere.set(uid, {
          erRaadgiver: raadgiverIds.has(uid),
          importantFra: !!prefs && prefs.important === false,
          email,
          fornavn: fornavnAf.get(uid) ?? null,
          sidstSendt: email ? sidstSendtPrMail.get(email) ?? null : null,
          dagskvoteNaaet: (countMap[uid] || 0) >= MAX_EMAILS_PER_DAY,
        });
      }

      const fordeling = fordelSamlemail({ nu, raekker: samlemailTilFordeling, opslaaet, modtagere });
      const raekkeById = new Map(samlemailTilFordeling.map((n) => [n.id, n]));
      for (const st of fordeling.stemplesUdenMail) {
        const n = raekkeById.get(st.id)!;
        await stempl(n, st.grund);
        console.log(`[dispose] IKKE SENDT — ${st.grund}: ${n.type} ${n.id} (samlemail)`);
        samlemailStemplet++;
        skipped++;
      }
      samlemailVenter = fordeling.venter.length;
      for (const v of fordeling.venter) console.log(`[venter] samlemail — ${v.grund}: ${v.id}`);

      for (const m of fordeling.mails) {
        const mail = bygSamlemail({ fornavn: m.fornavn, punkter: m.punkter, nu, appUrl: APP_URL });
        const raekker = m.raekkeIder.map((id) => raekkeById.get(id)!);
        const resultat = await send({
          adminClient: admin,
          to: m.email,
          from: SENDER_FROM,
          subject: mail.emne,
          html: mail.html,
          text: mail.tekst,
          label: SAMLEMAIL_LABEL,
          idempotencyKey: m.idempotencyKey,
        }, [{ id: m.raekkeIder[0], user_id: m.userId, type: "samlemail", ids: m.raekkeIder }]);

        if (!resultat.sent) {
          console.error(`Mail ikke sendt (${resultat.reason}) for samlemail til ${m.userId}`);
          skipped += raekker.length;
          if (skalKoeStoppe(resultat)) {
            rateLimit = {
              retryAfterSeconds: resultat.reason === "rate_limited" ? resultat.retryAfterSeconds : null,
              tilbage: fordeling.mails.length - fordeling.mails.indexOf(m) - 1,
            };
            console.error(`[rate-limit] udbyderen afviste (429) — stopper kørslen; ${rateLimit.tilbage} samlemails venter til næste kørsel (Retry-After ${rateLimit.retryAfterSeconds ?? "ukendt"})`);
            break;
          }
          continue;
        }

        for (const n of raekker) await stempl(n, "sendt");
        countMap[m.userId] = (countMap[m.userId] || 0) + 1;
        sent += raekker.length;
        mailsSendt++;
        samlemailSendt++;
      }
    } else if (samlemailTilFordeling.length > 0) {
      samlemailVenter = samlemailTilFordeling.length; // loftet ramt tidligere i kørslen — venter til næste
    }

    const summary = {
      // processed tæller køens rækker + samlemailens hentede (PR 2), så
      // sent + skipped + venter går op: samlemailens ventende står i samlemail.venter.
      processed: pending.length + samlemailRaekker.length,
      sent,
      skipped,
      // Udløbet-reglen (15/9): rækker stemplet uden mail fordi alle brugerens virksomheder er expired.
      udloebet,
      venter_paa_tid: venterPaaTid.length,
      venter_paa_vindue: venterPaaVindue.length,
      mails_sendt: mailsSendt,
      // Stoppet ved udbyderens loft: hvor mange der venter, og hvad Retry-After sagde.
      rate_limited: rateLimit !== null,
      rate_limit_tilbage: rateLimit?.tilbage ?? 0,
      rate_limit_retry_after_seconds: rateLimit?.retryAfterSeconds ?? null,
      // Samlemailen (PR 2, 15/9): hentet kun i vinduet 17–20 dansk.
      samlemail: {
        i_vinduet: samlemailIVinduet,
        hentet: samlemailRaekker.length,
        udloebet: samlemailUdloebet,
        mails: samlemailSendt,
        stemplet_uden_mail: samlemailStemplet,
        venter: samlemailVenter,
      },
      // Tørkørsel (15/9): intet sendt, intet stemplet, intet i email_send_log — kun hvad der VILLE ske.
      ...(toerKoersel ? { dry_run: true, nu: nu.toISOString(), ville_sende: villeSende, ville_stemple: villeStemple } : {}),
    };
    console.log("[send-notification-email] Summary:", JSON.stringify(summary));
    return json(summary);
  } catch (err) {
    console.error("send-notification-email error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
