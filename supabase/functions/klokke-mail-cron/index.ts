// klokke-mail-cron — rådgivernes klokker (advisor_notifications) som mail
// (udkast 21/9-2026, recon-klokker-mail.md). Hvert kvarter på offset 4
// (migration 20260922071000): minutterne 4, 19, 34, 49.
//
// HVORFOR (princip 1): 23 skrivere ringer klokken, og ingen mailvej læste
// tabellen. Tre mails, typerne står ÉT sted (_shared/klokkeMail.ts):
//   ALARM      → driftModtager (Jonas), straks, én samlet mail pr. kørsel.
//   COMMUNITY  → hver rådgiver, straks, én samlet mail pr. rådgiver.
//   MORGEN     → hver rådgiver, første kørsel efter kl. 07 dansk (07:04) PÅ EN
//                HVERDAG (hverdage.ts), én mail pr. hverdag med klokkerne fra før kl. 07.
//
// SAMME FORM SOM klaviyo-gensend-cron: HTTP-indgang, authenticateServiceRole
// FØRST bag verify_jwt = true (Bucket B), TØRKØRSEL SOM STANDARD — uden body
// dømmes der og svares med hvem der ville få hvad, men intet sendes og intet
// stemples. Kun et eksplicit { "dry_run": false } sender. Ukendte felter i
// body'en afvises med 400 (kendteFelter.ts). «nu» kan gives ind (ISO) til en
// tørkørsel på et andet tidspunkt — tiden gives ind, den gættes ikke.
//
// KØRSLEN:
//   1. Rådgiverne: user_roles advisor/admin (som skrivRaadgiverBesked finder dem),
//      mailen fra auth.admin.getUserById (som send-notification-email), fornavnet
//      fra profiles.full_name. Ingen hårdkodede adresser — alarmens modtager er
//      driftModtager() (ét sted).
//   2. Rækkerne: advisor_notifications med advisor_id IS NOT NULL, read_at IS NULL,
//      mailet_at IS NULL, created_at inden for VINDUE_DAGE — side for side.
//   3. fordel(raekker, nu) → alarm · community pr. rådgiver · morgen pr. rådgiver ·
//      sprunget · ukendte.
//   4. Hver mail: email_send_log slås op på nøglen FØR afsendelsen (sent/suppressed
//      = fandtes); sendManagedEmail (indgangsMailHtml-rammen); EFTER en vellykket
//      afsendelse stemples rækkerne (mailet_at = nu). Fejler stemplingen, står det
//      i fejl — og næste kørsel rammer samme nøgle (sættets aftryk), så der ikke
//      går en mail nr. to.
//
// KASTER ALDRIG mod én mail: fejler afsendelsen for én, tælles den, og de andre
// sendes. Vælter hele kørslen (databasen væk), er svaret 500 med grunden.
//
// BEVISET (CLAUDE.md «Deployment af edge functions», trin 4): functionen er ny —
// en tørkørsel, der svarer med raekker_laest, alarm, community, morgen og
// sprunget, er beviset. Første rigtige mail først efter en tørkørsel med tal.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { driftModtager } from "../_shared/driftModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import {
  ALARM_MODTAGER_ID,
  alarmHaendelser,
  alarmMailTekst,
  communityMailTekst,
  erMorgenkoersel,
  fordel,
  forrigeMorgen,
  type KlokkeRaekke,
  MAIL_LABEL,
  type MailArt,
  type MailTekst,
  mailNoegle,
  morgenGraense,
  morgenMailTekst,
  type Raadgiver,
  type Sprunget,
  VINDUE_DAGE,
} from "../_shared/klokkeMail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[klokke-mail-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu"] as const;

const SIDE = 1000;
const RAEKKE_FELTER = "id, advisor_id, type, title, body, company_id, reference_type, reference_id, read_at, mailet_at, created_at";

/** Én planlagt mail i svaret. */
export interface MailSvar {
  art: MailArt;
  /** Rådgiverens id — eller «drift» for alarmen. */
  modtager_id: string;
  modtager: string;
  /** Rækker, der stemples. */
  klokker: number;
  /** Hændelser i mailen (alarmen folder én pr. rådgiver til én). */
  haendelser: number;
  emne: string;
  titler: string[];
  noegle: string;
  /** toerkoersel · sendt · fandtes · spaerret · fejlet: <grund>. */
  mail: string;
  stemplet: number;
}

export interface KlokkeMailResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Hverdag (hverdage.ts) og dansk klokke ≥ 07. */
  morgen_koersel: boolean;
  morgen_graense: string;
  /** Den forrige morgenmails tidspunkt (seneste hverdag før i dag, kl. 07). */
  forrige_morgen: string;
  raadgivere: { id: string; email: string; fornavn: string | null }[];
  raekker_laest: number;
  alarm: MailSvar | null;
  community: MailSvar[];
  morgen: MailSvar[];
  sprunget: Sprunget;
  ukendte: { id: string; type: string }[];
  /** Rådgivere uden mailadresse — deres rækker venter. */
  uden_adresse: string[];
  fejl: string[];
}

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function tomtResultat(toerKoersel: boolean, nu: Date): KlokkeMailResultat {
  return {
    ok: true, dry_run: toerKoersel, nu: nu.toISOString(),
    morgen_koersel: erMorgenkoersel(nu), morgen_graense: morgenGraense(nu).toISOString(), forrige_morgen: forrigeMorgen(nu).toISOString(),
    raadgivere: [], raekker_laest: 0, alarm: null, community: [], morgen: [],
    sprunget: { laest: 0, mailet: 0, uden_advisor: 0, aldrig: 0, legacy: 0, venter_paa_morgen: 0 },
    ukendte: [], uden_adresse: [], fejl: [],
  };
}

/** Rådgiverne: user_roles advisor/admin → auth-mail (getUserById) → fornavn (profiles.full_name). */
async function hentRaadgivere(admin: SupabaseClient, r: KlokkeMailResultat): Promise<Raadgiver[]> {
  const { data: roller, error: rolleFejl } = await admin.from("user_roles").select("user_id").in("role", ["advisor", "admin"]);
  if (rolleFejl) throw new Error(`user_roles: ${rolleFejl.message}`);
  const ids = [...new Set(((roller ?? []) as { user_id: string }[]).map((x) => x.user_id))];
  const { data: profiler } = await admin.from("profiles").select("user_id, full_name").in("user_id", ids);
  const navne = new Map<string, string | null>();
  for (const p of (profiler ?? []) as { user_id: string; full_name: string | null }[]) {
    navne.set(p.user_id, (p.full_name ?? "").trim().split(/\s+/)[0] || null);
  }
  const ud: Raadgiver[] = [];
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    const email = (data?.user?.email ?? "").trim().toLowerCase();
    if (error || !email) { r.uden_adresse.push(id); continue; }
    ud.push({ id, email, fornavn: navne.get(id) ?? null });
  }
  return ud;
}

/** Hent alle umailede, ulæste rækker med advisor_id i vinduet, side for side — aldrig et tavst loft. */
async function hentRaekker(admin: SupabaseClient, fra: Date, til: Date): Promise<KlokkeRaekke[]> {
  const ud: KlokkeRaekke[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("advisor_notifications").select(RAEKKE_FELTER)
      .not("advisor_id", "is", null).is("read_at", null).is("mailet_at", null)
      .gte("created_at", fra.toISOString()).lte("created_at", til.toISOString())
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`advisor_notifications: ${error.message}`);
    const rk = (data ?? []) as KlokkeRaekke[];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

interface Plan {
  art: MailArt;
  modtagerId: string;
  modtager: string;
  tekst: MailTekst;
  /** Rækkerne, der stemples efter afsendelsen. */
  raekker: KlokkeRaekke[];
  haendelser: number;
}

function tilSvar(p: Plan, nu: Date): MailSvar {
  return {
    art: p.art, modtager_id: p.modtagerId, modtager: p.modtager, klokker: p.raekker.length, haendelser: p.haendelser,
    emne: p.tekst.emne, titler: p.tekst.blokke.map((b) => b.overskrift), noegle: mailNoegle(p.art, p.modtagerId, p.raekker, nu),
    mail: "ingen", stemplet: 0,
  };
}

const EYEBROW: Readonly<Record<MailArt, string>> = { alarm: "Drift · Alarm", community: "Community", morgen: "Morgenmailen" };

/** Én mail: loggen slås op på nøglen først; sendes; rækkerne stemples EFTER en vellykket afsendelse. */
async function sendKlokkeMail(admin: SupabaseClient, p: Plan, nu: Date, r: KlokkeMailResultat): Promise<MailSvar> {
  const svar = tilSvar(p, nu);
  const noegle = svar.noegle;
  let stempl = false;
  try {
    const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log")
      .select("message_id, status").eq("message_id", noegle).in("status", ["sent", "suppressed"]).limit(1);
    if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
    const forrige = ((fandtes ?? []) as { status: string }[])[0] ?? null;
    if (forrige) {
      // Mailen er sendt før (stemplingen fejlede dengang) — stempl nu; var den spærret, står rækkerne.
      svar.mail = forrige.status === "sent" ? "fandtes" : "spaerret";
      stempl = forrige.status === "sent";
    } else {
      const html = indgangsMailHtml({
        eyebrow: EYEBROW[p.art],
        overskrift: p.tekst.emne,
        afsnit: p.tekst.afsnit,
        blokke: p.tekst.blokke,
        hilsen: "The Boardroom",
      });
      const res = await sendManagedEmail({
        adminClient: admin,
        to: p.modtager,
        subject: p.tekst.emne,
        html,
        text: p.tekst.tekst,
        label: MAIL_LABEL[p.art],
        idempotencyKey: noegle,
        metadata: { art: p.art, klokker: p.raekker.map((x) => x.id), nu: nu.toISOString() },
      });
      if (res.sent) { svar.mail = "sendt"; stempl = true; }
      else {
        svar.mail = res.reason === "recipient_suppressed" ? "spaerret" : `fejlet: ${res.reason}`;
        console.error(`${LOG} ${p.art}-mailen til ${p.modtager} blev ikke sendt: ${res.reason}`);
      }
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    svar.mail = `fejlet: ${grund}`;
    r.fejl.push(`${p.art} ${p.modtagerId}: ${grund}`);
    console.error(`${LOG} ${p.art}-mailen kastede:`, grund);
  }

  if (stempl) {
    const ids = p.raekker.map((x) => x.id);
    const { error: stempelFejl } = await admin.from("advisor_notifications")
      .update({ mailet_at: nu.toISOString() }).in("id", ids).is("mailet_at", null);
    if (stempelFejl) {
      r.fejl.push(`${p.art} ${p.modtagerId}: stempling fejlede — ${stempelFejl.message}`);
      console.error(`${LOG} stemplingen fejlede (${ids.length} rækker):`, stempelFejl.message);
    } else {
      svar.stemplet = ids.length;
    }
  }
  return svar;
}

export async function koerKlokkeMail(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date },
): Promise<{ status: number; resultat: KlokkeMailResultat }> {
  const r = tomtResultat(a.toerKoersel, a.nu);

  const raadgivere = await hentRaadgivere(admin, r);
  r.raadgivere = raadgivere.map((x) => ({ id: x.id, email: x.email, fornavn: x.fornavn }));
  const pr = new Map(raadgivere.map((x) => [x.id, x] as const));

  const fra = new Date(a.nu.getTime() - VINDUE_DAGE * 86_400_000);
  const raekker = await hentRaekker(admin, fra, a.nu);
  r.raekker_laest = raekker.length;

  const f = fordel(raekker, a.nu);
  r.sprunget = f.sprunget;
  r.ukendte = f.ukendte;

  // Planerne — alarmen først, så community, så morgen. Rådgivere uden adresse får ingen plan; deres rækker venter.
  const planer: Plan[] = [];
  if (f.alarm.length > 0) {
    const haendelser = alarmHaendelser(f.alarm);
    planer.push({ art: "alarm", modtagerId: ALARM_MODTAGER_ID, modtager: driftModtager(), tekst: alarmMailTekst(haendelser, a.nu), raekker: f.alarm, haendelser: haendelser.length });
  }
  for (const [art, grupper, tekstAf] of [
    ["community", f.community, communityMailTekst],
    ["morgen", f.morgen, morgenMailTekst],
  ] as const) {
    for (const [advisorId, liste] of [...grupper].sort(([x], [y]) => (x < y ? -1 : 1))) {
      const raadgiver = pr.get(advisorId);
      if (!raadgiver) continue;
      planer.push({ art, modtagerId: advisorId, modtager: raadgiver.email, tekst: tekstAf(liste, a.nu, raadgiver.fornavn), raekker: liste, haendelser: liste.length });
    }
  }

  if (a.toerKoersel) {
    for (const p of planer) {
      const svar = { ...tilSvar(p, a.nu), mail: "toerkoersel" };
      if (p.art === "alarm") r.alarm = svar; else r[p.art].push(svar);
    }
    return { status: 200, resultat: r };
  }

  for (const p of planer) {
    const svar = await sendKlokkeMail(admin, p, a.nu, r);
    if (p.art === "alarm") r.alarm = svar; else r[p.art].push(svar);
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
  let svar: { status: number; resultat: KlokkeMailResultat };
  try {
    svar = await koerKlokkeMail(admin, { toerKoersel, nu });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  const { resultat } = svar;
  console.log(`${LOG} Summary:`, JSON.stringify({
    ...resultat, raadgivere: resultat.raadgivere.length,
    alarm: resultat.alarm ? { klokker: resultat.alarm.klokker, mail: resultat.alarm.mail } : null,
    community: resultat.community.map((m) => ({ klokker: m.klokker, mail: m.mail })),
    morgen: resultat.morgen.map((m) => ({ klokker: m.klokker, mail: m.mail })),
  }));
  return json(resultat, svar.status);
});
