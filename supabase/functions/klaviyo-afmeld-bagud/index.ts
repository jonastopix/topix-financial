// klaviyo-afmeld-bagud — afmeldingerne, der ligger BAGUD (udkast 22/9-2026,
// ~/Downloads/recon-ewebinar-afmelding.md, ~/Downloads/udkast-ewebinar-afmelding/README.md).
//
// HVORFOR EN EGEN FUNCTION OG IKKE ET FLAG PÅ ewebinar-import (begrundelsen,
// som opgaven beder om):
//   1. DEN LÆSER VORES EGNE TABELLER, IKKE EWEBINARS API. Fejet spørger
//      webinar_tilmeldinger, webinar_haendelser og klaviyo_afmeldinger. Lagt i
//      ewebinar-import ville et rent internt fej hænge på EWEBINAR_API_KEY og
//      på at eWebinars REST-API svarer — en afhængighed, det ikke har.
//   2. TO JOBS, TO FEJLBILLEDER. ewebinar-import henter registranter og kan
//      sende fremmøde-hændelser; dens tilstande (maal · dry_run ·
//      send_fremmoede · session_dato) og dens værn er bygget om DET. Et
//      afmeld-flag ville give én function to formål og to måder at fejle på i
//      samme svar.
//   3. LÅSEN. Bagud-fejet er en engangshandling på rigtige menneskers samtykke
//      og skal bag app_config.klaviyo_afmeld_aktiv, som ga-send-cron og
//      meta-send-cron. ewebinar-import har ingen lås og skal ikke have en.
//
// ARBEJDSDELINGEN MED klaviyo-gensend-cron: gensenderen prøver det, der
// ALLEREDE er forsøgt (den læser klaviyo_afmeldinger og intet andet). DENNE
// function finder det, der ALDRIG er forsøgt — historikken fra før udrulningen
// — ved at læse eWebinar-siden. Ingen af dem gætter, og ingen af dem
// dublerer: begge går gennem den samme unikke regel i sporet.
//
// BUCKET B: authenticateServiceRole FØRST bag verify_jwt = true. TØRKØRSEL SOM
// STANDARD — uden body dømmes der og svares med listen, men intet sendes. Kun
// et eksplicit { "dry_run": false } OG en tændt lås sender. Ukendte felter
// afvises med 400 (kendteFelter.ts). «nu» kan gives ind (ISO) — tiden gives
// ind, den gættes ikke.
//
// KANDIDATEN er en mailadresse, der på eWebinar-siden står som afmeldt:
//   (a) en række i webinar_tilmeldinger med subscribed = Unsubscribed, ELLER
//   (b) en række i webinar_tilmeldinger med sidste_action = Unsubscribed, ELLER
//   (c) en hændelse i webinar_haendelser med action = Unsubscribed.
// (c) er med, fordi fletningen (webinarDom.fletTilmelding) lader en SENERE
// «Subscribed» vinde over en ældre afmelding i TILSTANDEN, mens loggen beholder
// hændelsen. Målt 22/9: 4 hændelser, 9 unikke mails i alt på tværs af de tre.
// Hvem der har afmeldt sig, afgøres af eWebinar — ikke af hvilken af vores to
// kolonner der tilfældigvis blev skrevet sidst.
//
// AFMELDT ÉN GANG = AFMELDT. Mails med en ok-række i klaviyo_afmeldinger
// springes over (vaelgGenafmeldinger) — også dem, Jonas afmeldte i hånden
// 22/9 kl. 11:18, så snart de har fået en ok-række. De 6 håndafmeldte HAR
// ingen række, så fejet vil afmelde dem igen hos Klaviyo. Det er harmløst:
// samme consent sættes til samme værdi, og så har vi sporet.
//
// KASTER ALDRIG mod én mail: fejler afmeldingen for én, tælles den som fejlet,
// og de andre sendes. Vælter hele kørslen (databasen væk), er svaret 500.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { afmeldHvisNoegle } from "../_shared/klaviyoAfsendelse.ts";
import { AFMELD_AARSAG, type AfmeldSporRaekke, vaelgGenafmeldinger } from "../_shared/klaviyoAfmelding.ts";
import { AFMELDT_ORD } from "../_shared/webinarAfmelding.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[klaviyo-afmeld-bagud]";

/** De felter, body'en må have. Alt andet afvises med 400 (bodyFelter.guard: STRIKS). */
export const KENDTE_FELTER = ["dry_run", "nu", "email"] as const;

/** app_config-nøglen. Standard false — bevisets lås, som ga_send_aktiv. */
export const AFMELD_LAAS_NOEGLE = "klaviyo_afmeld_aktiv";

/** Tidsbudget under cron-timeouten på 60 s; hvert kald op til 3 s. Resten hedder «udsat». */
export const BUDGET_MS = 45_000;
const SIDE = 1000;

export interface BagudResultat {
  ok: boolean;
  dry_run: boolean;
  /** app_config.klaviyo_afmeld_aktiv som læst (fail-closed). */
  laas_aktiv: boolean;
  /** Sender kørslen noget? dry_run: false OG låsen. */
  sender_rigtigt: boolean;
  nu: string;
  /** Kørslen begrænset til én mail (beviset) — ellers null. */
  email: string | null;
  /** Kandidater fra hver af de tre veje (en mail kan tælle i flere). */
  fra_subscribed: number;
  fra_sidste_action: number;
  fra_haendelse: number;
  /** Unikke mails, der STÅR som afmeldt på eWebinar-siden. */
  kandidater: number;
  /** Rækker læst i klaviyo_afmeldinger for de samme mails. */
  spor_laest: number;
  /** Har allerede en ok-række — springes over. */
  allerede_afmeldt: number;
  /** Forsøgt for nylig (under 5 min siden) — venter. */
  venter: number;
  /** Dem, kørslen vil afmelde (også i tørkørsel — det er listen, der skal læses). */
  afmeld: string[];
  /** Faktisk sendt (0 i tørkørsel eller med lukket lås). */
  sendt: number;
  lykkedes: number;
  fejlede: number;
  udsat: number;
  fejlede_liste: { email: string; udfald: string; grund: string | null; hvad_er_galt: string }[];
  fejl: string[];
}

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Låsen, fail-closed: kan den ikke læses, er den lukket (samme form som ga-send-cron). */
async function hentLaas(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from("app_config").select("config_value").eq("config_key", AFMELD_LAAS_NOEGLE).maybeSingle();
  if (error) {
    console.error(`${LOG} app_config (${AFMELD_LAAS_NOEGLE}) kunne ikke læses — låsen er lukket:`, error.message);
    return false;
  }
  const v = (data as { config_value?: unknown } | null)?.config_value ?? null;
  return v === true || v === "true";
}

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

export async function koerBagud(
  admin: SupabaseClient,
  a: { toerKoersel: boolean; nu: Date; email: string | null; startMs: number },
): Promise<BagudResultat> {
  const laas = await hentLaas(admin);
  const r: BagudResultat = {
    ok: true,
    dry_run: a.toerKoersel,
    laas_aktiv: laas,
    sender_rigtigt: !a.toerKoersel && laas,
    nu: a.nu.toISOString(),
    email: a.email,
    fra_subscribed: 0, fra_sidste_action: 0, fra_haendelse: 0,
    kandidater: 0, spor_laest: 0, allerede_afmeldt: 0, venter: 0,
    afmeld: [], sendt: 0, lykkedes: 0, fejlede: 0, udsat: 0, fejlede_liste: [], fejl: [],
  };

  // 1. eWebinar-siden — de tre veje. `ilike` uden jokertegn = lighed uden
  //    hensyn til store bogstaver, samme regel som webinarAfmelding (lower()).
  const tilmeldinger = await alleSider<{ email: string; subscribed: string | null; sidste_action: string | null }>((fra, til) => {
    let q = admin.from("webinar_tilmeldinger").select("email, subscribed, sidste_action")
      .or(`subscribed.ilike.${AFMELDT_ORD},sidste_action.ilike.${AFMELDT_ORD}`);
    if (a.email) q = q.eq("email", a.email);
    return q.order("email", { ascending: true }).range(fra, til);
  });
  const haendelser = await alleSider<{ email: string | null }>((fra, til) => {
    let q = admin.from("webinar_haendelser").select("email")
      .ilike("action", AFMELDT_ORD).not("email", "is", null);
    if (a.email) q = q.eq("email", a.email);
    return q.order("email", { ascending: true }).range(fra, til);
  });

  const kandidater = new Set<string>();
  for (const t of tilmeldinger) {
    const m = (t.email ?? "").trim().toLowerCase();
    if (!m) continue;
    if ((t.subscribed ?? "").trim().toLowerCase() === AFMELDT_ORD) r.fra_subscribed++;
    if ((t.sidste_action ?? "").trim().toLowerCase() === AFMELDT_ORD) r.fra_sidste_action++;
    kandidater.add(m);
  }
  for (const h of haendelser) {
    const m = (h.email ?? "").trim().toLowerCase();
    if (!m) continue;
    r.fra_haendelse++;
    kandidater.add(m);
  }
  r.kandidater = kandidater.size;
  if (kandidater.size === 0) return r;

  // 2. Sporet for netop de mails — hvem er allerede afmeldt?
  const liste = [...kandidater].sort();
  const spor = await alleSider<AfmeldSporRaekke>((fra, til) =>
    admin.from("klaviyo_afmeldinger").select("email, udfald, forsoegt_at")
      .in("email", liste).order("forsoegt_at", { ascending: true }).range(fra, til));
  r.spor_laest = spor.length;

  const valg = vaelgGenafmeldinger(liste, spor, a.nu);
  r.allerede_afmeldt = valg.afmeldt.length;
  r.venter = valg.venter.length;
  r.afmeld = valg.proev;

  // 3. Tørkørsel eller lukket lås: listen er svaret. Intet sendes.
  if (!r.sender_rigtigt) return r;

  // 4. Afsendelserne — sekventielt, inden for budgettet. Hver skriver sin række.
  for (const mail of valg.proev) {
    if (Date.now() - a.startMs > BUDGET_MS) { r.udsat++; continue; }
    const svar = await afmeldHvisNoegle(admin, { email: mail, kilde: "bagud", ewebinarId: null }, a.nu);
    r.sendt++;
    if (svar.sendt) r.lykkedes++;
    else {
      r.fejlede++;
      r.fejlede_liste.push({
        email: mail,
        udfald: svar.spor.udfald,
        grund: svar.spor.grund,
        hvad_er_galt: AFMELD_AARSAG[svar.spor.udfald] ?? "ukendt udfald",
      });
    }
  }
  return r;
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
    if (!e.includes("@")) return json({ ok: false, fejl: ["«email» skal være én mailadresse — kørslen begrænses til den"] }, 400);
    email = e;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let resultat: BagudResultat;
  try {
    resultat = await koerBagud(admin, { toerKoersel, nu, email, startMs });
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen væltede:`, grund);
    return json({ ok: false, dry_run: toerKoersel, nu: nu.toISOString(), fejl: [grund] }, 500);
  }
  console.log(`${LOG} Summary:`, JSON.stringify({ ...resultat, afmeld: resultat.afmeld.length, fejlede_liste: resultat.fejlede_liste.length }));
  return json(resultat, resultat.ok ? 200 : 500);
});
