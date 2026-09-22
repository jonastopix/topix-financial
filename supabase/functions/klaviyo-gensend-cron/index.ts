// klaviyo-gensend-cron — gensenderen for klaviyo_haendelser (21/9-2026,
// recon-klaviyo-gensend.md + recon-gensender-foer-bygning.md). Hvert 5. minut
// (migration 20260921160000).
//
// HVORFOR: en Klaviyo-hændelse, der fejlede (timeout, 5xx, 429, nøgle), var
// tabt for altid — sporet vidste det, ingen gensendte. Tilmeldingen er skrevet
// FØR Klaviyo kaldes, så eWebinars gensendelse af samme body rammer
// aftryk-reglen, og en ny body giver «ingen» overgang. Tirsdag 22/9 kl. 09 kører
// webinaret, og eWebinar POSTer for ~300 på få minutter, når det slutter; ét 5xx
// kostede den person hele efter-flowet.
//
// SAMME FORM SOM stille-klokker-cron og meta-annoncer-cron: HTTP-indgang,
// authenticateServiceRole FØRST bag verify_jwt = true (Bucket B), TØRKØRSEL
// SOM STANDARD — uden body dømmes der og svares med listerne, men intet sendes
// og intet mailes. Kun et eksplicit { "dry_run": false } sender. Ukendte
// felter i body'en afvises med 400 (kendteFelter.ts). «nu» kan gives ind
// (ISO) til en tørkørsel på et andet tidspunkt — tiden gives ind, den gættes
// ikke.
//
// DOMMEN bor i _shared/klaviyoGensend.ts (ren, én prøve pr. regel). Her
// hentes rækkerne, sendes kroppene og skrives alarmen:
//   1. Læs klaviyo_haendelser for de sidste VINDUE_TIMER + TRAPPE_MINUTTER
//      (24 t + 155 min): vinduet på 24 t måles på gruppens FØRSTE forsøg, og
//      en gruppes sidste forsøg ligger op til 155 min efter det første — læses
//      kun 24 t, ses det første forsøg ikke, og dommen ville tro, gruppen var
//      yngre, end den er.
//   2. vaelgGensendelser(raekker, nu) → gensend · opgivet · konfiguration · ignoreret.
//   3. For hver gruppe i gensend: gensendHvisGemt (klaviyoAfsendelse.ts) —
//      den GEMTE krop uændret, én ny række i sporet pr. forsøg. Sekventielt,
//      inden for et tidsbudget (BUDGET_MS) under cron-timeouten på 60 s; det,
//      der ikke nås, hedder «udsat» og tages næste kørsel (5 min senere).
//   4. Alarm (princip 1): opgivne grupper og grupper med nøglefejl giver EN
//      MAIL til driftModtager() (Jonas 21/9: «når noget går galt, skal kun være
//      Jonas» — ikke raadgiverModtager, som skifter til kontakt@ 19/10) ad husets
//      vej (sendManagedEmail) OG en drift-klokke (skrivRaadgiverBesked).
//      Højst én mail pr. time: idempotensnøglen bærer dansk dato og time, og
//      email_send_log slås op FØR afsendelsen, så udbyderen ikke skal dedup'e
//      for os. Klokkens titel bærer samme dato og time — dedup på titlen.
//      Alarmen tager kun grupper med sidste forsøg inden for ALARM_VINDUE_MIN
//      (60 min) — en opgivet gruppe alarmerer 1–2 gange, ikke hver time i 24 t.
//
// GENSENDEREN GÅR GENNEM klaviyoAfsendelse. Her findes hverken fetch, kald
// eller KLAVIYO_API_KEY — nøglen læses ét sted (klaviyo.guard dom 3), og
// gensendHvisGemt har try/catch om alt. Værnet: klaviyoGensend.guard.test.ts.
//
// BEVISET (CLAUDE.md «Deployment af edge functions», trin 4): med
// { "dry_run": false, "bevis_id": "<id på én ok-række>" } sendes NETOP den
// rækkes krop igen — en dublet, som Klaviyo kasserer på unique_id. Så er
// afsendelsen bevist i drift uden at nogen får en mail. Rækken skal findes og
// have udfald ok, ellers 400. Intet andet sendes i en bevis-kørsel; svaret
// bærer «bevis» med rækkens id og det nye udfald.
//
// KASTER ALDRIG mod én gruppe: fejler afsendelsen for én, tælles den som
// fejlede_igen, og de andre sendes. Vælter hele kørslen (databasen væk), er
// svaret 500 med grunden.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { driftModtager } from "../_shared/driftModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { afmeldHvisNoegle, gensendHvisGemt } from "../_shared/klaviyoAfsendelse.ts";
import { type AfmeldSporRaekke, vaelgGenafmeldinger } from "../_shared/klaviyoAfmelding.ts";
import {
  ALARM_KLOKKE_TYPE,
  ALARM_MAIL_LABEL,
  alarmGrupper,
  alarmNoegle,
  alarmTekst,
  type AlarmGruppe,
  type GensendRaekke,
  type Gruppe,
  type Opgivet,
  TRAPPE_MINUTTER,
  type Udvalg,
  vaelgGensendelser,
  VINDUE_TIMER,
} from "../_shared/klaviyoGensend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[klaviyo-gensend-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "bevis_id"] as const;

/**
 * Tidsbudget for afsendelserne i én kørsel. Cron-timeouten er 60 s
 * (kald_edge, migrationen); hvert Klaviyo-kald kan tage op til 3 s
 * (TIMEOUT_MS). Det, der ikke nås, hedder «udsat» og tages 5 minutter senere.
 */
export const BUDGET_MS = 45_000;

const SIDE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** En gruppe i svaret — uden kroppen (den står i sporet). */
interface GruppeSvar {
  metric: string;
  email: string;
  unikt_id: string;
  forsoeg: number;
  foerste_at: string;
  sidste_at: string;
  sidste_udfald: string;
  kilde_id: string;
  grund?: string;
}

export interface GensendResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Rækker læst fra klaviyo_haendelser i vinduet (24 t + 155 min). */
  raekker_laest: number;
  /** Grupper (metric, email, unikt_id) dømt. */
  grupper: number;
  /** Dommen sagde «send igen nu». */
  gensend: GruppeSvar[];
  opgivet: GruppeSvar[];
  konfiguration: GruppeSvar[];
  ignoreret: Udvalg["ignoreret"];
  /** Faktisk sendt igen (0 i tørkørsel). */
  gensendt: number;
  lykkedes: number;
  fejlede_igen: number;
  /** Ikke nået inden for budgettet — tages næste kørsel. */
  udsat: number;
  /** Det, alarmen lister (også i tørkørsel). */
  alarm_grupper: AlarmGruppe[];
  /** ingen · toerkoersel · sendt · fandtes · fejlet: <grund>. */
  alarm_mail: string;
  /** ingen · toerkoersel · skrevet · fandtes · fejlet: <grund>. */
  alarm_klokke: string;
  /** Kun i en bevis-kørsel: rækken, hvis krop blev sendt igen, og det nye udfald. */
  bevis: { id: string; metric: string; unikt_id: string; udfald_foer: string; udfald_nu: string | null } | null;
  /** AFMELDINGER (22/9-2026): fejlede afmeldinger, der prøves igen. */
  afmeld: {
    /** Rækker læst i klaviyo_afmeldinger. */
    spor_laest: number;
    /** Mails, der er forsøgt afmeldt. */
    mails: number;
    /** Mails med en ok-række — færdige. */
    afmeldt: number;
    /** Mails uden ok-række, forsøgt for nylig — venter. */
    venter: number;
    /** Mails uden ok-række, prøves igen nu. */
    proev: string[];
    /** Faktisk forsøgt igen (0 i tørkørsel). */
    forsoegt: number;
    lykkedes: number;
    fejlede_igen: number;
    udsat: number;
  };
  fejl: string[];
}

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function tilSvar(g: Gruppe | Opgivet): GruppeSvar {
  const s: GruppeSvar = {
    metric: g.metric, email: g.email, unikt_id: g.unikt_id, forsoeg: g.forsoeg,
    foerste_at: g.foerste_at, sidste_at: g.sidste_at, sidste_udfald: g.sidste_udfald, kilde_id: g.kilde_id,
  };
  if ("grund" in g) s.grund = g.grund;
  return s;
}

function tomtResultat(toerKoersel: boolean, nu: Date): GensendResultat {
  return {
    ok: true, dry_run: toerKoersel, nu: nu.toISOString(), raekker_laest: 0, grupper: 0,
    gensend: [], opgivet: [], konfiguration: [],
    ignoreret: { ok: 0, venter: 0, for_gammel: 0, ingen_mail: 0, ikke_sendt: 0, ubrugelig: 0 },
    gensendt: 0, lykkedes: 0, fejlede_igen: 0, udsat: 0,
    alarm_grupper: [], alarm_mail: "ingen", alarm_klokke: "ingen", bevis: null,
    afmeld: { spor_laest: 0, mails: 0, afmeldt: 0, venter: 0, proev: [], forsoegt: 0, lykkedes: 0, fejlede_igen: 0, udsat: 0 },
    fejl: [],
  };
}

const RAEKKE_FELTER = "id, sendt_at, metric, email, unikt_id, udfald, sendt";

/**
 * AFMELDINGERNE (22/9-2026, ~/Downloads/udkast-ewebinar-afmelding). Hele
 * sporet, side for side — INTET VINDUE. En marketinghændelse taber sin værdi
 * og opgives efter 24 timer og seks forsøg (vaelgGensendelser); en AFMELDING
 * gør ikke: den skal lykkes, uanset hvor gammel den er. Derfor er reglen her
 * kun «har mailen en ok-række?», og tabellen holdes lille af netop den regel
 * — en vellykket afmelding skriver sin sidste række og bliver aldrig valgt igen.
 *
 * DENNE FUNCTION PRØVER KUN DET, DER ALLEREDE ER FORSØGT. De mails, der aldrig
 * er forsøgt (historikken fra før udrulningen), hentes af klaviyo-afmeld-bagud,
 * som læser eWebinar-siden. To jobs, én tabel hver — ingen af dem gætter.
 */
async function hentAfmeldSpor(admin: SupabaseClient): Promise<AfmeldSporRaekke[]> {
  const ud: AfmeldSporRaekke[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("klaviyo_afmeldinger").select("email, udfald, forsoegt_at")
      .order("forsoegt_at", { ascending: true }).range(start, start + SIDE - 1);
    if (error) throw new Error(`klaviyo_afmeldinger: ${error.message}`);
    const rk = (data ?? []) as AfmeldSporRaekke[];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

/** Hent alle rækker i vinduet, side for side — aldrig et tavst loft. */
async function hentRaekker(admin: SupabaseClient, fra: Date, til: Date): Promise<GensendRaekke[]> {
  const ud: GensendRaekke[] = [];
  for (let start = 0; ; start += SIDE) {
    const { data, error } = await admin.from("klaviyo_haendelser").select(RAEKKE_FELTER)
      .gte("sendt_at", fra.toISOString()).lte("sendt_at", til.toISOString())
      .order("sendt_at", { ascending: true }).order("id", { ascending: true })
      .range(start, start + SIDE - 1);
    if (error) throw new Error(`klaviyo_haendelser: ${error.message}`);
    const rk = (data ?? []) as GensendRaekke[];
    ud.push(...rk);
    if (rk.length < SIDE) return ud;
  }
}

/** Alarmen: én mail pr. time (nøglen bærer dansk dato og time) og én klokke pr. time (titlen bærer dem). */
async function skrivAlarm(admin: SupabaseClient, grupper: readonly AlarmGruppe[], nu: Date, r: GensendResultat): Promise<void> {
  const noegle = alarmNoegle(nu);
  const tekst = alarmTekst(grupper, nu);

  // Mailen. email_send_log slås op først, så samme time aldrig giver to rækker.
  try {
    const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log")
      .select("message_id").eq("message_id", noegle).limit(1);
    if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
    if ((fandtes ?? []).length > 0) {
      r.alarm_mail = "fandtes";
    } else {
      const html = indgangsMailHtml({
        eyebrow: "Drift · Klaviyo",
        overskrift: tekst.emne,
        afsnit: tekst.afsnit,
        blokke: tekst.blokke,
        hilsen: "The Boardroom",
      });
      const res = await sendManagedEmail({
        adminClient: admin,
        // Driftsalarmen går til driftModtager — ét sted (driftModtager.ts, 21/9), ikke til rådgiveradressen.
        to: driftModtager(),
        subject: tekst.emne,
        html,
        text: tekst.tekst,
        label: ALARM_MAIL_LABEL,
        idempotencyKey: noegle,
        metadata: { grupper: grupper.length, nu: nu.toISOString() },
      });
      r.alarm_mail = res.sent ? "sendt" : `fejlet: ${res.reason}`;
      if (res.sent === false) console.error(`${LOG} alarmmailen blev ikke sendt: ${res.reason}`);
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.alarm_mail = `fejlet: ${grund}`;
    r.fejl.push(`alarm_mail: ${grund}`);
    console.error(`${LOG} alarmmailen kastede:`, grund);
  }

  // Klokken — vagtens form; dedup på titlen (reference_id er uuid og kan ikke bære en time).
  const skrevet = await skrivRaadgiverBesked(admin, {
    type: ALARM_KLOKKE_TYPE,
    title: tekst.titel,
    body: tekst.tekst.slice(0, 2000),
    reference_type: "klaviyo_haendelser",
    reference_id: null,
  });
  if (skrevet.fejl.length > 0) {
    r.alarm_klokke = `fejlet: ${skrevet.fejl.join("; ")}`;
    r.fejl.push(`alarm_klokke: ${skrevet.fejl.join("; ")}`);
  } else {
    r.alarm_klokke = skrevet.skrevet > 0 ? "skrevet" : "fandtes";
  }
}

export async function koerGensend(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date; bevisId: string | null; startMs: number },
): Promise<{ status: number; resultat: GensendResultat }> {
  const r = tomtResultat(a.toerKoersel, a.nu);

  // ── Beviset: én ok-række, sendt igen. Intet andet. ─────────────────────────
  if (a.bevisId !== null) {
    const { data, error } = await admin.from("klaviyo_haendelser").select(RAEKKE_FELTER).eq("id", a.bevisId).maybeSingle();
    if (error) throw new Error(`klaviyo_haendelser (bevis): ${error.message}`);
    const raekke = (data ?? null) as GensendRaekke | null;
    if (!raekke) {
      r.ok = false; r.fejl.push(`bevis_id ${a.bevisId} findes ikke i klaviyo_haendelser`);
      return { status: 400, resultat: r };
    }
    if (raekke.udfald !== "ok") {
      r.ok = false; r.fejl.push(`bevis_id ${a.bevisId} har udfald «${raekke.udfald}» — beviset kræver en ok-række (en dublet, Klaviyo kasserer)`);
      return { status: 400, resultat: r };
    }
    r.raekker_laest = 1;
    r.grupper = 1;
    r.gensend = [{ metric: raekke.metric, email: raekke.email, unikt_id: raekke.unikt_id, forsoeg: 1, foerste_at: raekke.sendt_at, sidste_at: raekke.sendt_at, sidste_udfald: raekke.udfald, kilde_id: raekke.id }];
    r.bevis = { id: raekke.id, metric: raekke.metric, unikt_id: raekke.unikt_id, udfald_foer: raekke.udfald, udfald_nu: null };
    if (a.toerKoersel) return { status: 200, resultat: r };
    const svar = await gensendHvisGemt(admin, { metric: raekke.metric, email: raekke.email, unikt_id: raekke.unikt_id, sendt: raekke.sendt });
    r.gensendt = 1;
    if (svar.sendt) r.lykkedes = 1; else r.fejlede_igen = 1;
    r.bevis.udfald_nu = svar.spor.udfald;
    r.ok = svar.sendt;
    return { status: r.ok ? 200 : 500, resultat: r };
  }

  // ── Den almindelige kørsel ──────────────────────────────────────────────────
  const fra = new Date(a.nu.getTime() - (VINDUE_TIMER * 3_600_000 + TRAPPE_MINUTTER * 60_000));
  const raekker = await hentRaekker(admin, fra, a.nu);
  r.raekker_laest = raekker.length;

  const udvalg = vaelgGensendelser(raekker, a.nu);
  r.grupper = udvalg.grupper;
  r.gensend = udvalg.gensend.map(tilSvar);
  r.opgivet = udvalg.opgivet.map(tilSvar);
  r.konfiguration = udvalg.konfiguration.map(tilSvar);
  r.ignoreret = udvalg.ignoreret;
  r.alarm_grupper = alarmGrupper(udvalg, a.nu);

  // ── Afmeldingerne: dømmes FØR tørkørslens return, så en tørkørsel viser dem ──
  const afmeldSpor = await hentAfmeldSpor(admin);
  r.afmeld.spor_laest = afmeldSpor.length;
  const forsoegteMails = [...new Set(afmeldSpor.map((x) => x.email.trim().toLowerCase()))];
  r.afmeld.mails = forsoegteMails.length;
  const genafmeld = vaelgGenafmeldinger(forsoegteMails, afmeldSpor, a.nu);
  r.afmeld.afmeldt = genafmeld.afmeldt.length;
  r.afmeld.venter = genafmeld.venter.length;
  r.afmeld.proev = genafmeld.proev;

  if (a.toerKoersel) {
    if (r.alarm_grupper.length > 0) { r.alarm_mail = "toerkoersel"; r.alarm_klokke = "toerkoersel"; }
    return { status: 200, resultat: r };
  }

  // Gensendelserne — sekventielt, inden for budgettet. Hvert forsøg er en ny række (gensendHvisGemt skriver den).
  for (const g of udvalg.gensend) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const svar = await gensendHvisGemt(admin, { metric: g.metric, email: g.email, unikt_id: g.unikt_id, sendt: g.krop });
    r.gensendt++;
    if (svar.sendt) r.lykkedes++; else r.fejlede_igen++;
  }

  // Afmeldingerne igen — samme budget, samme sekventielle form. `kilde: "bagud"`,
  // fordi rækken ikke kommer fra en ny eWebinar-besked, men fra et fej bagud i sporet.
  for (const mail of genafmeld.proev) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.afmeld.udsat++; continue; }
    const svar = await afmeldHvisNoegle(admin, { email: mail, kilde: "bagud", ewebinarId: null }, a.nu);
    r.afmeld.forsoegt++;
    if (svar.sendt) r.afmeld.lykkedes++; else r.afmeld.fejlede_igen++;
  }

  if (r.alarm_grupper.length > 0) await skrivAlarm(admin, r.alarm_grupper, a.nu, r);

  r.ok = r.fejl.length === 0;
  return { status: r.ok ? 200 : 500, resultat: r };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;
  const startMs = Date.now();

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
  let bevisId: string | null = null;
  if (raaBody?.bevis_id !== undefined && raaBody?.bevis_id !== null) {
    if (typeof raaBody.bevis_id !== "string" || !UUID.test(raaBody.bevis_id)) {
      return json({ ok: false, fejl: [`«bevis_id» skal være id (uuid) på én række i klaviyo_haendelser med udfald ok`] }, 400);
    }
    bevisId = raaBody.bevis_id;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let svar: { status: number; resultat: GensendResultat };
  try {
    svar = await koerGensend(admin, { toerKoersel, nu, bevisId, startMs });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  const { resultat } = svar;
  console.log(`${LOG} Summary:`, JSON.stringify({
    ...resultat, gensend: resultat.gensend.length, opgivet: resultat.opgivet.length,
    konfiguration: resultat.konfiguration.length, alarm_grupper: resultat.alarm_grupper.length,
  }));
  return json(resultat, svar.status);
});
