/**
 * send-monthly-digest — Monthly personalised digest email to founders
 *
 * Admin/advisor only (browser or cron trigger).
 * Sends each founder a summary: KPI movement, upcoming milestones, unread advisor messages.
 * Milepæle (8/9): kommende OG forfaldne, dømt af _shared/milepaelDom gennem
 * _shared/digestMilepaele — se dennes filhoved for beslutningerne.
 *
 * Gaten (10/9, _shared/digestGate.ts): cronen sender kun på DIGEST_DAG (22.);
 * admin-knappen tester til én adresse som standard og sender kun til alle
 * ved eksplicit { send_til_alle: true }. Hver rigtig mail bærer nøglen
 * monthly-digest:<YYYY-MM>:<userId>, og dedup'en i email_send_log er pr.
 * MÅNED (ikke pr. dag) og ser bort fra testmails.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, parseJwtClaims, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const FROM = SENDER_FROM;
const APP_URL = "https://app.theboardroom.dk";

const DANISH_MONTHS = [
  "Januar","Februar","Marts","April","Maj","Juni",
  "Juli","August","September","Oktober","November","December",
];

import { bulletproofButton, fallbackLinkBlock } from "../_shared/emailButtonHelpers.ts";
import { computeMembershipTier } from "../_shared/membershipTier.ts";
import { sendManagedEmail, SENDER_FROM } from "../_shared/managedEmail.ts";
import { digestMilepaeleTekst, udvaelgDigestMilepaele, type DigestMilepael } from "../_shared/digestMilepaele.ts";
import { afgoerDigestKald, digestNoegle, digestPeriode, maanedensStart } from "../_shared/digestGate.ts";

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
    <h1 style="color:#0f1117;font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;letter-spacing:-.02em">${title}</h1>
    <p style="color:#4a4a4a;font-size:14px;line-height:24px;margin:0 0 14px;white-space:pre-line">${body}</p>
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

/** Svaret til cron/admin. Fandtes ikke før 8/9: `json` var aldrig defineret
    (siden 009fd482), så funktionen kastede ReferenceError EFTER at mails var
    sendt — cronen så en fejl, medlemmerne fik mailen. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function formatDKK(n: number): string {
  // Simple Danish number format
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}${formatted} kr.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Support service-role calls (cron) — bypass user auth
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.startsWith("Bearer ")
    && parseJwtClaims(authHeader.slice("Bearer ".length).trim())?.role === "service_role";

  if (!isServiceRole) {
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;
    const { callerId, callerClient } = auth;

    // Verify caller is admin or advisor.
    // Rettet 10/9 (rolletjek-buggen): en bruger med BÅDE admin og advisor gav
    // to rækker, .maybeSingle() fejlede og `const { data }` slugte det — en
    // admin fik 403 af sin egen rolle. Højst én række; opslagsfejl er 500.
    const { data: roleRows, error: roleError } = await callerClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "advisor"])
      .limit(1);

    if (roleError) {
      console.error("[send-monthly-digest] rolleopslag fejlede:", roleError.message);
      return json({ error: "Rolleopslag fejlede" }, 500);
    }
    if (!roleRows?.length) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, svcKey);

  // Body: { company_ids?: string[], test_email?: string, send_til_alle?: true }
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json().catch(() => ({}));
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch { /* ingen body */ }

  let targetCompanyIds: string[] | null = null;
  if (Array.isArray(body.company_ids) && body.company_ids.length > 0) {
    targetCompanyIds = body.company_ids as string[];
  }

  // ── Gaten (10/9): hvem kalder, hvilken dag, til hvem ──
  const now = new Date();
  const dom = afgoerDigestKald({ kaldtAf: isServiceRole ? "cron" : "admin", body, now });
  if (dom.tilstand === "cron_ikke_digestdag") {
    console.log(`[digest] cron kaldt den ${dom.dag}. — ikke digestdag, intet sendt`);
    return json({ ok: true, tilstand: dom.tilstand, dag: dom.dag, sent: 0 });
  }
  if (dom.tilstand === "admin_afvist") {
    return json({ error: dom.grund, tilstand: dom.tilstand }, 400);
  }
  const testEmail = dom.tilstand === "admin_test" ? dom.testEmail : null;
  const periode = digestPeriode(now);
  console.log(`[digest] tilstand=${dom.tilstand} periode=${periode}${testEmail ? " (test)" : ""}`);

  // Fetch all company members
  const { data: members } = await adminClient
    .from("company_members")
    .select("company_id, user_id")
    .limit(500);

  // Fetch membership tier — skip expired companies
  const { data: companiesMeta } = await adminClient
    .from("companies")
    .select("id, contract_end_date, subscription_status, subscription_current_period_end");

  const _now = new Date();
  const activeMembershipIds = new Set<string>(
    (companiesMeta || [])
      .filter((c: any) => computeMembershipTier(c, _now) !== "expired")
      .map((c: any) => c.id)
  );

  if (!members?.length) {
    return json({ ok: true, tilstand: dom.tilstand, sent: 0, skipped_dedup: 0 });
  }

  // Deduplicate: one digest per company (first member = owner)
  const companyToUser = new Map<string, string>();
  for (const m of members) {
    if (!companyToUser.has(m.company_id)) companyToUser.set(m.company_id, m.user_id);
  }

  // Filter out advisors/admins
  const allUserIds = [...new Set(companyToUser.values())];
  const { data: roleRows } = await adminClient
    .from("user_roles")
    .select("user_id")
    .in("user_id", allUserIds)
    .in("role", ["advisor", "admin"]);
  const advisorIds = new Set((roleRows || []).map((r: { user_id: string }) => r.user_id));

  let sent = 0;
  let skippedDedup = 0;
  const currentMonthLabel = `${DANISH_MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  for (const [companyId, userId] of companyToUser) {
    if (targetCompanyIds && !targetCompanyIds.includes(companyId)) continue;
    if (advisorIds.has(userId)) continue;
    if (!activeMembershipIds.has(companyId)) continue;

    // Get user email
    const { data: userData } = await adminClient.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) continue;

    // Dedup pr. MÅNED (10/9): før var vinduet «i dag», så et klik på
    // admin-knappen den 23. sendte alle en dublet af den 22.'s digest.
    // Testmails (is_test) tæller ikke — de går til admin selv. Og
    // .maybeSingle() er væk: to rækker gav en fejl, `data` null, og
    // dedup'en sagde «ikke sendt» netop når der var sendt mest.
    if (!testEmail) {
      const { data: alreadySent, error: dedupError } = await adminClient
        .from("email_send_log")
        .select("id")
        .eq("recipient_email", email)
        .eq("template_name", "monthly-digest")
        .not("is_test", "is", true)
        .gte("created_at", maanedensStart(now).toISOString())
        .limit(1);
      if (dedupError) {
        // Kan vi ikke læse loggen, sender vi ikke — hellere en manglende
        // digest end en dublet til hele medlemsbasen.
        console.error(`[digest] dedup-opslag fejlede for ${userId}: ${dedupError.message} — springer over`);
        skippedDedup++;
        continue;
      }
      if (alreadySent?.length) {
        console.log(`[digest] Already sent to user ${userId} in ${periode}, skipping`);
        skippedDedup++;
        continue;
      }
    }

    const { data: profile } = await adminClient
      .from("profiles").select("full_name, notification_email_prefs").eq("user_id", userId).maybeSingle();
    const firstName = profile?.full_name?.split(" ")[0] || "dig";

    // Respect user opt-out preference
    const digestPrefs = (profile?.notification_email_prefs as any) || {};
    if (digestPrefs.monthly_digest === false) {
      console.log(`[digest] User ${userId} opted out of monthly digest`);
      continue;
    }

    const { data: company } = await adminClient
      .from("companies").select("name").eq("id", companyId).maybeSingle();
    const companyName = company?.name || "";

    // Latest committed facts (most recent period)
    // data_basis-undtagelse: digest-mail viser seneste tal som visning — estimat-markering i mails hører til visnings-sporet
    const { data: facts } = await adminClient
      .from("financial_report_facts")
      .select("period_label, metrics")
      .eq("company_id", companyId)
      .order("period_key", { ascending: false })
      .limit(2);

    // Milepæle med frist — dommen (kommende / forfalden / færdig / parkeret)
    // er motorens (_shared/milepaelDom via digestMilepaele), ikke et
    // datofilter. Før (8/9): progress < 100 og KUN en øvre grænse
    // (deadline <= +30 dage), så april-fristerne stod som «deadline snart».
    const { data: milepaelRaekker } = await adminClient
      .from("milestones")
      .select("title, deadline, progress, status, target_value, current_value, unit")
      .eq("company_id", companyId)
      .not("deadline", "is", null)
      .order("deadline", { ascending: true })
      .limit(100);
    const milepaele = udvaelgDigestMilepaele((milepaelRaekker ?? []) as DigestMilepael[], now);
    const milepaeleTekst = digestMilepaeleTekst(milepaele);

    // Unread advisor messages
    const { data: conv } = await adminClient
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    let unreadCount = 0;
    if (conv?.id) {
      const { count } = await adminClient
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender_id", userId)
        .is("read_at", null)
        .eq("message_type", "user");
      unreadCount = count || 0;
    }

    // Fetch latest agent insight
    let latestAgentInsight: string | null = null;
    if (conv?.id) {
      const { data: agentMsgs } = await adminClient
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", conv.id)
        .eq("context_type", "agent")
        .order("created_at", { ascending: false })
        .limit(1);
      latestAgentInsight = agentMsgs?.[0]?.content?.slice(0, 400) || null;
    }

    // Build KPI highlight
    const latestFact = facts?.[0];
    const metrics = latestFact?.metrics as Record<string, number> | null;
    const revenue = metrics?.revenue;
    const result = metrics?.ebt;

    let highlight = "";
    if (revenue != null && latestFact?.period_label) {
      highlight = `${latestFact.period_label}: Omsætning ${formatDKK(revenue)}`;
      if (result != null) highlight += ` · Resultat ${formatDKK(result)}`;
    }

    // Build body
    const bodyLines = [`Her er dit overblik for ${currentMonthLabel}, ${firstName}.`];
    if (milepaeleTekst) bodyLines.push(milepaeleTekst);
    if (unreadCount > 0) {
      bodyLines.push(`\nDu har ${unreadCount} ulæst${unreadCount > 1 ? "e" : ""} besked${unreadCount > 1 ? "er" : ""} fra din rådgiver.`);
    }
    if (latestAgentInsight) {
      bodyLines.push(`\n${`<div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0;padding:12px 14px;margin:16px 0"><p style="color:#166534;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px">AI-indsigt denne måned</p><p style="color:#4a4a4a;font-size:13px;line-height:20px;margin:0">${latestAgentInsight}</p></div>`}`);
    }
    if (!milepaeleTekst && unreadCount === 0 && !highlight && !latestAgentInsight) {
      console.log(`[digest] Skipping ${email} — no relevant content this month`);
      continue;
    }

    // Add secondary action links when multiple content types are present
    if (milepaeleTekst && unreadCount > 0) {
      bodyLines.push(`\nGå direkte til: <a href="${APP_URL}/chat" style="color:#16a34a">Beskeder</a> · <a href="${APP_URL}/milestones" style="color:#16a34a">Milestones</a> · <a href="${APP_URL}/kpis" style="color:#16a34a">Nøgletal</a>`);
    }

    // Choose the most relevant deep link based on what's in the digest
    let deepLink = "/";
    let ctaLabel = "Åbn dit boardroom";

    if (unreadCount > 0) {
      deepLink = "/chat";
      ctaLabel = "Læs beskeder fra din rådgiver";
    } else if (milepaeleTekst) {
      deepLink = "/milestones";
      ctaLabel = "Se dine milestones";
    } else if (revenue != null) {
      deepLink = "/kpis";
      ctaLabel = "Se dine nøgletal";
    }

    
    const html = buildEmailHtml(
      `Dit ${currentMonthLabel}-overblik`,
      bodyLines.join("\n"),
      deepLink,
      ctaLabel,
      `${companyName} · ${currentMonthLabel}`,
      highlight || undefined,
    );

    const subject = `Dit ${currentMonthLabel}-overblik`;

    // Test: mailen går til admin selv, mærket is_test, uden månedsnøgle —
    // så testen hverken bruger medlemmets nøgle eller tæller i dedup'en.
    const resultat = await sendManagedEmail({
      adminClient: adminClient,
      to: testEmail ?? email,
      from: FROM,
      subject: testEmail ? `[TEST] ${subject}` : subject,
      html,
      text: subject,
      label: "monthly-digest",
      idempotencyKey: testEmail ? undefined : digestNoegle(periode, userId),
      isTest: Boolean(testEmail),
      metadata: { periode, company_id: companyId, test: Boolean(testEmail) },
    });

    if (!resultat.sent) {
      console.error(`[digest] Mail ikke sendt (${resultat.reason}) for modtager`);
      continue;
    }

    sent++;
    // Én test er nok: første virksomhed med indhold, så stopper vi.
    if (testEmail) break;
  }

  console.log(`[send-monthly-digest] tilstand=${dom.tilstand} sent=${sent} skipped_dedup=${skippedDedup}`);
  return json({ ok: true, tilstand: dom.tilstand, periode, sent, skipped_dedup: skippedDedup, test_email: testEmail ?? undefined });
});
