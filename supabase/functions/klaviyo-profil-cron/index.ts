// klaviyo-profil-cron — webinarets tidspunkt på Klaviyo-profilen (udkast 21/9-2026,
// recon-webinar-tidspunkt.md + recon-profilmodel). Hver time (migration 20260921200000).
//
// HVORFOR: påmindelsesmailene før webinaret nævner ikke tidspunktet; sessionerne
// ligger på forskellige tider (22/9 kl. 9, 13/10 kl. 11), og eWebinar skriver kun
// en DATO uden tid («09/22/2026»). Platformen kender session_tid pr. tilmelding
// (webinar_tilmeldinger) og skriver selv to profilfelter, altid sammen:
//   tb_naeste_webinar        «2026-10-13 11:00:00»  (dansk tid — Klaviyos datoform)
//   tb_naeste_webinar_tekst  «tirsdag 13. oktober kl. 11.00»
// Værdien er personens TIDLIGSTE kommende session (session_tid > nu) blandt alle
// personens rækker (samme mail; replay/null tæller ikke). Ingen kommende session
// → felterne FJERNES fra profilen (meta.patch_properties.unset).
//
// SAMME FORM SOM klaviyo-gensend-cron: HTTP-indgang, authenticateServiceRole FØRST
// bag verify_jwt = true (Bucket B), TØRKØRSEL SOM STANDARD — uden body regnes der
// og svares med tallene, men intet skrives hos Klaviyo og intet i tilstanden. Kun
// et eksplicit { "dry_run": false } skriver. Ukendte felter afvises med 400
// (kendteFelter.ts). «nu» kan gives ind (ISO). «email» begrænser kørslen til én
// person — beviset (én rigtig skrivning til én mail, læst tilbage i Klaviyo).
//
// KUN ÆNDRINGER SKRIVES: klaviyo_profil husker, hvad platformen sidst skrev pr.
// mail (tilstand OG spor: værdierne, udfald, status, ms, tidspunkter). Jobbet
// skriver kun, hvor det ønskede afviger (klaviyoDato.afviger). Første rigtige
// kørsel er derfor backfill for alle tilmeldte med en kommende session.
//
// DOMMEN bor i _shared/klaviyoDato.ts (ren: naesteSessionPrMail, profilVaerdier,
// afviger) og skrivningen i _shared/klaviyoProfil.ts (bygProfilKrop, skrivProfil —
// fail-closed på datoformen). Nøglen læses ét sted (klaviyoAfsendelse.ts,
// skrivProfilHvisNoegle). Her: hent, døm, skriv sekventielt inden for et
// tidsbudget under cron-timeouten; det, der ikke nås, hedder «udsat» og tages
// næste time. Klaviyos loft for /profile-import er 75/s — vi er langt under.
//
// ALARM (princip 1, 20/9): kald_edge er asynkron, så cron.job_run_details siger
// «succeeded», uanset om functionen svarede 500 — ingen så en kørsel med fejlede
// skrivninger. En RIGTIG kørsel med fejlede > 0 giver derfor en mail til
// raadgiverModtager (managedEmail) og en drift-klokke — samme vej som
// klaviyo-gensend-cron — men HØJST ÉN MAIL PR. DANSK KALENDERDØGN
// (profilAlarmNoegle bærer datoen; email_send_log slås op FØR afsendelsen).
// Svaret bærer feltet alarm: sendt · allerede_sendt_i_dag · ingen.
//
// KASTER ALDRIG mod én mail: fejler skrivningen for én, tælles den som fejlet,
// og de andre skrives. Vælter hele kørslen (databasen væk), er svaret 500.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { sendManagedEmail } from "../_shared/managedEmail.ts";
import { raadgiverModtager } from "../_shared/raadgiverModtager.ts";
import { indgangsMailHtml } from "../_shared/indgangsMail.ts";
import { skrivProfilHvisNoegle } from "../_shared/klaviyoAfsendelse.ts";
import { afviger, naesteSessionPrMail, profilVaerdier, type Profilvaerdier, type SidstSkrevet, type TilmeldingTid } from "../_shared/klaviyoDato.ts";
import { type FejletSkrivning, PROFIL_ALARM_KLOKKE_TYPE, PROFIL_ALARM_MAIL_LABEL, profilAlarmNoegle, profilAlarmTekst } from "../_shared/klaviyoProfil.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[klaviyo-profil-cron]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "email"] as const;

/** Tidsbudget for skrivningerne i én kørsel — cron-timeouten er 60 s (kald_edge, migrationen); hvert kald op til 3 s. */
export const BUDGET_MS = 45_000;
/** Højst så mange eksempler i svaret — resten står i klaviyo_profil. */
const EKSEMPLER_MAKS = 10;
const SIDE = 1000;

interface ProfilRaekke extends SidstSkrevet { email: string }

export interface ProfilResultat {
  ok: boolean;
  dry_run: boolean;
  nu: string;
  /** Kørslen begrænset til én mail (beviset) — ellers null. */
  email: string | null;
  /** Rækker i webinar_tilmeldinger med en session efter nu. */
  tilmeldinger_laest: number;
  /** Rækker i klaviyo_profil (det, platformen har skrevet før). */
  tilstand_laest: number;
  /** Personer med en kommende session. */
  med_kommende: number;
  /** Personer, der skal have felterne SAT (ny eller ændret værdi). */
  saet: number;
  /** Personer, der skal have felterne FJERNET (skrevet før, ingen kommende session nu). */
  fjern: number;
  /** Personer, hvor det, der står, allerede er det ønskede. */
  uaendret: number;
  /** Faktisk skrevet hos Klaviyo (0 i tørkørsel). */
  skrevet: number;
  lykkedes: number;
  fejlede: number;
  /** Ikke nået inden for budgettet — tages næste time. */
  udsat: number;
  /** De første ændringer, som de ville/blev sendt (uden kroppen). */
  eksempler: { email: string; handling: "saet" | "fjern"; tb_naeste_webinar: string | null; tb_naeste_webinar_tekst: string | null; udfald?: string }[];
  /** De fejlede skrivninger (mail, udfald, grund) — alle, ikke kun eksemplerne. */
  fejlede_liste: FejletSkrivning[];
  /** ingen · sendt · allerede_sendt_i_dag · fejlet: <grund>. Kun en rigtig kørsel med fejlede > 0 alarmerer. */
  alarm: string;
  fejl: string[];
}

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Hent alle rækker i sider — aldrig et tavst loft. */
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

export async function koerProfil(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date; email: string | null; startMs: number },
): Promise<ProfilResultat> {
  const r: ProfilResultat = {
    ok: true, dry_run: a.toerKoersel, nu: a.nu.toISOString(), email: a.email,
    tilmeldinger_laest: 0, tilstand_laest: 0, med_kommende: 0, saet: 0, fjern: 0, uaendret: 0,
    skrevet: 0, lykkedes: 0, fejlede: 0, udsat: 0, eksempler: [], fejlede_liste: [], alarm: "ingen", fejl: [],
  };

  // 1. Kommende sessioner — kun rækker med en tid efter nu (replay/null falder fra i SQL).
  const tilmeldinger = await alleSider<TilmeldingTid>((fra, til) => {
    let q = admin.from("webinar_tilmeldinger").select("email, session_tid").not("session_tid", "is", null).gt("session_tid", a.nu.toISOString());
    if (a.email) q = q.eq("email", a.email);
    return q.order("session_tid", { ascending: true }).order("email", { ascending: true }).range(fra, til);
  });
  r.tilmeldinger_laest = tilmeldinger.length;

  // 2. Det, platformen har skrevet før — så fjernelser og uændrede kan dømmes.
  const tilstand = await alleSider<ProfilRaekke>((fra, til) => {
    let q = admin.from("klaviyo_profil").select("email, tb_naeste_webinar, tb_naeste_webinar_tekst");
    if (a.email) q = q.eq("email", a.email);
    return q.order("email", { ascending: true }).range(fra, til);
  });
  r.tilstand_laest = tilstand.length;
  const sidst = new Map<string, SidstSkrevet>(tilstand.map((t) => [t.email, { tb_naeste_webinar: t.tb_naeste_webinar, tb_naeste_webinar_tekst: t.tb_naeste_webinar_tekst }]));

  // 3. Dommen: ønsket pr. mail, og kun afvigelser skrives.
  const naeste = naesteSessionPrMail(tilmeldinger, a.nu);
  r.med_kommende = naeste.size;
  const mails = new Set<string>([...naeste.keys(), ...sidst.keys()]);
  const plan: { email: string; oensket: Profilvaerdier | null }[] = [];
  for (const email of [...mails].sort()) {
    const oensket = profilVaerdier(naeste.get(email) ?? null);
    const foer = sidst.get(email) ?? null;
    if (!afviger(oensket, foer)) {
      if (oensket !== null || foer !== null) r.uaendret++;
      continue;
    }
    if (oensket === null) r.fjern++; else r.saet++;
    plan.push({ email, oensket });
  }
  for (const p of plan.slice(0, EKSEMPLER_MAKS)) {
    r.eksempler.push({ email: p.email, handling: p.oensket === null ? "fjern" : "saet", tb_naeste_webinar: p.oensket?.tb_naeste_webinar ?? null, tb_naeste_webinar_tekst: p.oensket?.tb_naeste_webinar_tekst ?? null });
  }
  if (a.toerKoersel) return r;

  // 4. Skrivningerne — sekventielt, inden for budgettet; hver skriver sin egen række i klaviyo_profil.
  for (const p of plan) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const svar = await skrivProfilHvisNoegle(admin, p.email, p.oensket, a.nu);
    r.skrevet++;
    if (svar.sendt) r.lykkedes++;
    else { r.fejlede++; r.fejlede_liste.push({ email: p.email, udfald: svar.spor.udfald, grund: svar.spor.grund }); }
    const eks = r.eksempler.find((e) => e.email === p.email);
    if (eks) eks.udfald = svar.spor.udfald;
  }

  // 5. Alarmen — kun en rigtig kørsel med fejlede > 0 (tørkørslen returnerede ovenfor).
  if (r.fejlede > 0) await skrivAlarm(admin, r.fejlede_liste, a.nu, r);

  r.ok = r.fejlede === 0;
  return r;
}

/** Alarmen: én mail pr. dansk kalenderdøgn (nøglen bærer datoen; loggen slås op først) og én klokke pr. døgn (titlen bærer datoen). */
async function skrivAlarm(admin: SupabaseClient, fejlede: readonly FejletSkrivning[], nu: Date, r: ProfilResultat): Promise<void> {
  const noegle = profilAlarmNoegle(nu);
  const tekst = profilAlarmTekst(fejlede, nu);

  try {
    const { data: fandtes, error: opslagFejl } = await admin.from("email_send_log")
      .select("message_id").eq("message_id", noegle).limit(1);
    if (opslagFejl) throw new Error(`email_send_log: ${opslagFejl.message}`);
    if ((fandtes ?? []).length > 0) {
      r.alarm = "allerede_sendt_i_dag";
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
        // Modtageren går uden om bounce-spærringen på kontakt@ (raadgiverModtager.ts, 18/9 → 19/10-2026).
        to: raadgiverModtager(nu),
        subject: tekst.emne,
        html,
        text: tekst.tekst,
        label: PROFIL_ALARM_MAIL_LABEL,
        idempotencyKey: noegle,
        metadata: { fejlede: fejlede.length, nu: nu.toISOString() },
      });
      r.alarm = res.sent ? "sendt" : `fejlet: ${res.reason}`;
      if (res.sent === false) console.error(`${LOG} alarmmailen blev ikke sendt: ${res.reason}`);
    }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    r.alarm = `fejlet: ${grund}`;
    r.fejl.push(`alarm: ${grund}`);
    console.error(`${LOG} alarmmailen kastede:`, grund);
  }

  // Klokken — vagtens form; dedup på titlen (reference_id er uuid og kan ikke bære en dato).
  const skrevet = await skrivRaadgiverBesked(admin, {
    type: PROFIL_ALARM_KLOKKE_TYPE,
    title: tekst.titel,
    body: tekst.tekst.slice(0, 2000),
    reference_type: "klaviyo_profil",
    reference_id: null,
  });
  if (skrevet.fejl.length > 0) r.fejl.push(`alarm_klokke: ${skrevet.fejl.join("; ")}`);
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
  let email: string | null = null;
  if (raaBody?.email !== undefined && raaBody?.email !== null) {
    const e = typeof raaBody.email === "string" ? raaBody.email.trim().toLowerCase() : "";
    if (!e.includes("@")) return json({ ok: false, fejl: [`«email» skal være én mailadresse — kørslen begrænses til den`] }, 400);
    email = e;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let resultat: ProfilResultat;
  try {
    resultat = await koerProfil(admin, { toerKoersel, nu, email, startMs });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  console.log(`${LOG} Summary:`, JSON.stringify({ ...resultat, eksempler: resultat.eksempler.length, fejlede_liste: resultat.fejlede_liste.length }));
  return json(resultat, resultat.ok ? 200 : 500);
});
