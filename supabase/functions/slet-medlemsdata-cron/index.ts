// Slettefunktionen — sletter et tidligere medlems data når motoren siger
// det, og bogfører det på virksomhedsrækken (Alina-sagen, OVERLEVERING
// DEL 2, 8/9-2026: en sletteanmodning lå 103 dage, og sletningen i hånden
// tog en formiddag; kaskaden tog ikke alt).
//
// SAMME FORM SOM fornyelsesvarsel-cron: HTTP-indgang (IKKE Deno.cron),
// authenticateServiceRole bag verify_jwt = true (Bucket B), og TØRKØRSEL
// SOM STANDARD: uden body findes kandidaterne og rapporteres — pr.
// virksomhed, pr. tabel, pr. bucket, pr. bruger — men intet slettes og
// intet skrives. Kun et eksplicit { "dry_run": false } sletter. Det var
// tørkørslen der fangede CARMA-fejlen 7/9.
//
// DOMMEN er motorens (_shared/sletning.ts, spejl af src/lib/sletning.ts):
// tre veje — anmodning (7 dage), tilbud_ubesvaret og aldrig_tilbudt (dag
// 45 efter slutdato) — og KUN inden for ordningen (slutdato efter
// FORNYELSE_IKRAFT_DATO). De syv der står som 'tidligere' med slutdato
// maj–september er en beslutning Jonas traf 8/9 og køres som engangssag
// med eksplicitte id'er; funktionen finder dem ikke. Funktionen tager
// INGEN company_id i body: gaten er på rækken, ikke på kalderen.
//
// SKELLET (Jonas 8/9): (a) SLETTES — kundens eget materiale og alt
// personligt. (b) BLIVER — vores eget bilag: company_perioder,
// company_traek, company_betalingslink, session_bookings, Stripe-id'erne.
// (c) ARKIVSPOR — companies-rækken TØMMES, slettes aldrig: navn, CVR,
// kontraktperiode, status og offboarding_requested_at bliver.
//
// RÆKKEFØLGEN er FK-ordenen fra spec-slettefunktionen.md §1 (15 trin):
// storage først (mens stierne kendes), analyser før facts før rapporter
// (RESTRICT/NO ACTION), de person-nøglede tabeller UDEN fremmednøgle
// eksplicit (kaskaden tager dem ikke — det var de 198 loginposter),
// koblingen, kontoen, og til sidst UPDATE af virksomhedsrækken med
// stemplet. Stemplet (data_slettet_at) sættes SIDST og er
// idempotens-nøglen: kaldes funktionen igen, er kandidaten væk; døde den
// midtvejs, findes kandidaten igen, og hvert trin tåler at ramme nul.
//
// STOP for en virksomhed, uden at slette noget af den, hvis en af dens
// brugere (1) bærer en anden virksomhed (kontoen kan ikke slettes) eller
// (2) har session_bookings (bilag der dør med kontoen — beslutning i
// spec'ens §9). Virksomheden står så i rapportens `stoppet` med grund.
//
// PLANLÆGNING: IKKE i denne PR. Først når en tørkørsel er læst mod
// rigtige rækker. Formen er fornyelsesvarslernes (fornyelsesvarsel-cron
// :60-80), body '{"dry_run": false}', et ledigt slot (12:00 UTC er
// ledigt: 04 opgave-udløb · 05 agent-runs · 06 weekly-focus · 07
// event-reminders · 08 pulse/digest · 09 report/intro · 10 indgang
// (foreslået) · 11 fornyelsesvarsler).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerSletning, type Slettedom, type SletningInput } from "../_shared/sletning.ts";
import type { Fornyelsesbeslutning } from "../_shared/fornyelse.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[slet-medlemsdata-cron]";

/**
 * (b) — RØRES ALDRIG. Står her med navn, så værnet
 * (src/lib/__tests__/sletningRoererIkkeBilag.guard.test.ts) kan låse at
 * ingen af dem har en delete-kæde i denne fil. companies står her fordi
 * rækken tømmes med UPDATE og aldrig slettes.
 */
const ROERES_ALDRIG = [
  "company_perioder",
  "company_traek",
  "company_betalingslink",
  "session_bookings",
  "companies",
  "company_fornyelse", // rådgiverens beslutning om virksomheden — åben beslutning (spec §9), rører den ikke
] as const;

/** email_send_log-labels der er bilag (b): betalingsmail, faktura, varsler, booking. Bliver. */
const BILAGS_LABELS = [
  "indgang-dag0", "indgang-dag7", "indgang-dag14", "indgang-dag15", "indgang-dag20",
  "indgang-dag25", "indgang-dag31", "indgang-raadgiver-mangler-pris",
  "fornyelse-varsel1", "fornyelse-varsel2", "session-booking-confirmation",
];

/** Bruger-nøglede buckets: stien er `${userId}/…`, ét niveau. */
const BRUGER_BUCKETS = ["avatars", "chat-attachments", "feedback-screenshots", "community-billeder", "community-filer"];

/** Personfelter på companies der tømmes (spec §1b). Navn, CVR, kontrakt og Stripe bliver. */
const PERSONFELTER_TOEMMES = [
  "contact_person", "contact_email", "contact_phone", "application_context", "description",
  "address", "postal_code", "city", "website", "logo_url", "annual_revenue", "slack_channel",
];

interface KandidatRapport {
  company_id: string;
  virksomhed: string;
  cvr: string | null;
  status: string | null;
  contract_end_date: string | null;
  offboarding_requested_at: string | null;
  beslutning: Fornyelsesbeslutning | null;
  dom: Slettedom;
  /** Advarsel: kontrakten er stadig aktiv (kan kun ske ad vej 1). */
  aktiv_kontrakt: boolean;
  brugere: {
    user_id: string;
    email: string | null;
    sidste_login: string | null;
    andre_virksomheder: number;
    session_bookings: number;
    konto: "slettes" | "bevares — medlem af anden virksomhed" | "STOP — bilag på kontoen";
  }[];
  /** Rækker pr. tabel — tørkørslen tæller, den rigtige kørsel tæller FØR den sletter. */
  raekker: Record<string, number>;
  /** Filer pr. bucket. */
  storage: Record<string, number>;
  /** (b) der bliver — tælles kun, aldrig rørt. */
  bilag_der_bliver: Record<string, number | string | null>;
  companies_toemmes: string[];
  stop: string | null;
  /** Kun rigtig kørsel: trin der fejlede (kandidaten er da IKKE stemplet og findes igen i morgen). */
  fejl: string[];
}

interface SletteResultat {
  ok: boolean;
  dry_run: boolean;
  /** Undersøgte virksomheder (ikke stemplet, med anmodning eller slutdato). */
  undersoegt: number;
  /** Motoren siger slet nu. */
  fundet: number;
  /** Faktisk slettet og stemplet (altid 0 i tørkørsel). */
  slettet: number;
  /** Fundet, men stoppet (bilag på kontoen / anden virksomhed) eller fejlet. */
  stoppet: number;
  fejlet: number;
  kandidater: KandidatRapport[];
  /** Undersøgte der IKKE skal slettes nu, med motorens grund — så rapporten siger hvorfor de andre ikke er med. */
  ikke_nu: { company_id: string; virksomhed: string; vej: string | null; frist: string | null; grund: string }[];
  error?: string;
}

interface VirksomhedsRaekke {
  id: string;
  name: string;
  cvr_number: string | null;
  status: string | null;
  contract_end_date: string | null;
  offboarding_requested_at: string | null;
  data_slettet_at: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
}

// ── Hjælpere: tæl og (kun live) slet — hvert trin tåler at ramme nul ──

type Filter = (q: any) => any;

async function taelOgSlet(
  supabase: SupabaseClient,
  tabel: string,
  filter: Filter,
  live: boolean,
  raekker: Record<string, number>,
  fejl: string[],
  noegle = tabel,
): Promise<void> {
  const { count, error: countErr } = await filter(supabase.from(tabel).select("*", { count: "exact", head: true }));
  if (countErr) {
    fejl.push(`${noegle}: tælling fejlede: ${countErr.message}`);
    return;
  }
  raekker[noegle] = (raekker[noegle] ?? 0) + (count ?? 0);
  if (!live || !count) return;
  const { error: delErr } = await filter(supabase.from(tabel).delete());
  if (delErr) fejl.push(`${noegle}: sletning fejlede: ${delErr.message}`);
}

async function idListe(supabase: SupabaseClient, tabel: string, kolonne: string, vaerdi: string, fejl: string[]): Promise<string[]> {
  const { data, error } = await supabase.from(tabel).select("id").eq(kolonne, vaerdi);
  if (error) {
    fejl.push(`${tabel}: id-opslag fejlede: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** Filer under et præfiks (ét niveau — alle bruger-buckets og company-logos er ét niveau). */
async function listFiler(supabase: SupabaseClient, bucket: string, praefiks: string, fejl: string[]): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(praefiks, { limit: 1000 });
  if (error) {
    fejl.push(`storage/${bucket}: list fejlede: ${error.message}`);
    return [];
  }
  return (data ?? []).filter((o: { id: string | null }) => o.id !== null).map((o: { name: string }) => `${praefiks}/${o.name}`);
}

async function fjernFiler(supabase: SupabaseClient, bucket: string, stier: string[], fejl: string[]): Promise<void> {
  if (stier.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(stier);
  if (error) fejl.push(`storage/${bucket}: remove fejlede: ${error.message}`);
}

// ── Én virksomhed: læs, tæl, (live) slet i FK-orden, stempl ──

async function behandl(
  supabase: SupabaseClient,
  v: VirksomhedsRaekke,
  beslutning: Fornyelsesbeslutning | null,
  dom: Slettedom,
  live: boolean,
  now: Date,
): Promise<KandidatRapport> {
  const raekker: Record<string, number> = {};
  const storage: Record<string, number> = {};
  const fejl: string[] = [];
  const rapport: KandidatRapport = {
    company_id: v.id,
    virksomhed: v.name,
    cvr: v.cvr_number,
    status: v.status,
    contract_end_date: v.contract_end_date,
    offboarding_requested_at: v.offboarding_requested_at,
    beslutning,
    dom,
    aktiv_kontrakt: !!v.contract_end_date && new Date(v.contract_end_date) >= now,
    brugere: [],
    raekker,
    storage,
    bilag_der_bliver: {},
    companies_toemmes: PERSONFELTER_TOEMMES,
    stop: null,
    fejl,
  };
  const V = v.id;

  // ── Trin 0: læs brugere, adresser og stier FØR noget røres ──
  const { data: medlemmer, error: mErr } = await supabase.from("company_members").select("user_id").eq("company_id", V);
  if (mErr) {
    fejl.push(`company_members: ${mErr.message}`);
    rapport.stop = "kunne ikke læse medlemmer";
    return rapport;
  }
  const brugerIds = [...new Set((medlemmer ?? []).map((m: { user_id: string }) => m.user_id))];
  const adresser = new Set<string>();

  for (const P of brugerIds) {
    const { data: u } = await supabase.auth.admin.getUserById(P);
    const email = u?.user?.email?.trim().toLowerCase() ?? null;
    if (email) adresser.add(email);
    const { count: andre } = await supabase.from("company_members").select("*", { count: "exact", head: true }).eq("user_id", P).neq("company_id", V);
    // (b): session_bookings.user_id er NOT NULL + ON DELETE CASCADE mod auth.users — tælles, røres aldrig.
    const { count: bookinger } = await supabase.from("session_bookings").select("*", { count: "exact", head: true }).eq("user_id", P);
    const konto = (bookinger ?? 0) > 0
      ? "STOP — bilag på kontoen"
      : (andre ?? 0) > 0
        ? "bevares — medlem af anden virksomhed"
        : "slettes";
    rapport.brugere.push({
      user_id: P,
      email,
      sidste_login: u?.user?.last_sign_in_at ?? null,
      andre_virksomheder: andre ?? 0,
      session_bookings: bookinger ?? 0,
      konto,
    });
  }
  const { data: invs } = await supabase.from("company_invitations").select("email").eq("company_id", V);
  for (const i of invs ?? []) if (i.email) adresser.add(String(i.email).trim().toLowerCase());
  const adresseListe = [...adresser];

  // (b) der bliver — kun talt, så rapporten siger hvad der overlever.
  for (const t of ["company_perioder", "company_traek", "company_betalingslink"] as const) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true }).eq("company_id", V);
    rapport.bilag_der_bliver[t] = count ?? 0;
  }
  rapport.bilag_der_bliver["session_bookings"] = rapport.brugere.reduce((s, b) => s + b.session_bookings, 0);
  rapport.bilag_der_bliver["stripe_customer_id"] = v.stripe_customer_id;
  if (adresseListe.length > 0) {
    const { count } = await supabase.from("email_send_log").select("*", { count: "exact", head: true }).in("recipient_email", adresseListe).in("template_name", BILAGS_LABELS);
    rapport.bilag_der_bliver["email_send_log_b"] = count ?? 0;
  }

  // STOP-betingelserne (spec §5): intet slettes for denne virksomhed.
  const stopBruger = rapport.brugere.find((b) => b.konto === "STOP — bilag på kontoen");
  if (stopBruger) rapport.stop = `bruger ${stopBruger.user_id} har ${stopBruger.session_bookings} session_bookings (bilag) — kræver et menneske (spec §9)`;
  const slettesKonti = rapport.brugere.filter((b) => b.konto === "slettes").map((b) => b.user_id);
  const bevaresKonti = rapport.brugere.filter((b) => b.konto !== "slettes").map((b) => b.user_id);

  // Stier: rapporternes filer (ikke legacy 'uploads/…') + logo + bruger-buckets.
  const { data: rapportRaekker } = await supabase.from("financial_reports").select("file_path").eq("company_id", V);
  const rapportStier = (rapportRaekker ?? [])
    .map((r: { file_path: string | null }) => r.file_path)
    .filter((p: string | null): p is string => !!p && !p.startsWith("uploads/") && p !== "_sentinel");
  storage["financial-documents"] = rapportStier.length;
  const logoStier = await listFiler(supabase, "company-logos", V, fejl);
  storage["company-logos"] = logoStier.length;
  const brugerStier: Record<string, string[]> = {};
  for (const bucket of BRUGER_BUCKETS) {
    brugerStier[bucket] = [];
    for (const P of slettesKonti) brugerStier[bucket].push(...(await listFiler(supabase, bucket, P, fejl)));
    storage[bucket] = brugerStier[bucket].length;
  }

  const doIt = live && !rapport.stop;

  // ── Trin 1: storage ──
  if (doIt) {
    await fjernFiler(supabase, "financial-documents", rapportStier, fejl);
    await fjernFiler(supabase, "company-logos", logoStier, fejl);
    for (const bucket of BRUGER_BUCKETS) await fjernFiler(supabase, bucket, brugerStier[bucket], fejl);
  }

  const paaV: Filter = (q) => q.eq("company_id", V);
  const iListe = (kol: string, ids: string[]): Filter => (q) => (ids.length ? q.in(kol, ids) : q.in(kol, ["00000000-0000-0000-0000-000000000000"]));

  // ── Trin 2-4: analyser → facts → rapporter (RESTRICT / NO ACTION) ──
  await taelOgSlet(supabase, "financial_commentaries", paaV, doIt, raekker, fejl);
  // data_basis-undtagelse: slette-infrastruktur — tæller og sletter alle rækker, læser ingen tal
  await taelOgSlet(supabase, "financial_report_facts", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "financial_reports", paaV, doIt, raekker, fejl);

  // ── Trin 5: handouts og milepæle (koblingerne først) ──
  const handoutIds = await idListe(supabase, "handouts", "company_id", V, fejl);
  const milestoneIds = await idListe(supabase, "milestones", "company_id", V, fejl);
  await taelOgSlet(supabase, "handout_lever_milestones", iListe("handout_id", handoutIds), doIt, raekker, fejl);
  await taelOgSlet(supabase, "handouts", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "advisor_milestone_actions", iListe("milestone_id", milestoneIds), doIt, raekker, fejl);
  await taelOgSlet(supabase, "milestones", paaV, doIt, raekker, fejl);

  // ── Trin 6: budget og KPI ──
  for (const t of ["budget_targets", "kpi_targets", "kpi_benchmarks", "kpi_chart_comments"]) {
    await taelOgSlet(supabase, t, paaV, doIt, raekker, fejl);
  }

  // ── Trin 7: refleksion, agent, opgaver, rådgiverens noter om virksomheden ──
  const runIds = await idListe(supabase, "agent_runs", "company_id", V, fejl);
  await taelOgSlet(supabase, "pulse_checkins", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "weekly_focus", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "agent_proposals", iListe("run_id", runIds), doIt, raekker, fejl);
  await taelOgSlet(supabase, "agent_runs", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "company_actions", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "advisor_session_notes", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "advisor_company_acknowledgments", paaV, doIt, raekker, fejl);

  // ── Trin 8: chatten — beskeder og noter før samtalen ──
  const samtaleIds = await idListe(supabase, "conversations", "company_id", V, fejl);
  await taelOgSlet(supabase, "messages", iListe("conversation_id", samtaleIds), doIt, raekker, fejl);
  await taelOgSlet(supabase, "conversation_notes", iListe("conversation_id", samtaleIds), doIt, raekker, fejl);
  await taelOgSlet(supabase, "slack_conversation_threads", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "slack_notification_log", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "conversations", paaV, doIt, raekker, fejl);

  // ── Trin 9: notifikationer, Slack-spor, feedback, legat, grupper, teknisk log ──
  await taelOgSlet(supabase, "notifications", paaV, doIt, raekker, fejl, "notifications (company_id)");
  for (const t of ["advisor_notifications", "slack_report_notification_log", "slack_handout_notification_log", "feedback", "legat_enrollments", "group_companies", "_facts_backfill_log"]) {
    await taelOgSlet(supabase, t, paaV, doIt, raekker, fejl);
  }

  // ── Trin 10: person-nøglet UDEN fremmednøgle — kaskaden tager dem IKKE ──
  //    (de 198 loginposter, 5 handouts, 1 pulse, 1 last_seen hos Alina).
  //    Kun for konti der slettes; en bevaret konto beholder sine egne rækker.
  const paaP: Filter = iListe("user_id", slettesKonti);
  await taelOgSlet(supabase, "user_login_log", paaP, doIt, raekker, fejl);
  await taelOgSlet(supabase, "conversation_last_seen", paaP, doIt, raekker, fejl);
  await taelOgSlet(supabase, "message_reactions", paaP, doIt, raekker, fejl);
  await taelOgSlet(supabase, "notifications", paaP, doIt, raekker, fejl, "notifications (user_id)");
  await taelOgSlet(supabase, "feedback", paaP, doIt, raekker, fejl, "feedback (user_id)");
  await taelOgSlet(supabase, "kpi_chart_comments", iListe("author_id", slettesKonti), doIt, raekker, fejl, "kpi_chart_comments (author_id)");
  for (const t of ["handouts", "pulse_checkins", "milestones", "budget_targets", "kpi_targets", "kpi_benchmarks"]) {
    await taelOgSlet(supabase, t, paaP, doIt, raekker, fejl, `${t} (user_id)`);
  }
  // Med FK CASCADE fra auth.users — tælles så rapporten viser hvad kontoen tager med.
  for (const t of ["profiles", "user_roles", "member_profiles", "member_progress", "event_registrations"]) {
    await taelOgSlet(supabase, t, paaP, false, raekker, fejl, `${t} (kaskade)`);
  }
  await taelOgSlet(supabase, "community_traade", iListe("forfatter_id", slettesKonti), false, raekker, fejl, "community_traade (kaskade)");
  await taelOgSlet(supabase, "community_svar", iListe("forfatter_id", slettesKonti), false, raekker, fejl, "community_svar (kaskade)");

  // ── Trin 11: mail på adressen — (a)-labels slettes, (b)-labels bliver ──
  if (adresseListe.length > 0) {
    const paaE: Filter = (q) => q.in("recipient_email", adresseListe);
    await taelOgSlet(supabase, "email_send_log", (q) => paaE(q).not("template_name", "in", `(${BILAGS_LABELS.map((l) => `"${l}"`).join(",")})`), doIt, raekker, fejl, "email_send_log (a)");
    // legacy-loggen (før 19/3) har ingen label og ligger før indgangen fandtes — ingen bilag muligt.
    await taelOgSlet(supabase, "email_send_log_legacy", paaE, doIt, raekker, fejl);
    await taelOgSlet(supabase, "email_unsubscribe_tokens", (q) => q.in("email", adresseListe), doIt, raekker, fejl);
    await taelOgSlet(supabase, "suppressed_emails", (q) => q.in("email", adresseListe), doIt, raekker, fejl);
  }

  // ── Trin 12-13: invitationer og koblingen ──
  await taelOgSlet(supabase, "company_invitations", paaV, doIt, raekker, fejl);
  await taelOgSlet(supabase, "company_members", paaV, doIt, raekker, fejl);

  // ── Trin 14: kontoen — kun de konti der ikke bærer andet ──
  raekker["auth_users"] = slettesKonti.length;
  raekker["auth_users (bevares)"] = bevaresKonti.length;
  if (doIt) {
    for (const P of slettesKonti) {
      const { error } = await supabase.auth.admin.deleteUser(P);
      // «not found» = allerede væk fra en tidligere, afbrudt kørsel — idempotent.
      if (error && !/not found/i.test(error.message)) fejl.push(`auth.users ${P}: ${error.message}`);
    }
  }

  // ── Trin 15: virksomhedsrækken tømmes og stemples — kun uden fejl, kun én gang ──
  if (doIt && fejl.length === 0) {
    const toem: Record<string, unknown> = {};
    for (const f of PERSONFELTER_TOEMMES) toem[f] = null;
    const { data: stemplet, error: upErr } = await supabase
      .from("companies")
      .update({
        ...toem,
        er_kunde: false,
        data_slettet_at: now.toISOString(),
        data_slettet_vej: dom.vej,
        data_slettet_raekker: { ...raekker, ...Object.fromEntries(Object.entries(storage).map(([b, n]) => [`storage/${b}`, n])) },
      })
      .eq("id", V)
      .is("data_slettet_at", null)
      .select("id");
    if (upErr) fejl.push(`companies: stempel fejlede: ${upErr.message}`);
    else if (!stemplet || stemplet.length === 0) fejl.push("companies: stempel ramte nul rækker — allerede stemplet?");
  }

  return rapport;
}

// ── Kørslen ──

async function koer(supabase: SupabaseClient, toerKoersel: boolean): Promise<SletteResultat> {
  const resultat: SletteResultat = {
    ok: true, dry_run: toerKoersel, undersoegt: 0, fundet: 0, slettet: 0, stoppet: 0, fejlet: 0, kandidater: [], ikke_nu: [],
  };
  const now = new Date();

  // Målgruppen er bred: alle uden stempel med enten en anmodning eller en
  // slutdato. Motoren dømmer; rapporten siger hvorfor de andre ikke er med.
  const { data: rows, error } = await supabase
    .from("companies")
    .select("id, name, cvr_number, status, contract_end_date, offboarding_requested_at, data_slettet_at, subscription_status, subscription_current_period_end, stripe_customer_id")
    .is("data_slettet_at", null)
    .or("offboarding_requested_at.not.is.null,contract_end_date.not.is.null");
  if (error) {
    console.error(`${LOG} companies-opslag fejlede:`, error.message);
    return { ...resultat, ok: false, error: error.message };
  }
  const virksomheder = (rows ?? []) as VirksomhedsRaekke[];
  resultat.undersoegt = virksomheder.length;

  const { data: beslutninger, error: bErr } = await supabase
    .from("company_fornyelse")
    .select("company_id, beslutning")
    .in("company_id", virksomheder.map((v) => v.id));
  if (bErr) {
    console.error(`${LOG} company_fornyelse-opslag fejlede:`, bErr.message);
    return { ...resultat, ok: false, error: bErr.message };
  }
  const beslutning = new Map<string, Fornyelsesbeslutning>();
  for (const b of beslutninger ?? []) beslutning.set(b.company_id, b.beslutning as Fornyelsesbeslutning);

  for (const v of virksomheder) {
    const input: SletningInput = {
      contract_end_date: v.contract_end_date,
      offboarding_requested_at: v.offboarding_requested_at,
      beslutning: beslutning.get(v.id) ?? null,
      status: v.status,
      data_slettet_at: v.data_slettet_at,
      subscription_status: v.subscription_status,
      subscription_current_period_end: v.subscription_current_period_end,
    };
    const dom = afgoerSletning(input, now);
    if (!dom.skal_slettes) {
      // Kun dem der er PÅ VEJ (en vej og en frist) står i rapporten — de
      // hundrede i_god_tid ville drukne den.
      if (dom.vej) resultat.ikke_nu.push({ company_id: v.id, virksomhed: v.name, vej: dom.vej, frist: dom.frist, grund: dom.grund });
      continue;
    }
    resultat.fundet++;
    try {
      const rapport = await behandl(supabase, v, input.beslutning, dom, !toerKoersel, now);
      resultat.kandidater.push(rapport);
      if (rapport.stop) resultat.stoppet++;
      else if (rapport.fejl.length > 0) resultat.fejlet++;
      else if (!toerKoersel) resultat.slettet++;
      console.log(`${LOG} ${toerKoersel ? "VILLE SLETTE" : rapport.stop ? "STOPPET" : rapport.fejl.length ? "FEJLET" : "SLETTET"}: ${v.name} (${v.id}) ad ${dom.vej} — ${dom.grund}`, JSON.stringify({ raekker: rapport.raekker, storage: rapport.storage, brugere: rapport.brugere.map((b) => b.konto), stop: rapport.stop, fejl: rapport.fejl }));
    } catch (err) {
      resultat.fejlet++;
      console.error(`${LOG} uventet fejl for ${v.id}:`, err);
    }
  }
  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default: uden body findes kandidaterne og rapporteres, men
  // intet slettes og intet skrives. Kun et eksplicit { "dry_run": false } sletter.
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

  const resultat = await koer(supabase, toerKoersel);
  console.log(`${LOG} Summary:`, JSON.stringify({ ...resultat, kandidater: resultat.kandidater.length }));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
