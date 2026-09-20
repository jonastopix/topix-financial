// stille-klokker-cron — de to klokker, der ikke fandtes (20/9-2026): «betalt,
// ingen bruger» og «ingen login». Én gang i døgnet (migration 20260921100000).
//
// SAMME FORM SOM fornyelsesvarsel-cron: HTTP-indgang, authenticateServiceRole
// bag verify_jwt = true (Bucket B), TØRKØRSEL SOM STANDARD — uden body dømmes
// der og svares med titlerne, men intet skrives. Kun et eksplicit
// { "dry_run": false } skriver klokken. Ukendte felter i body'en afvises
// (kendteFelter.ts — en body, man ikke forstår, bliver aldrig en standardkørsel).
// «nu» kan gives ind (ISO) til en tørkørsel på en anden dag — tæller og nævner
// over samme periode; tiden gives ind, den gættes ikke.
//
// DOMMEN OG TEKSTERNE bor i _shared/stilleDom.ts (ren, spejlet i src/lib, én
// test pr. regel). Her hentes kun data og skrives klokken:
//   kontrakter          — grundmængden: kontraktår, der dækker i dag, pris > 0,
//                         ikke gratis. Syv betaler gennem e-conomic og findes
//                         KUN her (ikke i Stripe, ikke i company_traek).
//   companies           — status ('tidligere' slukker), is_legat, er_kunde,
//                         kontaktperson/-mail, indgangspris (B4's fornyelsespris).
//   company_members     — «har en bruger» (+ profiles for navnet).
//   user_login_log      — sidste login pr. bruger (findes fra 2/3-2026).
//   company_invitations — A's tre tilstande.
//
// KLOKKEN er advisor_notifications i vagtens form (skrivRaadgiverBesked: én
// række pr. rådgiver, dedup FØR insert). Dedup går på TITLEN — reference_id er
// uuid og kan ikke bære et trin — så titlen bærer tærsklen og episodens dato og
// er den samme hver dag, indtil næste trin (stilleDom.guard.test værner, at
// reference_id aldrig sendes). company_id sættes, så klokken linker til
// virksomheden; member_id udfyldes af writeren (rådgiveren selv).
//
// KASTER ALDRIG mod én virksomhed: fejler dommen eller skrivningen for én,
// tælles den som fejlet med grund, og de andre får deres klokke.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { beregnFornyelsespris, erFejl } from "../_shared/fornyelsespris.ts";
import {
  doemStille,
  stilleTekst,
  TYPE_INGEN_BRUGER,
  TYPE_INGEN_LOGIN,
  type StilleBruger,
  type StilleDom,
  type StilleInvitation,
  type StilleKontrakt,
  type StilleLogin,
} from "../_shared/stilleDom.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu"] as const;

const SIDE = 1000;

export interface StilleResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Kontraktår, der dækker i dag med en pris (grundmængden før companies-filtrene). */
  fundet: number;
  /** Dommen sagde en klokke. */
  ingen_bruger: number;
  ingen_login: number;
  /** Skrevet til klokken (0 i tørkørsel) — antal virksomheder, hvor mindst én rådgiver fik rækken. */
  ringet: number;
  /** Rækken fandtes allerede hos alle rådgivere (samme trin, samme episode). */
  fandtes: number;
  /** Tørkørsel: hvad der ville stå i klokken. */
  ville_ringe: { virksomhed: string; klokke: "ingen_bruger" | "ingen_login"; trin: number; dage: number; title: string; body: string }[];
  /** Tavse med grund — så en tørkørsel siger HVORFOR ingen ringer. */
  tavse: Record<string, number>;
  tavse_liste: { virksomhed: string; grund: string }[];
  fejlet: number;
  fejl: { virksomhed: string; grund: string }[];
}

interface KontraktRaekke { company_id: string; periode_start: string; periode_slut: string; betalingsmodel: string; pris_eks_moms_oere: number }
interface CompanyRaekke { id: string; name: string; status: string | null; is_legat: boolean | null; er_kunde: boolean | null; contact_person: string | null; contact_email: string | null; indgangspris_oere: number | null; fornyelsespris_oere: number | null }
interface MedlemRaekke { company_id: string; user_id: string; created_at: string }
interface ProfilRaekke { user_id: string; full_name: string | null }
interface LoginRaekke { user_id: string; logged_in_at: string }
interface InvitationRaekke { company_id: string; email: string; status: string; created_at: string; accepted_at: string | null }

function isoDag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hent alle rækker i sider — én forespørgsel pr. SIDE, aldrig et tavst loft. */
async function alleSider<T>(byg: (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const ud: T[] = [];
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await byg(fra, fra + SIDE - 1);
    if (error) throw new Error(error.message);
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

export async function koerStilleKlokker(admin: SupabaseClient, toerKoersel: boolean, nu: Date): Promise<StilleResultat> {
  const r: StilleResultat = {
    ok: true, dry_run: toerKoersel, nu: nu.toISOString(), fundet: 0, ingen_bruger: 0, ingen_login: 0, ringet: 0, fandtes: 0,
    ville_ringe: [], tavse: {}, tavse_liste: [], fejlet: 0, fejl: [],
  };
  const nuDag = isoDag(nu);

  // Grundmængden — kontrakter (regel 1). SQL filtrerer kun det billige og sikre; dagene dømmes i motoren.
  const kontrakter = await alleSider<KontraktRaekke>((fra, til) =>
    admin.from("kontrakter").select("company_id, periode_start, periode_slut, betalingsmodel, pris_eks_moms_oere")
      .lte("periode_start", nuDag).gt("periode_slut", nuDag).neq("betalingsmodel", "gratis").gt("pris_eks_moms_oere", 0)
      .order("periode_start").range(fra, til));
  r.fundet = kontrakter.length;
  if (kontrakter.length === 0) return r;
  const companyIds = [...new Set(kontrakter.map((k) => k.company_id))];

  const companies = new Map<string, CompanyRaekke>();
  const medlemmer: MedlemRaekke[] = [];
  const invitationer: InvitationRaekke[] = [];
  for (const del of dele(companyIds, 200)) {
    const { data: cs, error: cFejl } = await admin.from("companies")
      .select("id, name, status, is_legat, er_kunde, contact_person, contact_email, indgangspris_oere, fornyelsespris_oere").in("id", del);
    if (cFejl) throw new Error(`companies: ${cFejl.message}`);
    for (const c of (cs ?? []) as CompanyRaekke[]) companies.set(c.id, c);
    medlemmer.push(...await alleSider<MedlemRaekke>((fra, til) =>
      admin.from("company_members").select("company_id, user_id, created_at").in("company_id", del).order("created_at").range(fra, til)));
    invitationer.push(...await alleSider<InvitationRaekke>((fra, til) =>
      admin.from("company_invitations").select("company_id, email, status, created_at, accepted_at").in("company_id", del).order("created_at").range(fra, til)));
  }

  const userIds = [...new Set(medlemmer.map((m) => m.user_id))];
  const navne = new Map<string, string | null>();
  const sidsteLogin = new Map<string, string>();
  for (const del of dele(userIds, 200)) {
    const { data: ps, error: pFejl } = await admin.from("profiles").select("user_id, full_name").in("user_id", del);
    if (pFejl) throw new Error(`profiles: ${pFejl.message}`);
    for (const p of (ps ?? []) as ProfilRaekke[]) navne.set(p.user_id, p.full_name);
    // Sidste login pr. bruger: nyeste først, og den første række pr. bruger er svaret.
    // Sider igennem, fordi supabase-js ikke kan group by — loggen er lille (fra 2/3-2026).
    const rk = await alleSider<LoginRaekke>((fra, til) =>
      admin.from("user_login_log").select("user_id, logged_in_at").in("user_id", del).order("logged_in_at", { ascending: false }).range(fra, til));
    for (const l of rk) if (!sidsteLogin.has(l.user_id)) sidsteLogin.set(l.user_id, l.logged_in_at);
  }

  const brugere: StilleBruger[] = medlemmer.map((m) => ({ companyId: m.company_id, userId: m.user_id, navn: navne.get(m.user_id) ?? null, oprettetAt: m.created_at }));
  const logins: StilleLogin[] = [...sidsteLogin].map(([userId, sidste]) => ({ userId, sidsteLogin: sidste }));
  const invs: StilleInvitation[] = invitationer.map((i) => ({ companyId: i.company_id, email: i.email, status: i.status, sendtAt: i.created_at, accepteretAt: i.accepted_at }));

  for (const kr of kontrakter) {
    const c = companies.get(kr.company_id);
    const navn = c?.name ?? kr.company_id;
    try {
      if (!c) {
        r.tavse.ingen_virksomhed = (r.tavse.ingen_virksomhed ?? 0) + 1;
        r.tavse_liste.push({ virksomhed: navn, grund: "ingen_virksomhed" });
        continue;
      }
      const k: StilleKontrakt = {
        companyId: c.id, navn: c.name, status: c.status, erKunde: c.er_kunde, erLegat: c.is_legat,
        periodeStart: kr.periode_start, periodeSlut: kr.periode_slut, betalingsmodel: kr.betalingsmodel, prisEksMomsOere: kr.pris_eks_moms_oere,
        kontaktperson: c.contact_person, kontaktEmail: c.contact_email,
      };
      const dom: StilleDom = doemStille(k, brugere, logins, invs, nu);
      if (dom.klokke === "tavs") {
        r.tavse[dom.grund] = (r.tavse[dom.grund] ?? 0) + 1;
        if (dom.grund !== "aktiv") r.tavse_liste.push({ virksomhed: navn, grund: dom.grund });
        continue;
      }
      // B4's fornyelsespris — samme kilde som fornyelsesvarsel-cron; kan den ikke regnes, udelades den.
      let fornyelsesprisOere: number | null = null;
      if (dom.klokke === "ingen_login" && dom.trin === 4) {
        const pris = beregnFornyelsespris({ indgangspris_oere: c.indgangspris_oere, fornyelsespris_oere: c.fornyelsespris_oere, betalingsmodel: "fuld" });
        if (!erFejl(pris)) fornyelsesprisOere = pris.samlet_oere;
      }
      const tekst = stilleTekst(dom, k, brugere, fornyelsesprisOere);
      if (!tekst) continue;
      if (dom.klokke === "ingen_bruger") r.ingen_bruger++; else r.ingen_login++;
      if (toerKoersel) {
        r.ville_ringe.push({ virksomhed: navn, klokke: dom.klokke, trin: dom.trin, dage: dom.dage, title: tekst.title, body: tekst.body });
        continue;
      }
      const skrevet = await skrivRaadgiverBesked(admin, {
        type: dom.klokke === "ingen_bruger" ? TYPE_INGEN_BRUGER : TYPE_INGEN_LOGIN,
        title: tekst.title,
        body: tekst.body,
        company_id: c.id,
        reference_type: "kontrakt",
        reference_id: null,
      });
      if (skrevet.fejl.length > 0) {
        r.fejlet++;
        r.fejl.push({ virksomhed: navn, grund: skrevet.fejl.join("; ") });
        continue;
      }
      if (skrevet.skrevet > 0) r.ringet++; else r.fandtes++;
    } catch (err) {
      r.fejlet++;
      r.fejl.push({ virksomhed: navn, grund: err instanceof Error ? err.message : String(err) });
    }
  }
  r.ok = r.fejlet === 0;
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
    console.error(`[stille-klokker-cron] ${besked}`);
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
  let resultat: StilleResultat;
  try {
    resultat = await koerStilleKlokker(admin, toerKoersel, nu);
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error("[stille-klokker-cron] kørslen væltede:", grund);
    return new Response(JSON.stringify({ ok: false, dry_run: toerKoersel, fejl: grund }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  console.log("[stille-klokker-cron] Summary:", JSON.stringify({ ...resultat, ville_ringe: resultat.ville_ringe.length, tavse_liste: resultat.tavse_liste.length }));
  return new Response(JSON.stringify(resultat), { status: resultat.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
