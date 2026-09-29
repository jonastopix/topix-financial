// certifikat-klokke — klokken «Dit certifikat er klar», når medlemmets område
// «Dit certifikat» åbner (certifikat trin 2, 29/9-2026; recon
// ~/Downloads/recon-certifikat-trin2.md). Én gang i døgnet (migration
// 20260929200000_certifikat_klokke_cron.sql).
//
// SAMME FORM SOM stille-klokker-cron og onboarding-rytme: HTTP-indgang,
// authenticateServiceRole bag verify_jwt = true (Bucket B), TØRKØRSEL SOM
// STANDARD — uden body dømmes der og svares med hvem der VILLE få klokken, men
// intet skrives. Kun et eksplicit { "dry_run": false } skriver. Ukendte felter
// i body'en afvises (kendteFelter.ts). «nu» (ISO) kan gives ind til en
// tørkørsel på en anden dag — tiden gives ind, den gættes ikke.
//
// DOMMEN bor i _shared/certifikatKlokke.ts (ren, spejlet i
// src/lib/certifikat/klokke.ts, paritetstestet): åbningsdato = startdato +
// 12 måneder − 7 dage som ren dansk kalender, udvalgt med «åbningsdato <= i
// dag» — Jonas 29/9: også dem, hvis område allerede ER åbent, når cron'en går
// i luften; en dag uden kørsel taber aldrig en klokke. Her hentes kun data og
// skrives klokken:
//   companies             — certificate_eligible = true (+ startdato og tier-felterne)
//   company_members       — modtagerne (ALLE brugere på virksomheden)
//   user_roles            — advisor/admin er udelukket
//   certificate_downloads — medlemmer, der allerede har hentet, er udelukket
//
// KLOKKEN er notifications (medlemmets klokke) skrevet med writeNotificationToMany:
// type certifikat_klar, priority important, deep_link /certifikat, reference_type
// certifikat, reference_id = company_id = company_id og dedup_key
// «certifikat_klar:<company_id>:<åbningsdato>». ÉN GANG pr. medlem pr.
// åbningsdato er notifications' UNIQUE (user_id, dedup_key) (20260323112326) —
// en daglig genkørsel skriver intet nyt.
//
// MAILEN: priority important → send-notification-email mailer rækken
// (index.ts:232-245: `.in("priority", ["action_required", "important"])`).
// certifikat_klar rammes af INGEN af køens undtagelser: den er ikke i
// BEGIVENHED_TYPES (notificationEmailSelection.ts:76-81 — community_opslag,
// community_svar, community_naevnelse, event_reminder → 12-timersreglen), ikke
// SAMLEMAIL_TYPER (event_published, community_opslag), ikke report_reminder
// (index.ts:239), ikke i EMAIL_DELAY_MINUTES_BY_TYPE (standard 15 min,
// notificationEmailSelection.ts:178-188) og hverken chat-, rapport- eller
// community-type. Uden egen skabelon bliver emnet title og mailen
// buildEmailHtml(title, body, deep_link) (index.ts:832-862). Køens fælles regler
// gælder stadig: rådgivere får ingen mail, fem pr. bruger pr. døgn, udløbne
// stemples uden mail, og brugerens egne mail-præferencer.
//
// KASTER ALDRIG mod én virksomhed: writeNotification sluger og logger sine
// fejl (notificationWriter.ts:61-73); svaret tæller skrevne rækker.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { writeNotificationToMany } from "../_shared/notificationWriter.ts";
import {
  certifikatKlokkeModtagere,
  KLOKKE_LINK,
  KLOKKE_REFERENCE_TYPE,
  KLOKKE_TEKST,
  KLOKKE_TITEL,
  KLOKKE_TYPE,
  type KlokkeMedlem,
  type KlokkeVirksomhed,
  type SprungetGrund,
} from "../_shared/certifikatKlokke.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu"] as const;

const SIDE = 1000;
const LOG = "[certifikat-klokke]";

export interface CertifikatKlokkeResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Den danske kalenderdag, der dømmes på. */
  i_dag: string;
  /** Virksomheder med certificate_eligible = true. */
  berettigede: number;
  /** Hvem der VILLE få (tørkørsel) / fik (rigtig kørsel) klokken. */
  klar: { virksomhed: string; company_id: string; aabningsdato: string; modtagere: number; dedup_key: string }[];
  /** Modtagere i alt på de klare virksomheder. */
  modtagere: number;
  /** Nye rækker i notifications (0 i tørkørsel); resten fandtes allerede (dedup) eller fejlede (loggen). */
  skrevet: number;
  sprunget: Record<SprungetGrund, number>;
  raadgivere: number;
  har_hentet: number;
}

/** Hent alle rækker i sider — én forespørgsel pr. SIDE, aldrig et tavst loft. */
async function alleSider<T>(byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, kilde: string): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await byg(fra, fra + SIDE - 1);
    if (error) throw new Error(`${kilde}: ${error.message}`);
    const rk = data ?? [];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

function dele<T>(xs: readonly T[], n: number): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < xs.length; i += n) ud.push(xs.slice(i, i + n));
  return ud;
}

export async function koerCertifikatKlokke(admin: SupabaseClient, toerKoersel: boolean, nu: Date): Promise<CertifikatKlokkeResultat> {
  const virksomheder = await alleSider<KlokkeVirksomhed>((fra, til) =>
    admin.from("companies")
      .select("id, name, certificate_eligible, contract_start_date, contract_end_date, subscription_status, subscription_current_period_end")
      .eq("certificate_eligible", true).order("id").range(fra, til), "companies");
  const ids = virksomheder.map((c) => c.id);

  const medlemmer: KlokkeMedlem[] = [];
  for (const del of dele(ids, 200)) {
    medlemmer.push(...await alleSider<KlokkeMedlem>((fra, til) =>
      admin.from("company_members").select("company_id, user_id").in("company_id", del).order("id").range(fra, til), "company_members"));
  }
  const raadgivere = (await alleSider<{ user_id: string }>((fra, til) =>
    admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]).order("user_id").range(fra, til), "user_roles")).map((r) => r.user_id);
  const brugere = [...new Set(medlemmer.map((m) => m.user_id))];
  const harHentet: string[] = [];
  for (const del of dele(brugere, 200)) {
    harHentet.push(...(await alleSider<{ user_id: string }>((fra, til) =>
      admin.from("certificate_downloads").select("user_id").in("user_id", del).order("id").range(fra, til), "certificate_downloads")).map((r) => r.user_id));
  }

  const udvalg = certifikatKlokkeModtagere({ virksomheder, medlemmer, raadgivere, harHentet, nu });
  const r: CertifikatKlokkeResultat = {
    ok: true,
    dry_run: toerKoersel,
    nu: nu.toISOString(),
    i_dag: udvalg.iDag,
    berettigede: virksomheder.length,
    klar: udvalg.klar.map((k) => ({ virksomhed: k.navn, company_id: k.companyId, aabningsdato: k.aabningsdato, modtagere: k.modtagere.length, dedup_key: k.dedupKey })),
    modtagere: udvalg.klar.reduce((s, k) => s + k.modtagere.length, 0),
    skrevet: 0,
    sprunget: udvalg.sprunget,
    raadgivere: udvalg.raadgivere,
    har_hentet: udvalg.harHentet,
  };
  if (toerKoersel) return r;

  for (const k of udvalg.klar) {
    r.skrevet += await writeNotificationToMany(admin, k.modtagere, {
      type: KLOKKE_TYPE,
      priority: "important",
      title: KLOKKE_TITEL,
      body: KLOKKE_TEKST,
      deep_link: KLOKKE_LINK,
      reference_type: KLOKKE_REFERENCE_TYPE,
      reference_id: k.companyId,
      company_id: k.companyId,
      dedup_key: k.dedupKey,
    });
  }
  return r;
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
    return new Response(JSON.stringify({ ok: false, fejl: besked }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const toerKoersel = raaBody?.dry_run !== false;
  let nu = new Date();
  if (typeof raaBody?.nu === "string") {
    const t = new Date(raaBody.nu);
    if (Number.isNaN(t.getTime())) {
      return new Response(JSON.stringify({ ok: false, fejl: `«nu» er ikke en dato: ${raaBody.nu}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    nu = t;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let resultat: CertifikatKlokkeResultat;
  try {
    resultat = await koerCertifikatKlokke(admin, toerKoersel, nu);
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return new Response(JSON.stringify({ ok: false, dry_run: toerKoersel, fejl: grund }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  console.log(`${LOG} ${resultat.dry_run ? "TØRKØRSEL" : "SKRIVER"} — i dag ${resultat.i_dag}, berettigede ${resultat.berettigede}, klar ${resultat.klar.length}, modtagere ${resultat.modtagere}, skrevet ${resultat.skrevet}`);
  return new Response(JSON.stringify(resultat), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
