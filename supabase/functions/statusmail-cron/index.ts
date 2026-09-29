// statusmail-cron — den ugentlige statusmail til rådgiverne med medlemsoverblikket
// (TRIN 2, 29/9-2026; trin 1 = _shared/statusMail.ts + _shared/medlemsOverblik.ts, #1124).
//
// JONAS 29/9: «Vi har brug for et samlet overblik, så vi ikke skal tjekke på hver
// enkelt kunde» — og en ugentlig mail med status på det hele. BESLUTTET (Claude
// 29/9, Jonas har ikke indvendt): mandag kl. 7 dansk tid, til alle i user_roles
// advisor/admin (Jonas og Morten).
//
// SAMME FORM SOM klokke-mail-cron: HTTP-indgang, authenticateServiceRole FØRST bag
// verify_jwt = true (Bucket B), service-role-klient, try/catch om kørslen,
// TØRKØRSEL SOM STANDARD (kun et eksplicit { "dry_run": false } sender), body
// STRIKS (bodyFelter.guard): dry_run · nu.
//
// VINDUET (statusMail.ts erStatusmailVindue — mekanismen er klokke-mail-cronens
// erMorgenkoersel): dansk mandag og dansk time ≥ 7. Cron-jobbet kører mandag kl.
// 05:33 og 06:33 UTC; sommer sender den første (07:33 dansk), vinter den anden
// (07:33 dansk). Uden for vinduet svares «uden_for_vindue» UDEN at hente noget.
//
// HENTNINGEN er hookens (src/hooks/medlemsOverblik.ts) — de 13 kilder + logins,
// side for side, ingen .limit, PRÆCIS samme filtre (amount_dkk 0, deleted_at
// null, uden sentinel, is_demo i companies-select; kildeværnet statusmailCron.guard
// sammenligner filtrene i hook og function, så de ikke kan glide fra hinanden).
// Eneste tilføjelse: companies.name til navne-kortet. Derefter ÉT kald
// byggOverblik — sammenkoblingen bor i motoren, ikke her.
//
// MODTAGERE OG AFSENDELSE som klokke-mail-cron: user_roles advisor/admin →
// auth.admin.getUserById → fornavn fra profiles. Opslag i email_send_log på
// statusMailNoegle (én pr. rådgiver pr. dansk ISO-uge) FØR afsendelsen — sent/
// suppressed = spring over; sendManagedEmail med idempotencyKey = nøglen, label
// STATUSMAIL_LABEL, html fra indgangsMailHtml (eyebrow «Medlemsoverblik»), text
// fra statusMailTekst.
//
// FEJL: fejler afsendelsen til én, fortsættes til den næste, og der skrives ÉN
// drift-klokke pr. kørsel med fejl (skrivRaadgiverBesked, type «drift»,
// reference_type «statusmail»). Denne function mailer IKKE selv driftmodtageren —
// derfor står «statusmail» IKKE på klokkeMail.ts' SELVMAILENDE_REFERENCER:
// klokke-mail-cron skal netop MAILE den klokke (ALARM til driftmodtageren), ellers
// var fejlen kun et signal i en browser (princip 1).
//
// KASTER ALDRIG mod én modtager: fejler én, tælles hun, og de andre får deres mail.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { byggOverblik, FILTER_MAERKER, harMaerke, type Maerke, type OverbliksKilder } from "../_shared/medlemsOverblik.ts";
import { erStatusmailVindue, isoUgeTekst, STATUSMAIL_LABEL, statusMailNoegle, statusMailTekst } from "../_shared/statusMail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[statusmail-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu"] as const;
/** Klokkens reference_type ved fejl. IKKE selvmailende — klokke-mail-cron mailer den. */
export const STATUSMAIL_REFERENCE = "statusmail";
export const EYEBROW = "Medlemsoverblik";
const SIDE = 1000;

export interface ModtagerSvar {
  id: string;
  email: string;
  fornavn: string | null;
  noegle: string;
  /** Ugens mail står allerede i email_send_log (sent/suppressed). */
  allerede: boolean;
  /** toerkoersel · sendt · fandtes · spaerret · fejlet: <grund>. */
  mail: string;
}

export interface StatusmailResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Dansk mandag og time ≥ 7 (statusMail.ts erStatusmailVindue). */
  vindue: boolean;
  uge: string;
  virksomheder: number;
  pr_maerke: Record<Maerke, number>;
  modtagere: ModtagerSvar[];
  /** Rådgivere uden mailadresse — får ingen mail. */
  uden_adresse: string[];
  emne: string | null;
  /** Tekstudgaven — så mailen kan læses i tørkørslen, før den sendes. */
  tekst: string | null;
  /** Drift-klokken ved fejl: null · skrevet · fandtes · toerkoersel · fejlet: <grund>. */
  klokke: string | null;
  fejl: string[];
}

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const tomtPrMaerke = (): Record<Maerke, number> => ({ traenger: 0, ingen_session_endnu: 0, ikke_i_gang: 0, ingen_bruger: 0, ingen_login: 0, ingen_godkendt_rapport: 0 });

function tomtResultat(toerKoersel: boolean, nu: Date): StatusmailResultat {
  return {
    ok: true, dry_run: toerKoersel, nu: nu.toISOString(), vindue: erStatusmailVindue(nu), uge: isoUgeTekst(nu),
    virksomheder: 0, pr_maerke: tomtPrMaerke(), modtagere: [], uden_adresse: [], emne: null, tekst: null, klokke: null, fejl: [],
  };
}

/** Hent alle rækker i sider — aldrig et tavst loft (webinar-mail-cronens form). */
async function alleSider<T>(byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, kilde: string): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await byg(fra, fra + SIDE - 1);
    if (error) throw new Error(`${kilde}: ${error.message}`);
    const side = data ?? [];
    ud.push(...side);
    if (side.length < SIDE) return ud;
  }
}

/** Del en liste i bidder (URL-længden på .in()). */
const bidder = <T,>(liste: readonly T[], n: number): T[][] => {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += n) ud.push(liste.slice(i, i + n));
  return ud;
};

/** Nyeste login pr. bruger: nyeste først, og vi stopper, når alle brugere i bidden er set — aldrig ved et tal (hookens form). */
async function nyesteLoginPrBruger(admin: SupabaseClient, brugerIds: readonly string[]): Promise<Map<string, string>> {
  const ud = new Map<string, string>();
  for (const del of bidder(brugerIds, 200)) {
    const mangler = new Set(del);
    for (let fra = 0; mangler.size > 0; fra += SIDE) {
      const { data, error } = await admin.from("user_login_log").select("user_id, logged_in_at").in("user_id", del)
        .order("logged_in_at", { ascending: false }).order("id").range(fra, fra + SIDE - 1);
      if (error) throw new Error(`user_login_log: ${error.message}`);
      const rk = (data ?? []) as { user_id: string; logged_in_at: string }[];
      for (const l of rk) {
        if (l.user_id && l.logged_in_at && !ud.has(l.user_id)) { ud.set(l.user_id, l.logged_in_at); mangler.delete(l.user_id); }
      }
      if (rk.length < SIDE) break;
    }
  }
  return ud;
}

/** Kilderne — PRÆCIS hookens forespørgsler (statusmailCron.guard sammenligner select og filtre). */
async function hentKilder(admin: SupabaseClient): Promise<{ kilder: OverbliksKilder; navne: Map<string, string> }> {
  type Company = OverbliksKilder["companies"][number] & { name: string | null };
  const [companies, medlemmer, bookinger, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal] = await Promise.all([
    alleSider<Company>((fra, til) =>
      admin.from("companies").select("id, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at, name").order("id").range(fra, til), "companies"),
    alleSider<OverbliksKilder["medlemmer"][number]>((fra, til) =>
      admin.from("company_members").select("company_id, user_id, created_at").order("created_at", { ascending: true }).order("id").range(fra, til), "company_members"),
    alleSider<OverbliksKilder["bookinger"][number]>((fra, til) =>
      admin.from("session_bookings").select("company_id, advisor, amount_dkk, status, start_tid, slut_tid, created_at").eq("amount_dkk", 0).order("created_at").order("id").range(fra, til), "session_bookings"),
    alleSider<OverbliksKilder["facts"][number]>((fra, til) =>
      admin.from("financial_report_facts").select("company_id, committed_at, data_basis").order("company_id").order("period_key").order("id").range(fra, til), "financial_report_facts"),
    alleSider<OverbliksKilder["uploads"][number]>((fra, til) =>
      admin.from("financial_reports").select("company_id, uploaded_at").is("deleted_at", null).neq("file_path", "_sentinel").order("uploaded_at").order("id").range(fra, til), "financial_reports"),
    alleSider<OverbliksKilder["refleksioner"][number]>((fra, til) =>
      admin.from("pulse_checkins").select("company_id, created_at").order("created_at").order("id").range(fra, til), "pulse_checkins"),
    alleSider<OverbliksKilder["samtaler"][number]>((fra, til) =>
      admin.from("conversations").select("company_id, last_member_message_at").order("id").range(fra, til), "conversations"),
    alleSider<OverbliksKilder["events"][number]>((fra, til) =>
      admin.from("event_registrations").select("user_id, registered_at, response, cancelled_at").order("registered_at").order("id").range(fra, til), "event_registrations"),
    alleSider<OverbliksKilder["progress"][number]>((fra, til) =>
      admin.from("member_progress").select("user_id, updated_at").order("updated_at").order("id").range(fra, til), "member_progress"),
    alleSider<OverbliksKilder["traade"][number]>((fra, til) =>
      admin.from("community_traade").select("forfatter_id, created_at").order("created_at").order("id").range(fra, til), "community_traade"),
    alleSider<OverbliksKilder["svar"][number]>((fra, til) =>
      admin.from("community_svar").select("forfatter_id, created_at").order("created_at").order("id").range(fra, til), "community_svar"),
    alleSider<OverbliksKilder["reaktioner"][number]>((fra, til) =>
      admin.from("community_reaktioner").select("bruger_id, created_at").order("created_at").order("bruger_id").range(fra, til), "community_reaktioner"),
    alleSider<OverbliksKilder["maal"][number]>((fra, til) =>
      admin.from("milestones").select("company_id, created_at, progress_updated_at, completed_at").order("created_at").order("id").range(fra, til), "milestones"),
  ]);
  const brugerIds = [...new Set(medlemmer.map((m) => m.user_id).filter((x): x is string => !!x))];
  const loginByUser = await nyesteLoginPrBruger(admin, brugerIds);
  const logins = [...loginByUser].map(([user_id, logged_in_at]) => ({ user_id, logged_in_at }));
  const navne = new Map<string, string>();
  for (const c of companies) if (c.id && c.name) navne.set(c.id, c.name);
  return { kilder: { companies, medlemmer, bookinger, logins, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal }, navne };
}

/** Rådgiverne: user_roles advisor/admin → auth-mail (getUserById) → fornavn (profiles.full_name) — klokke-mail-cronens form. */
async function hentRaadgivere(admin: SupabaseClient, r: StatusmailResultat): Promise<{ id: string; email: string; fornavn: string | null }[]> {
  const { data: roller, error: rolleFejl } = await admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]);
  if (rolleFejl) throw new Error(`user_roles: ${rolleFejl.message}`);
  const ids = [...new Set(((roller ?? []) as { user_id: string }[]).map((x) => x.user_id))];
  const { data: profiler } = await admin.from("profiles").select("user_id, full_name").in("user_id", ids);
  const navne = new Map<string, string | null>();
  for (const p of (profiler ?? []) as { user_id: string; full_name: string | null }[]) {
    navne.set(p.user_id, (p.full_name ?? "").trim().split(/\s+/)[0] || null);
  }
  const ud: { id: string; email: string; fornavn: string | null }[] = [];
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    const email = (data?.user?.email ?? "").trim().toLowerCase();
    if (error || !email) { r.uden_adresse.push(id); continue; }
    ud.push({ id, email, fornavn: navne.get(id) ?? null });
  }
  return ud;
}

export async function koerStatusmail(admin: SupabaseClient, a: { toerKoersel: boolean; nu: Date }): Promise<{ status: number; resultat: StatusmailResultat }> {
  const r = tomtResultat(a.toerKoersel, a.nu);
  // Uden for vinduet hentes INTET — svaret siger det, og kørslen er slut.
  if (!r.vindue) return { status: 200, resultat: r };

  const { kilder, navne } = await hentKilder(admin);
  const overblik = byggOverblik(kilder, a.nu);
  r.virksomheder = overblik.size;
  for (const o of overblik.values()) for (const m of FILTER_MAERKER) if (harMaerke(o.dom, m)) r.pr_maerke[m]++;
  const tekst = statusMailTekst(overblik, navne, a.nu);
  r.emne = tekst.emne;
  r.tekst = tekst.tekst;

  const raadgivere = await hentRaadgivere(admin, r);
  for (const rg of raadgivere) {
    const noegle = statusMailNoegle(rg.id, a.nu);
    const svar: ModtagerSvar = { id: rg.id, email: rg.email, fornavn: rg.fornavn, noegle, allerede: false, mail: a.toerKoersel ? "toerkoersel" : "" };
    r.modtagere.push(svar);
    try {
      // Opslag FØR afsendelsen — ugens mail sendes én gang pr. rådgiver, også i tørkørslen læses det.
      const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log")
        .select("message_id, status").eq("message_id", noegle).in("status", ["sent", "suppressed"]).limit(1);
      if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
      const forrige = ((fandtes ?? []) as { status: string }[])[0] ?? null;
      svar.allerede = forrige !== null;
      if (a.toerKoersel) continue;
      if (forrige) { svar.mail = forrige.status === "sent" ? "fandtes" : "spaerret"; continue; }

      const html = indgangsMailHtml({
        eyebrow: EYEBROW,
        overskrift: tekst.emne,
        afsnit: tekst.afsnit,
        blokke: tekst.blokke,
        hilsen: "The Boardroom",
      });
      const res = await sendManagedEmail({
        adminClient: admin,
        to: rg.email,
        subject: tekst.emne,
        html,
        text: tekst.tekst,
        label: STATUSMAIL_LABEL,
        idempotencyKey: noegle,
        metadata: { uge: r.uge, virksomheder: r.virksomheder, nu: a.nu.toISOString() },
      });
      if (res.sent) svar.mail = "sendt";
      else {
        svar.mail = res.reason === "recipient_suppressed" ? "spaerret" : `fejlet: ${res.reason}`;
        if (res.reason !== "recipient_suppressed") r.fejl.push(`${rg.id}: ${res.reason}`);
        console.error(`${LOG} mailen til ${rg.email} blev ikke sendt: ${res.reason}`);
      }
    } catch (err) {
      const grund = err instanceof Error ? err.message : String(err);
      svar.mail = `fejlet: ${grund}`;
      r.fejl.push(`${rg.id}: ${grund}`);
      console.error(`${LOG} mailen til ${rg.email} kastede:`, grund);
    }
  }

  // ÉN drift-klokke pr. kørsel med fejl. Ikke selvmailende: klokke-mail-cron mailer den.
  if (r.fejl.length > 0) {
    if (a.toerKoersel) {
      r.klokke = "toerkoersel";
    } else {
      const skrevet = await skrivRaadgiverBesked(admin, {
        type: "drift",
        title: `Statusmailen ${r.uge}: ${r.fejl.length} ${r.fejl.length === 1 ? "mail" : "mails"} kunne ikke sendes`,
        body: r.fejl.join("\n").slice(0, 2000),
        reference_type: STATUSMAIL_REFERENCE,
        reference_id: null,
      });
      r.klokke = skrevet.fejl.length > 0 ? `fejlet: ${skrevet.fejl.join("; ")}` : skrevet.skrevet > 0 ? "skrevet" : "fandtes";
    }
  }

  r.ok = r.fejl.length === 0;
  return { status: r.ok ? 200 : 500, resultat: r };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
  } catch {
    /* ingen body = tørkørsel */
  }
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ok: false, fejl: [besked] }, 400);
  }
  const toerKoersel = raaBody?.dry_run !== false;
  let nu = new Date();
  if (typeof raaBody?.nu === "string") {
    const t = new Date(raaBody.nu);
    if (Number.isNaN(t.getTime())) return json({ ok: false, fejl: [`«nu» er ikke en dato: ${raaBody.nu}`] }, 400);
    nu = t;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let svar: { status: number; resultat: StatusmailResultat };
  try {
    svar = await koerStatusmail(admin, { toerKoersel, nu });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  const { resultat } = svar;
  console.log(`${LOG} ${resultat.dry_run ? "TØRKØRSEL" : "SENDER"} — vindue ${resultat.vindue}, uge ${resultat.uge}, virksomheder ${resultat.virksomheder}, modtagere ${resultat.modtagere.length}, fejl ${resultat.fejl.length}`);
  return json(resultat, svar.status);
});
