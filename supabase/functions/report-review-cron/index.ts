/**
 * report-review-cron — «{periode} — gennemgå dine tal» når måneden er omme
 * (10/9-2026, de-tyve nr. 10). Bucket B: HTTP-indgang + authenticateServiceRole,
 * tørkørsel som standard; kun { "dry_run": false } skriver.
 *
 * HVAD: parsede rapporter (status processed) uden facts, ikke slettede, ikke
 * årsrapporter/sentinel. For hver spørges resolve_report_commit_candidate —
 * samme dom som parsingen og fladen — og de der er eligible, ikke blokerede
 * og fra en måned der er omme i dansk tid, får notifikationen parsingen ikke
 * kunne skrive (regel 6). Dedup_key report_review_ready:{id} gør daglig
 * kørsel harmløs; første kørsel rammer bagloggen (recon-tallene-tre.md §3c:
 * de ventende fra afsluttede måneder) — læs tørkørslen først.
 *
 * MAILEN går ad notifikationsvejen: send-notification-email, action_required,
 * 240 min forsinkelse for report_review_ready, vinduet 07–20, højst fem om
 * dagen, prefs. Klokken (#790) viser den straks som «Kræver handling».
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { writeNotification } from "../_shared/notificationWriter.ts";
import { afgoerReviewPaamindelse, reviewBesked, type ReviewKandidat } from "../_shared/reviewPaamindelse.ts";
import { maanedsNoegleKbh } from "../_shared/maanedsnoegle.ts";

const LOG = "[report-review-cron]";
const LOFT = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let dryRun = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) dryRun = false;
  } catch { /* ingen body = tørkørsel */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nu = new Date();

  try {
    const { data: rapporter, error: rErr } = await admin
      .from("financial_reports")
      .select("id, user_id, company_id, file_name, uploaded_at")
      .eq("status", "processed")
      .is("deleted_at", null)
      .not("report_type", "in", "(aarsrapport,annual_report)")
      .not("file_name", "like", "\\_annual\\_baseline\\_sentinel\\_%")
      .neq("file_path", "_sentinel")
      .order("uploaded_at", { ascending: false })
      .limit(LOFT);
    if (rErr) throw new Error(`financial_reports: ${rErr.message}`);

    const ids = (rapporter ?? []).map((r) => r.id as string);
    const medFacts = new Set<string>();
    if (ids.length > 0) {
      // data_basis-undtagelse: eksistenstjek, ingen beregning — HAR rapporten facts (uanset grundlag), skal den ikke mindes om godkendelse
      const { data: facts, error: fErr } = await admin
        .from("financial_report_facts")
        .select("source_report_id")
        .in("source_report_id", ids);
      if (fErr) throw new Error(`financial_report_facts: ${fErr.message}`);
      for (const f of facts ?? []) if (f.source_report_id) medFacts.add(f.source_report_id as string);
    }

    const kandidater: ReviewKandidat[] = [];
    for (const r of rapporter ?? []) {
      if (medFacts.has(r.id as string)) continue;
      // Resolveren bærer hele dommen (metrics, periode, regel 6, ejerskab) — ingen replikeret dom her.
      const { data: c, error: cErr } = await admin.rpc("resolve_report_commit_candidate", { p_report_id: r.id });
      if (cErr) {
        console.warn(`${LOG} resolveren fejlede for ${r.id}: ${cErr.message}`);
        continue;
      }
      kandidater.push({
        report_id: r.id as string,
        user_id: (r.user_id as string | null) ?? null,
        company_id: (r.company_id as string | null) ?? null,
        file_name: (r.file_name as string | null) ?? null,
        eligible: c?.eligible === true,
        state: (c?.state as string | null) ?? null,
        period_key: (c?.period_key as string | null) ?? null,
        period_label: (c?.period_label as string | null) ?? null,
      });
    }

    const domme = kandidater.map((k) => ({ k, dom: afgoerReviewPaamindelse(k, nu) }));
    const klar = domme.filter((d) => d.dom.skal).map((d) => d.k);
    const afvist: Record<string, number> = {};
    for (const d of domme) if (!d.dom.skal) afvist[d.dom.grund] = (afvist[d.dom.grund] ?? 0) + 1;

    let skrevet = 0;
    let dedup = 0;
    if (!dryRun) {
      for (const k of klar) {
        const ok = await writeNotification(admin, { ...reviewBesked(k), user_id: k.user_id! });
        if (ok) skrevet++; else dedup++;
      }
    }

    const resultat = {
      ok: true,
      dry_run: dryRun,
      maaned_kbh: maanedsNoegleKbh(nu),
      parsede_uden_facts: kandidater.length,
      ville_skrive: klar.length,
      skrevet,
      allerede_skrevet: dedup,
      afvist,
      kandidater: klar.map((k) => ({ report_id: k.report_id, period_key: k.period_key, period_label: k.period_label, file_name: k.file_name })),
    };
    console.log(`${LOG} Summary:`, JSON.stringify({ ...resultat, kandidater: resultat.kandidater.length }));
    return new Response(JSON.stringify(resultat), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(`${LOG} fejl:`, e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
