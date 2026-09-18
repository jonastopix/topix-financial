/**
 * ansoegningMotor — IO-laget om de rene domme: læs rækken, udfør en
 * overgang (afgoerOvergang), annullér og planlæg trapper (rykkerkoe),
 * registrér en indsendelse (anbefaling), og lad ansøgningen BLIVE
 * virksomheden ved underskrift (virksomhedsOprettelse + det eksisterende
 * betalingsforløb). Alle kaldere — ansoegning-handling (rådgiveren),
 * ansoegning-link (ansøgeren), ansoegning-rykker-cron (køen),
 * calendly-webhook (bookingen), C's aftale-underskrift (e-signaturen) og
 * B's ansoegning-gem (indsendelsen) — går gennem DENNE fil, så trinnet
 * aldrig skrives to steder.
 *
 * SØMMENE (README §1–§3):
 *   B → motoren   registrerIndsendelse(id) efter at ansoegning-gem har sat
 *                 indsendt_at: anbefalingen skrives, rådgiveren får en
 *                 klokke. Idempotent (anbefaling sat = gjort).
 *   samtalen →    udfoerOvergang({art:"book"|"aflys_booking"}, samtale) fra
 *                 ansoegning-samtale (ansøgeren, token) og ansoegning-
 *                 handling (rådgiveren) — tiden vælges i PLATFORMEN og
 *                 oprettes i Calendly bagved (udkast 18/9). calendly-webhook
 *                 kalder det samme via "calendly" for de gamle links og for
 *                 aflysninger gjort i Calendly/Google.
 *   C → motoren   udfoerOvergang({art:"underskrevet"}, via "e_signatur")
 *                 når aftalen hører til en ansøgning — DEN konverterer
 *                 (B3/B4 + B7 + B8) i stedet for C's egen B7+B8.
 *   motoren → C   intet kald: «tilbud» tager aftale_url ind (C's
 *                 /aftale?token=… eller en PDF) og rykkerne linker dertil.
 *
 * SAMME ID: konverterTilVirksomhed giver opretEllerGenbrugVirksomhed
 * ansøgningens id, så companies.id = ansoegninger.id. Eneste undtagelse er
 * CVR-genbrug (en tidligere virksomhed på samme CVR): så peger company_id
 * på den — ingen dublet, ingen synk. Kontraktdatoer sættes ALDRIG her
 * (hjælperen tager dem ikke imod; stripe-webhook skriver dem ved betaling).
 *
 * OPTIMISTISK LÅS: opdateringen af trin filtrerer på det trin rækken havde
 * da den blev læst (.eq("trin", fra)). Rammer den 0 rækker, har en anden
 * kørsel været der først → 409, intet skrives, ingen trappe planlægges.
 * Sammen med UNIQUE på idempotensnoegle er det værnet mod to samtidige
 * kald (rådgiveren dobbeltklikker; Calendly gensender).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  erPaaPause,
  afgoerOvergang,
  type Handling,
  type Kilde,
  type Lukkeaarsag,
  type Trappe,
  type Trin,
} from "./ansoegningTrin.ts";
import { pauseTil, planlaegTrappe, type PlanlagtRaekke } from "./rykkerkoe.ts";
import { kbhTilUtc } from "./hverdage.ts";
import { afgoerAnbefaling, grundlagSomTekst, type Anbefaling, type AnbefalingsInput } from "./ansoegningAnbefaling.ts";
import { OMSAETNINGSINTERVALLER, type CvrVisning } from "./ansoegningSkema.ts";
import { opretEllerGenbrugVirksomhed } from "./virksomhedsOprettelse.ts";
import { udloesIndgangsBetalingsmail } from "./indgangsBetalingsmail.ts";
import { skrivRaadgiverBesked } from "./raadgiverBesked.ts";
import { afgoerDubletter, type DubletDom } from "./ansoegningDubletter.ts";
import { raadgiverMailOmNyAnsoegning } from "./ansoegningRaadgiverMail.ts";
import { sendManagedEmail } from "./managedEmail.ts";
import { KONTAKT_ADRESSE } from "./indgangsMail.ts";
import { bygRykkerMail, type MailKontekst } from "./ansoegningRykkerMails.ts";

export const APP_URL = "https://app.theboardroom.dk";
/** Ansøgerens side efter indsendelse (status, book, «ikke nu») — C/B bygger fladen; stien er kontrakten. */
export const ANSOEGER_STATUS_STI = "/ansoeg/status";
/** URL-parameteren — samme som B's formular (TOKEN_PARAM = "t"). */
export const TOKEN_PARAM = "t";

/** advisor_notifications.type for motorens klokker (reference_type "ansoegning"). */
export const RAADGIVER_BESKED = {
  ny: "ansoegning_ny",
  afholdt: "ansoegning_afholdt",
  lukket_af_koen: "ansoegning_lukket_af_koen",
  pause_slut: "ansoegning_pause_slut",
  underskrevet: "ansoegning_underskrevet",
} as const;
export const REFERENCE_TYPE = "ansoegning";

export type Via = "raadgiver" | "koe" | "calendly" | "ansoeger_link" | "e_signatur";

export interface AnsoegningRaekke {
  id: string;
  token: string;
  updated_at: string;
  indsendt_at: string | null;
  cvr_bekraeftet: boolean;
  trin: Trin;
  lukkeaarsag: Lukkeaarsag | null;
  /** Ventelisten (18/9): ancienniteten og den bløde udgave regnes fra afvisningen. */
  lukket_at: string | null;
  lukket_fra_trin: Trin | null;
  afslagsgrund: string | null;
  rykkere_sendt: number;
  trin_sat_at: string;
  paa_pause_til: string | null;
  company_id: string | null;
  konverteret_at: string | null;
  kilde: Kilde;
  kilde_raa: string | null;
  cvr: string | null;
  cvr_opslag: Partial<CvrVisning> & { cvr?: string } | null;
  hjemmeside: string | null;
  omsaetningsinterval: string | null;
  antal_ansatte: number | null;
  navn: string | null;
  email: string | null;
  telefon: string | null;
  udfordring: string | null;
  proevet: string | null;
  om_tolv_maaneder: string | null;
  start_tidspunkt: string | null;
  set_webinar: string | null;
  anbefaling: Anbefaling | null;
  samtale_start: string | null;
  samtale_slut: string | null;
  calendly_event_uri: string | null;
  /** Meet-linket fra Calendly-eventet (samtalen i kalenderen, 18/9 rev. 2). */
  samtale_link: string | null;
  pris_oere: number | null;
  aftale_url: string | null;
  note: string | null;
}

export const ANSOEGNING_KOLONNER = [
  "id", "token", "updated_at", "indsendt_at", "cvr_bekraeftet", "trin", "lukkeaarsag", "lukket_at", "lukket_fra_trin", "rykkere_sendt", "trin_sat_at",
  "paa_pause_til", "company_id", "konverteret_at", "kilde", "kilde_raa", "cvr", "cvr_opslag", "hjemmeside",
  "omsaetningsinterval", "antal_ansatte", "navn", "email", "telefon", "udfordring", "proevet", "om_tolv_maaneder",
  "start_tidspunkt", "set_webinar", "anbefaling", "samtale_start", "samtale_slut", "calendly_event_uri", "samtale_link",
  "pris_oere", "aftale_url", "note", "afslagsgrund",
].join(", ");

export async function hentAnsoegning(admin: SupabaseClient, id: string): Promise<AnsoegningRaekke | null> {
  const { data, error } = await admin.from("ansoegninger").select(ANSOEGNING_KOLONNER).eq("id", id).maybeSingle();
  if (error) {
    console.error("[ansoegningMotor] hentAnsoegning fejlede:", error.message);
    return null;
  }
  return (data as AnsoegningRaekke | null) ?? null;
}

// ── Rene hjælpere ──────────────────────────────────────────────────────────

/** CVR-registrets navn først, så ansøgerens eget, så mailen — aldrig tomt. */
export function virksomhedsnavnAf(a: Pick<AnsoegningRaekke, "cvr_opslag" | "navn" | "email">): string {
  const cvrNavn = typeof a.cvr_opslag?.navn === "string" ? a.cvr_opslag.navn.trim() : "";
  if (cvrNavn) return cvrNavn;
  const navn = (a.navn ?? "").trim();
  if (navn) return `${navn}s virksomhed`;
  return (a.email ?? "").trim() || "Ukendt virksomhed";
}

/** «Morten Larsen Hansen» → «Morten»; tomt → null. */
export function fornavnAf(navn: string | null | undefined): string | null {
  const t = (navn ?? "").trim();
  return t ? t.split(/\s+/)[0] : null;
}

export function ansoegerLink(token: string, appUrl: string = APP_URL): string {
  return `${appUrl}${ANSOEGER_STATUS_STI}?${TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

export function ikkeNuLink(token: string, appUrl: string = APP_URL): string {
  return `${ansoegerLink(token, appUrl)}&handling=ikke_nu`;
}
/** Ventelisten (udkast 18/9): «ja tak» og «nej tak» til en tilbudt plads — samme side, samme token, handlingen som parameter. */
export function tagPladsenLink(token: string, appUrl: string = APP_URL): string {
  return `${ansoegerLink(token, appUrl)}&handling=tag_pladsen`;
}
export function afslaaPladsenLink(token: string, appUrl: string = APP_URL): string {
  return `${ansoegerLink(token, appUrl)}&handling=afslaa_pladsen`;
}

export function bygAnbefalingsInput(a: AnsoegningRaekke, nu: Date): AnbefalingsInput {
  const o = a.cvr_opslag ?? {};
  return {
    omsaetningsnoegle: a.omsaetningsinterval,
    antalAnsatte: a.antal_ansatte,
    branche: typeof o.branche === "string" ? o.branche : null,
    stiftetAar: typeof o.stiftet_aar === "number" ? o.stiftet_aar : null,
    selskabsform: typeof o.selskabsform === "string" ? o.selskabsform : null,
    cvrStatus: typeof o.status === "string" ? o.status : null,
    setWebinar: a.set_webinar,
    kilde: a.kilde,
    kildeRaa: a.kilde_raa,
    udfordring: a.udfordring,
    proevet: a.proevet,
    omTolvMaaneder: a.om_tolv_maaneder,
    startTidspunkt: a.start_tidspunkt,
    nu,
  };
}

/** Mondays ordrette interval-label (B's OMSAETNINGSINTERVALLER) til application_context.revenue_interval. */
export function omsaetningsLabel(noegle: string | null): string | null {
  const o = OMSAETNINGSINTERVALLER.find((x) => x.noegle === noegle);
  return o ? o.monday : null;
}

// ── Indsendelsen (B → motoren) ─────────────────────────────────────────────

/** Kvitteringens vej: «sendt» straks · «reserve» = afsendelsen fejlede, køen tager den · «ingen_adresse» · «allerede» = indsendelsen var registreret i forvejen. */
export type KvitteringsUdfald = "sendt" | "reserve" | "ingen_adresse" | "allerede";

export type IndsendelsesResultat =
  | { ok: true; anbefaling: Anbefaling; allerede: boolean; kvittering: KvitteringsUdfald }
  | { ok: false; status: number; grund: string };

/** Mailkonteksten for kvitteringen — samme form som cronen bygger for køens mails (reserve-vejen), så de to veje giver samme mail. */
export function kvitteringsKontekst(a: AnsoegningRaekke): MailKontekst {
  return {
    fornavn: fornavnAf(a.navn),
    virksomhedsnavn: virksomhedsnavnAf(a),
    bookingUrl: ansoegerLink(a.token),
    statusUrl: ansoegerLink(a.token),
    ikkeNuUrl: ikkeNuLink(a.token),
    samtaleStart: null,
    aftaleUrl: null,
    token: a.token,
    manglerSvar: null,
    svar: { udfordring: a.udfordring, proevet: a.proevet, omTolvMaaneder: a.om_tolv_maaneder },
  };
}

/**
 * Kaldes af ansoegning-gem lige efter indsendt_at er sat (i samme proces —
 * ikke et HTTP-kald, samme grund som indgangsBetalingsmail.ts). Skriver
 * anbefalingen og giver rådgiveren en klokke. Idempotent: er anbefalingen
 * allerede sat, gøres intet. Fejler klokken, er indsendelsen stadig
 * registreret — den er en klokke, ikke en betingelse.
 */
export async function registrerIndsendelse(admin: SupabaseClient, id: string, nu: Date): Promise<IndsendelsesResultat> {
  const a = await hentAnsoegning(admin, id);
  if (!a) return { ok: false, status: 404, grund: "ansøgningen findes ikke" };
  if (!a.indsendt_at) return { ok: false, status: 409, grund: "ansøgningen er ikke indsendt" };
  if (a.anbefaling) return { ok: true, anbefaling: a.anbefaling, allerede: true, kvittering: "allerede" };

  const anbefaling = afgoerAnbefaling(bygAnbefalingsInput(a, nu));
  // Dubletter (Jonas 18/9, flow-gennemgangen §4-5): findes virksomheden eller mailen allerede
  // som medlem/kunde, eller er der en anden åben ansøgning på samme CVR? Ind i grundlaget, i
  // klokken og i mailen — og et rent «tal med dem» bliver «tvivl» (aldrig omvendt).
  const dubletter = await findDubletter(admin, a);
  if (dubletter.advarsler.length > 0) {
    anbefaling.grundlag.unshift(...dubletter.advarsler);
    anbefaling.imod.push(...dubletter.advarsler);
    if (dubletter.alvorlig && anbefaling.udfald === "tal_med_dem") anbefaling.udfald = "tvivl";
  }
  // CVR ikke slået op (fortsatte uden opslag, eller nøglen/kvoten var væk): sig det, så
  // rådgiveren ser HVORFOR der står «tvivl», og at navnet er ansøgerens eget.
  if (!a.cvr_opslag || a.cvr_opslag.kilde === "ansoeger") {
    anbefaling.grundlag.unshift("CVR ikke slået op — virksomhedsnavnet er ansøgerens eget");
  }
  // Kladdens påmindelse er overflødig nu — reaktionen (indsendelsen) annullerer trappen (regel 1).
  await annullerTrapper(admin, id, ["kladde"], "indsendt", nu);
  const { error } = await admin
    .from("ansoegninger")
    .update({ anbefaling, trin: "ny", trin_sat_at: a.indsendt_at, rykkere_sendt: 0 })
    .eq("id", id)
    .is("anbefaling", null);
  if (error) {
    console.error("[ansoegningMotor] registrerIndsendelse: update fejlede:", error.message);
    return { ok: false, status: 500, grund: error.message };
  }

  const navn = virksomhedsnavnAf(a);
  const udfald = anbefaling.udfald === "tal_med_dem" ? "tal med dem" : anbefaling.udfald;
  await skrivRaadgiverBesked(admin, {
    type: RAADGIVER_BESKED.ny,
    title: `${dubletter.alvorlig ? "OBS — " : ""}Ny ansøgning: ${navn}`,
    body: `Anbefaling: ${udfald}. ${grundlagSomTekst(anbefaling)}.`,
    reference_type: REFERENCE_TYPE,
    reference_id: a.id,
  });

  // Kvitteringen til ansøgeren — STRAKS. Jonas 18/9 (ordret): «Man skal have en kvittering med
  // det samme. Det giver sig selv.» Sendes synkront her, uden om køen og sendevinduet: den er
  // udløst af ansøgeren selv og generer ingen (vinduet er til for rykkerne). Samme mønster som
  // rådgivermailen nedenfor: idempotent på ansøgningens id, kaster aldrig. FEJLER afsendelsen
  // (429, udbyderen nede, ingen adresse), lægges den i køen som RESERVE — trappen «indsendt»,
  // dag 0 i vinduet, undtaget dagsreglen — så den går ved næste kørsel. Indsendelsen er
  // registreret uanset. Kvitteringens udfald gives tilbage, så skærmen siger det rigtige.
  let kvittering: KvitteringsUdfald = "ingen_adresse";
  if (a.email) {
    try {
      const mail = bygRykkerMail("ansoegning-kvittering", kvitteringsKontekst(a));
      if (!mail) throw new Error("skabelonen ansoegning-kvittering findes ikke");
      const res = await sendManagedEmail({
        adminClient: admin,
        to: a.email,
        subject: mail.emne,
        html: mail.html,
        text: mail.tekst,
        label: "ansoegning-kvittering",
        idempotencyKey: `ansoegning-kvittering-${a.id}`,
        replyTo: KONTAKT_ADRESSE,
        metadata: { ansoegning_id: a.id, vej: "straks" },
      });
      kvittering = res.sent ? "sendt" : "reserve";
      if (res.sent === false) console.error(`[ansoegningMotor] kvitteringen til ${a.id} kunne ikke sendes straks (${res.reason}) — lægges i køen som reserve`);
    } catch (err) {
      kvittering = "reserve";
      console.error(`[ansoegningMotor] kvitteringen til ${a.id} kastede — lægges i køen som reserve:`, err);
    }
    if (kvittering === "reserve") {
      try {
        const plan = planlaegTrappe({ ansoegningId: a.id, trappe: "indsendt", anker: nu, nu });
        const { skrevet } = await skrivPlan(admin, plan);
        if (skrevet === 0) console.warn(`[ansoegningMotor] reserve-kvitteringen blev ikke planlagt for ${a.id} (fandtes måske)`);
      } catch (err) {
        console.error("[ansoegningMotor] reserve-kvitteringen kunne ikke planlægges:", err);
      }
    }
  }

  // Besked til Jonas og Morten (Jonas 18/9): en mail til kontakt@ (viderestilles til Jonas) —
  // klokken forlader aldrig browseren (send-notification-email læser kun `notifications`, og
  // ADVISOR_EMAIL_DISABLED gælder medlemsnotifikationer). Sendes direkte, uden om køen:
  // idempotent på ansøgningens id. Fejler den, er indsendelsen stadig registreret.
  try {
    const mail = raadgiverMailOmNyAnsoegning({ ansoegning: a, anbefaling, dubletter, appUrl: APP_URL });
    const res = await sendManagedEmail({
      adminClient: admin,
      to: KONTAKT_ADRESSE,
      subject: mail.emne,
      html: mail.html,
      text: mail.tekst,
      label: "ansoegning-ny-raadgiver",
      idempotencyKey: `ansoegning-ny-raadgiver-${a.id}`,
      metadata: { ansoegning_id: a.id },
    });
    if (res.sent === false) console.error(`[ansoegningMotor] rådgivermail om ${a.id} ikke sendt: ${res.reason}`);
  } catch (err) {
    console.error("[ansoegningMotor] rådgivermail kastede:", err);
  }
  return { ok: true, anbefaling, allerede: false, kvittering };
}

/** Opslagene bag dubletdommen — ren dom i ansoegningDubletter.ts; her kun IO. Kaster aldrig. */
export async function findDubletter(admin: SupabaseClient, a: AnsoegningRaekke): Promise<DubletDom> {
  try {
    const email = (a.email ?? "").trim().toLowerCase();
    const [paaCvr, paaMail, andreAnsoegninger] = await Promise.all([
      a.cvr
        ? admin.from("companies").select("id, name, status, contract_end_date").eq("cvr_number", a.cvr).limit(3)
        : Promise.resolve({ data: [], error: null }),
      email
        ? admin.from("companies").select("id, name, status, contract_end_date").eq("contact_email", email).limit(3)
        : Promise.resolve({ data: [], error: null }),
      a.cvr
        ? admin.from("ansoegninger").select("id, navn, email, trin").eq("cvr", a.cvr).neq("id", a.id).not("indsendt_at", "is", null).not("trin", "in", "(lukket,underskrevet)").limit(3)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [paaCvr, paaMail, andreAnsoegninger]) if (r.error) console.error("[ansoegningMotor] dubletopslag fejlede:", r.error.message);
    return afgoerDubletter({
      virksomhederPaaCvr: (paaCvr.data ?? []) as { id: string; name: string; status: string | null; contract_end_date: string | null }[],
      virksomhederPaaMail: (paaMail.data ?? []) as { id: string; name: string; status: string | null; contract_end_date: string | null }[],
      andreAabneAnsoegninger: (andreAnsoegninger.data ?? []) as { id: string; navn: string | null; email: string | null; trin: string }[],
      nu: new Date(),
    });
  } catch (err) {
    console.error("[ansoegningMotor] findDubletter kastede:", err);
    return { advarsler: [], alvorlig: false, medlem: null };
  }
}

// ── Køen: annullér og planlæg ──────────────────────────────────────────────

/**
 * Formularens påmindelse som trappe (Jonas D6): B kalder den fra
 * ansoegning-gem ved «opret» og «gem» når rækken har en e-mail — forrige
 * kladde-række annulleres, én ny planlægges dag 2 fra sidste gem
 * (nøglen bærer ankeret, så et gem uden ændring af updated_at er harmløst).
 * Uden e-mail: kun annullering (ingen at skrive til). Kaster aldrig.
 */
export async function planlaegKladde(
  admin: SupabaseClient,
  a: Pick<AnsoegningRaekke, "id" | "email" | "updated_at" | "indsendt_at">,
  nu: Date,
): Promise<{ annulleret: number; planlagt: number }> {
  try {
    const annulleret = await annullerTrapper(admin, a.id, ["kladde"], "nyt gem", nu);
    if (a.indsendt_at || !a.email) return { annulleret, planlagt: 0 };
    const plan = planlaegTrappe({ ansoegningId: a.id, trappe: "kladde", anker: new Date(a.updated_at), nu });
    const { skrevet } = await skrivPlan(admin, plan);
    return { annulleret, planlagt: skrevet };
  } catch (err) {
    console.error("[ansoegningMotor] planlaegKladde fejlede (kladden er gemt):", err);
    return { annulleret: 0, planlagt: 0 };
  }
}

export async function annullerTrapper(
  admin: SupabaseClient,
  ansoegningId: string,
  hvilke: "alle" | readonly Trappe[],
  grund: string,
  nu: Date,
): Promise<number> {
  if (hvilke !== "alle" && hvilke.length === 0) return 0;
  let q = admin
    .from("planlagte_haendelser")
    .update({ status: "annulleret", annulleret_at: nu.toISOString(), annulleret_grund: grund })
    .eq("ansoegning_id", ansoegningId)
    .eq("status", "planlagt");
  if (hvilke !== "alle") q = q.in("trappe", [...hvilke]);
  const { data, error } = await q.select("id");
  if (error) {
    console.error("[ansoegningMotor] annullerTrapper fejlede:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Skriver planen; en række hvis idempotensnoegle findes, springes over (UNIQUE = dommeren). */
export async function skrivPlan(admin: SupabaseClient, raekker: PlanlagtRaekke[]): Promise<{ skrevet: number; fandtes: number }> {
  if (raekker.length === 0) return { skrevet: 0, fandtes: 0 };
  const { data, error } = await admin
    .from("planlagte_haendelser")
    .upsert(raekker, { onConflict: "idempotensnoegle", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[ansoegningMotor] skrivPlan fejlede:", error.message);
    throw new Error(`Kunne ikke planlægge trappen: ${error.message}`);
  }
  const skrevet = data?.length ?? 0;
  return { skrevet, fandtes: raekker.length - skrevet };
}

// ── Overgangen ─────────────────────────────────────────────────────────────

export interface Samtale {
  start: Date;
  slut: Date | null;
  /** Calendly-eventet (platformen opretter det selv nu; de gamle links satte det via webhooken). */
  eventUri: string | null;
  /** Meet-linket; undefined = rør ikke kolonnen (webhookens book kender det ikke). */
  moedeLink?: string | null;
}

export interface OvergangsArgs {
  ansoegning: AnsoegningRaekke;
  handling: Handling;
  via: Via;
  /** auth.uid for rådgiveren; null for systemet. */
  truffetAf: string | null;
  begrundelse?: string | null;
  nu: Date;
  /** Kun book: samtalens tid — platformens slot (eventUri fra opretBooking) eller, for gamle links, Calendlys. */
  samtale?: Samtale | null;
  /** Kun tilbud: linket til aftalegrundlaget (C's /aftale?token=… eller en PDF). */
  aftaleUrl?: string | null;
  /**
   * Start den nye trappe fra dette trin (recon-sammenhæng §2, 19/9): send-til-underskrift har
   * ALLEREDE sendt aftale-link-mailen med linket — køens dag 0 («Aftalegrundlaget for jeres
   * medlemskab», samme link) ville komme et kvarter senere. Med 1 springes dag 0 over; rykkerne
   * dag 2/5/9/14 og udløbet dag 21 kører som før. Samme mekanisme som aflysning (fraTrinNr i
   * dommen) — men valget er KALDERENS, for kun kalderen ved om mailen allerede er gået. Udeladt =
   * dommens eget fraTrinNr (aflysning) eller hele trappen.
   */
  startFraTrinNr?: number;
}

export type OvergangsResultat =
  | { ok: true; fra: Trin; til: Trin; annulleret: number; planlagt: number; konvertering: KonverteringsResultat | null }
  | { ok: false; status: number; grund: string };

export async function udfoerOvergang(admin: SupabaseClient, args: OvergangsArgs): Promise<OvergangsResultat> {
  const a = args.ansoegning;
  const { handling: h, nu } = args;
  if (!a.indsendt_at) return { ok: false, status: 409, grund: "ansøgningen er en kladde — ikke indsendt" };
  if (args.via === "raadgiver" && !args.truffetAf) return { ok: false, status: 401, grund: "rådgiverens id mangler" };
  if (h.art === "book" && !args.samtale) return { ok: false, status: 400, grund: "book kræver samtalens tid" };
  if (h.art === "tilbud" && !(args.aftaleUrl ?? a.aftale_url)) return { ok: false, status: 400, grund: "tilbud kræver aftale_url (linket til aftalegrundlaget)" };

  const dom = afgoerOvergang(a.trin, h, { paaPause: erPaaPause(a.paa_pause_til, nu), lukketFraTrin: a.lukket_fra_trin });
  if (dom.ok === false) return { ok: false, status: 409, grund: dom.grund };
  const o = dom.overgang;

  // Underskrift: virksomheden FØRST — fejler den, ændres intet.
  let konvertering: KonverteringsResultat | null = null;
  if (h.art === "underskrevet") {
    konvertering = await konverterTilVirksomhed(admin, a, nu);
    if (konvertering.ok === false) return { ok: false, status: 500, grund: konvertering.grund };
  }

  const trinSkifter = o.til !== a.trin || o.start !== null;
  const opd: Record<string, unknown> = { trin: o.til };
  if (trinSkifter) {
    opd.trin_sat_at = nu.toISOString();
    opd.rykkere_sendt = 0;
  }
  if (o.til === "lukket") {
    opd.lukkeaarsag = o.lukkeaarsag;
    opd.lukket_at = nu.toISOString();
    opd.lukket_af = args.truffetAf;
    opd.lukket_fra_trin = a.trin;
  } else if (a.trin === "lukket") {
    opd.lukkeaarsag = null;
    opd.lukket_at = null;
    opd.lukket_af = null;
    opd.lukket_fra_trin = null;
  }
  if (o.afslagsgrund) opd.afslagsgrund = o.afslagsgrund;
  if (o.saetPause) opd.paa_pause_til = o.pauseTil ?? pauseTil(nu);
  else if (o.ophaevPause) opd.paa_pause_til = null;
  if (h.art === "book" && args.samtale) {
    opd.samtale_start = args.samtale.start.toISOString();
    opd.samtale_slut = args.samtale.slut ? args.samtale.slut.toISOString() : null;
    opd.calendly_event_uri = args.samtale.eventUri;
    if (args.samtale.moedeLink !== undefined) opd.samtale_link = args.samtale.moedeLink;
  }
  if (h.art === "aflys_booking") {
    opd.samtale_start = null;
    opd.samtale_slut = null;
    opd.calendly_event_uri = null;
    opd.samtale_link = null;
  }
  if (h.art === "tilbud" && args.aftaleUrl) opd.aftale_url = args.aftaleUrl;
  if (konvertering && konvertering.ok) {
    opd.company_id = konvertering.company_id;
    opd.konverteret_at = nu.toISOString();
  }

  const { data: ramt, error: updErr } = await admin
    .from("ansoegninger")
    .update(opd)
    .eq("id", a.id)
    .eq("trin", a.trin)
    .select("id");
  if (updErr) {
    // 23505 = ansoegninger_samtale_start_uidx: to ansøgere valgte samme slot i samme sekund — databasen er dommeren (migration 18/9).
    if (updErr.code === "23505") return { ok: false, status: 409, grund: "tiden er lige blevet taget — vælg en anden" };
    console.error("[ansoegningMotor] udfoerOvergang: update fejlede:", updErr.message);
    return { ok: false, status: 500, grund: updErr.message };
  }
  if (!ramt || ramt.length === 0) return { ok: false, status: 409, grund: `ansøgningen står ikke længere på «${a.trin}» — læs den igen` };

  const annulleret = await annullerTrapper(admin, a.id, o.annuller, `${h.art} (${args.via})`, nu);

  const { error: besErr } = await admin.from("ansoegning_beslutninger").insert({
    ansoegning_id: a.id,
    handling: h.art,
    fra_trin: a.trin,
    til_trin: o.til,
    lukkeaarsag: o.lukkeaarsag,
    truffet_af: args.truffetAf,
    truffet_via: args.via,
    begrundelse: args.begrundelse ?? null,
    truffet_at: nu.toISOString(),
  });
  if (besErr) console.error("[ansoegningMotor] beslutning kunne ikke skrives (overgangen er udført):", besErr.message);

  let planlagt = 0;
  if (o.start) {
    // Pausens trappe ankres på slutdatoen (dansk midnat), så pause_slut lander dag 0 kl. 10 på en hverdag.
    const anker = o.start.anker === "samtale" ? args.samtale!.start : o.start.anker === "pause" ? kbhTilUtc(String(opd.paa_pause_til), 0, 0) : nu;
    const plan = planlaegTrappe({
      ansoegningId: a.id,
      trappe: o.start.trappe,
      anker,
      samtaleSlut: o.start.anker === "samtale" ? args.samtale!.slut : null,
      fraTrinNr: args.startFraTrinNr ?? o.start.fraTrinNr,
      nu,
    });
    planlagt = (await skrivPlan(admin, plan)).skrevet;
  }

  return { ok: true, fra: a.trin, til: o.til, annulleret, planlagt, konvertering };
}

// ── Underskrift → virksomheden (samme id) → det eksisterende betalingsforløb ──

export type KonverteringsResultat =
  | { ok: true; company_id: string; genbrugt: boolean; allerede: boolean; betalingslink_oprettet: boolean; mail: Record<string, unknown> }
  | { ok: false; grund: string };

/**
 * B3/B4 + B7 + B8 fra monday-webhook, med ansøgningens id som virksomhedens
 * id. Idempotent på company_betalingslink.ansoegning_id (partielt unikt):
 * findes linkrækken, er alt gjort. Dag 0 udløses i samme proces og fejler
 * aldrig konverteringen (virksomheden findes; mailen kan udløses igen).
 */
export async function konverterTilVirksomhed(admin: SupabaseClient, a: AnsoegningRaekke, nu: Date): Promise<KonverteringsResultat> {
  const { data: tidligere } = await admin
    .from("company_betalingslink")
    .select("company_id")
    .eq("ansoegning_id", a.id)
    .maybeSingle();
  if (tidligere?.company_id) {
    return { ok: true, company_id: tidligere.company_id, genbrugt: false, allerede: true, betalingslink_oprettet: false, mail: {} };
  }

  let companyId = a.company_id;
  let genbrugt = false;
  if (!companyId) {
    try {
      const oprettet = await opretEllerGenbrugVirksomhed(
        {
          company_name: virksomhedsnavnAf(a),
          cvr_number: a.cvr,
          website: a.hjemmeside || null,
          phone: a.telefon,
          industry_label: typeof a.cvr_opslag?.branche === "string" ? a.cvr_opslag.branche : null,
          current_situation: a.udfordring,
          goals: a.om_tolv_maaneder,
          help_needed: a.proevet,
          annual_revenue: null,
          revenue_interval: omsaetningsLabel(a.omsaetningsinterval),
          contact_name: a.navn,
          contact_email: a.email,
          application_date: a.indsendt_at ? a.indsendt_at.slice(0, 10) : null,
        },
        admin,
        { id: a.id },
      );
      companyId = oprettet.company_id;
      genbrugt = oprettet.genbrugt;
      console.log(`[ansoegningMotor] virksomhed ${genbrugt ? "genbrugt" : "oprettet"}: ${companyId} for ansøgning ${a.id}`);
      if (genbrugt) {
        // JONAS 18/9 (flow-gennemgangen §5-6): CVR-genbrug STOPPER konverteringen. Før blev
        // kontaktperson/mail/telefon på den eksisterende virksomhed overskrevet med ansøgerens,
        // og dag 0-betalingsmailen udløst — mod et betalende medlem. Nu: intet skrives, overgangen
        // «underskrevet» afvises, og rådgiveren får en klokke med hvad der skal gøres i hånden.
        const grund = `CVR ${a.cvr} findes allerede som virksomheden «${oprettet.company_name}» (${companyId}) — konverteringen er stoppet. Er det samme virksomhed, kobles ansøgningen i hånden; er det en ny, retter I CVR-nummeret først.`;
        // Pengekæden (C's recon 18/9, §4): den der lige har skrevet under, må IKKE få rykkere om at
        // skrive under, og køen må ikke lukke sagen «udløbet» dag 21. Aftalegrundlags-trappen annulleres;
        // ansøgningen bliver stående på aftalegrundlag_sendt, indtil et menneske kobler den.
        const annulleret = await annullerTrapper(admin, a.id, ["aftalegrundlag"], "konvertering stoppet: CVR findes som virksomhed", nu);
        await skrivRaadgiverBesked(admin, {
          type: RAADGIVER_BESKED.underskrevet,
          title: `Underskrift stoppet: ${virksomhedsnavnAf(a)}`,
          body: `${grund} Rykkerne om aftalegrundlaget er annulleret (${annulleret} rækker) — ansøgningen står på «aftalegrundlag sendt», til I har koblet den.`,
          reference_type: REFERENCE_TYPE,
          reference_id: a.id,
        });
        return { ok: false, grund };
      }
    } catch (err) {
      return { ok: false, grund: err instanceof Error ? err.message : String(err) };
    }
  }

  let linkOprettet = false;
  const { error: linkErr } = await admin.from("company_betalingslink").insert({
    company_id: companyId,
    prisniveau_oere: a.pris_oere,
    underskrevet_at: nu.toISOString(),
    ansoegning_id: a.id,
  });
  if (linkErr) {
    if (linkErr.code === "23505") {
      // PK (virksomheden har en linkrække fra før — CVR-genbrug) eller
      // ansoegning-indekset (racen): rækken findes, den bevares.
      console.log(`[ansoegningMotor] company_betalingslink findes allerede for ${companyId} — bevares`);
    } else {
      return { ok: false, grund: `Kunne ikke oprette betalingslink for ${companyId}: ${linkErr.message}` };
    }
  } else {
    linkOprettet = true;
  }

  let mail: Record<string, unknown> = {};
  try {
    const dag0 = await udloesIndgangsBetalingsmail(companyId, admin);
    mail = dag0.body;
    if (dag0.status !== 200) console.error(`[ansoegningMotor] dag 0 fejlede for ${companyId}:`, JSON.stringify(dag0.body));
  } catch (mailErr) {
    console.error(`[ansoegningMotor] dag 0 kastede for ${companyId} — udløs igen via send-indgangs-betalingsmail:`, mailErr);
    mail = { error: mailErr instanceof Error ? mailErr.message : String(mailErr) };
  }

  return { ok: true, company_id: companyId, genbrugt, allerede: false, betalingslink_oprettet: linkOprettet, mail };
}
